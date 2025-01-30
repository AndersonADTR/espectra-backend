// services/botpress/middleware/rate-limit.middleware.ts

import { createClient, RedisClientType } from 'redis';
import { promisify } from 'util';
import { BaseService } from '../services/base/base.service';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const DEFAULT_LIMITS = {
  basic: { windowMs: 60000, maxRequests: 30 },     // 30 requests per minute
  pro: { windowMs: 60000, maxRequests: 60 },       // 60 requests per minute
  business: { windowMs: 60000, maxRequests: 120 },  // 120 requests per minute
  enterprise: { windowMs: 60000, maxRequests: 300 } // 300 requests per minute
};

export class RateLimitMiddleware extends BaseService {
  private readonly redis: RedisClientType;
  private readonly getAsync: (key: string) => Promise<string | null>;
  private readonly incrAsync: (key: string) => Promise<number>;
  private readonly expireAsync: (key: string, seconds: number) => Promise<number>;

  constructor() {
    super('RateLimitMiddleware');
    
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.redis = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 60) {
            return new Error('Retry time exhausted');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });
    this.redis.connect();

    this.getAsync = promisify(this.redis.get).bind(this.redis);
    this.incrAsync = promisify(this.redis.incr).bind(this.redis);
    this.expireAsync = promisify(this.redis.expire).bind(this.redis);
  }

  async checkRateLimit(userId: string, planType: string = 'basic'): Promise<boolean> {
    try {
      const config = this.getLimitConfig(planType);
      const key = this.getRateLimitKey(userId, config);
      
      let current = await this.getAsync(key);
      
      if (!current) {
        await this.incrAsync(key);
        await this.expireAsync(key, config.windowMs / 1000);
        return true;
      }

      const count = parseInt(current);
      if (count >= config.maxRequests) {
        this.metrics.incrementCounter('RateLimitExceeded');
        return false;
      }

      await this.incrAsync(key);
      return true;
    } catch (error) {
      this.logger.error('Rate limit check failed', {
        error,
        userId,
        planType
      });
      
      // En caso de error, permitir la petición
      return true;
    }
  }

  async getRateLimitStatus(userId: string, planType: string = 'basic'): Promise<{
    remaining: number;
    reset: number;
  }> {
    try {
      const config = this.getLimitConfig(planType);
      const key = this.getRateLimitKey(userId, config);
      
      const current = await this.getAsync(key);
      const count = current ? parseInt(current) : 0;
      
      const ttl = await promisify(this.redis.ttl).bind(this.redis)(key);
      
      return {
        remaining: Math.max(0, config.maxRequests - count),
        reset: Math.max(0, ttl)
      };
    } catch (error) {
      this.logger.error('Failed to get rate limit status', {
        error,
        userId,
        planType
      });
      
      return {
        remaining: 1,
        reset: 0
      };
    }
  }

  private getLimitConfig(planType: string): RateLimitConfig {
    const limits = DEFAULT_LIMITS[planType as keyof typeof DEFAULT_LIMITS] || 
                  DEFAULT_LIMITS.basic;

    return {
      ...limits,
      keyPrefix: `ratelimit:chat:`
    };
  }

  private getRateLimitKey(userId: string, config: RateLimitConfig): string {
    const window = Math.floor(Date.now() / config.windowMs);
    return `${config.keyPrefix}${userId}:${window}`;
  }
}