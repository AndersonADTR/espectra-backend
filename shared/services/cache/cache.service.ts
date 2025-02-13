// shared/services/cache/cache.service.ts

import Redis from 'ioredis';
import { Logger } from '@shared/utils/logger';
import { config } from '@shared/config/config.service';

export interface CacheOptions {
  ttl?: number;          // Tiempo de vida en segundos
  prefix?: string;       // Prefijo para las claves
  serialize?: boolean;   // Si se debe serializar el valor
}

export class CacheService {
  private static instance: CacheService;
  private readonly redis: Redis;
  private readonly logger: Logger;
  private readonly defaultOptions: Required<CacheOptions> = {
    ttl: 3600,           // 1 hora por defecto
    prefix: 'cache:',
    serialize: true
  };

  private constructor() {
    this.logger = new Logger('CacheService');
    this.redis = new Redis({
      host: config.getRequired<string>('REDIS_HOST'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.error('Redis connection failed multiple times');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis error', { error });
    });
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private getFullKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.defaultOptions.prefix;
    return `${finalPrefix}${key}`;
  }

  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key, options.prefix);
      const value = await this.redis.get(fullKey);

      if (!value) {
        return null;
      }

      return options.serialize ?? this.defaultOptions.serialize
        ? JSON.parse(value)
        : value as unknown as T;

    } catch (error) {
      this.logger.error('Error getting cache value', { error, key });
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, options.prefix);
      const ttl = options.ttl ?? this.defaultOptions.ttl;
      const shouldSerialize = options.serialize ?? this.defaultOptions.serialize;

      const finalValue = shouldSerialize ? JSON.stringify(value) : String(value);

      await this.redis.set(fullKey, finalValue, 'EX', ttl);
      return true;

    } catch (error) {
      this.logger.error('Error setting cache value', { error, key });
      return false;
    }
  }

  async delete(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, prefix);
      await this.redis.del(fullKey);
      return true;

    } catch (error) {
      this.logger.error('Error deleting cache value', { error, key });
      return false;
    }
  }

  async exists(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, prefix);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;

    } catch (error) {
      this.logger.error('Error checking cache key existence', { error, key });
      return false;
    }
  }

  async invalidateByPattern(pattern: string): Promise<boolean> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;

    } catch (error) {
      this.logger.error('Error invalidating cache by pattern', { error, pattern });
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.error('Error cleaning up cache service', { error });
    }
  }
}