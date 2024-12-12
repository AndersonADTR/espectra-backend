// services/botpress/services/cache/cache.service.ts

import { Redis } from 'ioredis';
import { BaseService } from '../base/base.service';
import { CacheConfig, CacheEntry } from '../../types/cache.types';
import { BotpressError } from '../../utils/errors';

export class CacheService extends BaseService {
  private readonly redis: Redis;
  private readonly defaultConfig: CacheConfig = {
    ttl: 3600, // 1 hora por defecto
    prefix: 'spectra:botpress:'
  };

  constructor(config?: Partial<CacheConfig>) {
    super('CacheService');
    
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.redis = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.defaultConfig = {
      ...this.defaultConfig,
      ...config
    };

    this.setupRedisEvents();
  }

  private setupRedisEvents(): void {
    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', { error });
      this.metrics.incrementCounter('CacheConnectionErrors');
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const data = await this.redis.get(fullKey);

      if (!data) {
        this.metrics.incrementCounter('CacheMisses');
        return null;
      }

      const cacheEntry: CacheEntry<T> = JSON.parse(data);
      
      this.metrics.incrementCounter('CacheHits');
      
      return cacheEntry.data;
    } catch (error) {
      this.logger.error('Cache get error', { error, key });
      this.metrics.incrementCounter('CacheErrors');
      throw new BotpressError('Failed to get from cache', { originalError: error });
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const cacheEntry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttl || this.defaultConfig.ttl
      };

      await this.redis.set(
        fullKey,
        JSON.stringify(cacheEntry),
        'EX',
        cacheEntry.ttl
      );

      this.metrics.incrementCounter('CacheWrites');
    } catch (error) {
      this.logger.error('Cache set error', { error, key });
      this.metrics.incrementCounter('CacheErrors');
      throw new BotpressError('Failed to set in cache', { originalError: error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.redis.del(fullKey);
      
      this.metrics.incrementCounter('CacheDeletes');
    } catch (error) {
      this.logger.error('Cache delete error', { error, key });
      this.metrics.incrementCounter('CacheErrors');
      throw new BotpressError('Failed to delete from cache', { originalError: error });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.logger.error('Cache exists error', { error, key });
      this.metrics.incrementCounter('CacheErrors');
      throw new BotpressError('Failed to check cache existence', { originalError: error });
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      const fullPattern = this.getFullKey(pattern || '*');
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      this.metrics.recordMetric('CacheKeysCleared', keys.length);
    } catch (error) {
      this.logger.error('Cache clear error', { error, pattern });
      this.metrics.incrementCounter('CacheErrors');
      throw new BotpressError('Failed to clear cache', { originalError: error });
    }
  }

  private getFullKey(key: string): string {
    return `${this.defaultConfig.prefix}${key}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Cache health check failed', { error });
      return false;
    }
  }

  // Método para cerrar la conexión (útil para tests y cleanup)
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}