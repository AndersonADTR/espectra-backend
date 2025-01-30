// services/botpress/services/cache/handoff-cache.service.ts

import { Redis } from 'ioredis';
import { HandoffQueue } from '../../types/handoff.types';
import { HANDOFF_CACHE, HANDOFF_CONSTANTS } from '../../config/handoff.config';
import { BaseService } from '../base/base.service';

export class HandoffCacheService extends BaseService {
  private readonly redis: Redis;

  constructor() {
    super('HandoffCacheService', HANDOFF_CONSTANTS.METRICS.NAMESPACE);
    
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
      this.handleError(error as Error, 'Failed to cache queue item', { 
        operationName: 'CacheQueueItem',
        queueId: queueItem.queueId,
      });
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
      this.handleError(error as Error, 'Failed to get cached queue item', { 
        operationName: 'CacheReadErrors',
        queueId: queueId,
      });
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
      this.handleError(error as Error, 'Failed to cache advisor status', {
        operationName: 'CacheAdvisorStatus',
        advisorId
      });
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
      this.handleError(error as Error, 'Failed to get cached advisor status', {
        operationName: 'GetCacheAdvisorStatus',
        advisorId
      });
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
      this.handleError(error as Error, 'Failed to cache metrics', {
        operationName: 'CacheMetrics',
        metricKey
      });
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
      this.handleError(error as Error, 'Failed to get cached metrics', {
        operationName: 'GetCachedMetrics',
        metricKey
      });
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
      this.handleError(error as Error, 'Failed to invalidate cache', {
        operationName: 'InvalidateCache',
        pattern
      });
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