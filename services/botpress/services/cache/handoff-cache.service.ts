// services/botpress/services/cache/handoff-cache.service.ts

import { ElastiCache, CreateReplicationGroupCommand } from '@aws-sdk/client-elasticache';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { Redis } from 'ioredis';
import { HandoffQueue } from '../../types/handoff.types';
import { HANDOFF_CACHE, HANDOFF_CONSTANTS } from '../../config/handoff.config';

export class HandoffCacheService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly redis: Redis;

  constructor() {
    this.logger = new Logger('HandoffCacheService');
    this.metrics = new MetricsService(HANDOFF_CONSTANTS.METRICS.NAMESPACE);
    
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.redis = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.setupRedisEvents();
  }

  private setupRedisEvents(): void {
    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', { error });
      this.metrics.incrementCounter('RedisCacheErrors');
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });
  }

  async cacheQueueItem(queueItem: HandoffQueue): Promise<void> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.QUEUE_PREFIX}${queueItem.queueId}`;
      
      await this.redis.setex(
        key,
        HANDOFF_CACHE.TTL.QUEUE_ITEM,
        JSON.stringify(queueItem)
      );

      this.metrics.incrementCounter('CacheWrites');
      
      this.logger.debug('Queue item cached', {
        queueId: queueItem.queueId,
        ttl: HANDOFF_CACHE.TTL.QUEUE_ITEM
      });
    } catch (error) {
      this.logger.error('Failed to cache queue item', {
        error,
        queueId: queueItem.queueId
      });
      this.metrics.incrementCounter('CacheWriteErrors');
      throw error;
    }
  }

  async getCachedQueueItem(queueId: string): Promise<HandoffQueue | null> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.QUEUE_PREFIX}${queueId}`;
      const cached = await this.redis.get(key);

      this.metrics.incrementCounter('CacheReads');

      if (!cached) {
        this.logger.debug('Cache miss for queue item', { queueId });
        this.metrics.incrementCounter('CacheMisses');
        return null;
      }

      this.logger.debug('Cache hit for queue item', { queueId });
      this.metrics.incrementCounter('CacheHits');
      
      return JSON.parse(cached) as HandoffQueue;
    } catch (error) {
      this.logger.error('Failed to get cached queue item', {
        error,
        queueId
      });
      this.metrics.incrementCounter('CacheReadErrors');
      throw error;
    }
  }

  async cacheAdvisorStatus(
    advisorId: string,
    status: { 
      isAvailable: boolean;
      activeHandoffs: number;
      lastUpdated: string;
    }
  ): Promise<void> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.ADVISOR_PREFIX}${advisorId}`;
      
      await this.redis.setex(
        key,
        HANDOFF_CACHE.TTL.ADVISOR_STATUS,
        JSON.stringify(status)
      );

      this.metrics.incrementCounter('AdvisorStatusCacheWrites');
      
      this.logger.debug('Advisor status cached', {
        advisorId,
        status
      });
    } catch (error) {
      this.logger.error('Failed to cache advisor status', {
        error,
        advisorId
      });
      this.metrics.incrementCounter('AdvisorStatusCacheErrors');
      throw error;
    }
  }

  async getCachedAdvisorStatus(advisorId: string): Promise<{
    isAvailable: boolean;
    activeHandoffs: number;
    lastUpdated: string;
  } | null> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.ADVISOR_PREFIX}${advisorId}`;
      const cached = await this.redis.get(key);

      if (!cached) {
        this.logger.debug('Cache miss for advisor status', { advisorId });
        return null;
      }

      return JSON.parse(cached);
    } catch (error) {
      this.logger.error('Failed to get cached advisor status', {
        error,
        advisorId
      });
      throw error;
    }
  }

  async cacheMetrics(
    metricKey: string,
    data: Record<string, any>,
    ttl: number = HANDOFF_CACHE.TTL.METRICS
  ): Promise<void> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.METRICS_PREFIX}${metricKey}`;
      
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(data)
      );

      this.logger.debug('Metrics cached', {
        metricKey,
        ttl
      });
    } catch (error) {
      this.logger.error('Failed to cache metrics', {
        error,
        metricKey
      });
      throw error;
    }
  }

  async getCachedMetrics<T>(metricKey: string): Promise<T | null> {
    try {
      const key = `${HANDOFF_CACHE.KEYS.METRICS_PREFIX}${metricKey}`;
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as T;
    } catch (error) {
      this.logger.error('Failed to get cached metrics', {
        error,
        metricKey
      });
      throw error;
    }
  }

  async invalidateCache(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        this.logger.info('Cache invalidated', {
          pattern,
          keysRemoved: keys.length
        });
      }
    } catch (error) {
      this.logger.error('Failed to invalidate cache', {
        error,
        pattern
      });
      throw error;
    }
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
}