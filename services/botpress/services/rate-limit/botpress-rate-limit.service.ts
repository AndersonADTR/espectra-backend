// services/botpress/services/rate-limit/botpress-rate-limit.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  basic: {
    windowMs: 60000, // 1 minuto
    maxRequests: 30
  },
  pro: {
    windowMs: 60000,
    maxRequests: 60
  },
  business: {
    windowMs: 60000,
    maxRequests: 120
  },
  enterprise: {
    windowMs: 60000,
    maxRequests: 300
  }
};

export class BotpressRateLimitService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    this.logger = new Logger('BotpressRateLimitService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.BOTPRESS_RATE_LIMIT_TABLE || '';

    if (!this.tableName) {
      throw new Error('BOTPRESS_RATE_LIMIT_TABLE environment variable is not set');
    }
  }

  async checkRateLimit(userId: string, planType: string): Promise<boolean> {
    try {
      const config = RATE_LIMITS[planType] || RATE_LIMITS.basic;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Obtener conteo de solicitudes en la ventana de tiempo
      const result = await this.ddb.query({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :userId AND #timestamp >= :start',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':start': windowStart
        }
      });

      const requestCount = result.Items?.length || 0;

      // Registrar métricas
      this.metrics.recordMetric('RequestRate', requestCount);
      
      if (requestCount >= config.maxRequests) {
        this.metrics.incrementCounter('RateLimitExceeded');
        this.logger.warn('Rate limit exceeded', {
          userId,
          planType,
          requestCount,
          limit: config.maxRequests
        });
        return false;
      }

      // Registrar nueva solicitud
      await this.recordRequest(userId, now);
      return true;
    } catch (error) {
      this.logger.error('Failed to check rate limit', {
        error,
        userId,
        planType
      });
      throw new BotpressError('Failed to check rate limit');
    }
  }

  private async recordRequest(userId: string, timestamp: number): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          userId,
          timestamp,
          ttl: Math.floor(timestamp / 1000) + 3600 // 1 hora TTL
        }
      });
    } catch (error) {
      this.logger.error('Failed to record request', {
        error,
        userId
      });
      throw new BotpressError('Failed to record request');
    }
  }

  async getRateLimitStatus(userId: string, planType: string): Promise<{
    remainingRequests: number;
    resetTime: number;
  }> {
    try {
      const config = RATE_LIMITS[planType] || RATE_LIMITS.basic;
      const now = Date.now();
      const windowStart = now - config.windowMs;

      const result = await this.ddb.query({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :userId AND #timestamp >= :start',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':start': windowStart
        }
      });

      const requestCount = result.Items?.length || 0;
      const remainingRequests = Math.max(0, config.maxRequests - requestCount);

      // Encontrar el tiempo de reset basado en la primera solicitud en la ventana
      const oldestRequest = result.Items?.[0]?.timestamp || now;
      const resetTime = oldestRequest + config.windowMs;

      return {
        remainingRequests,
        resetTime
      };
    } catch (error) {
      this.logger.error('Failed to get rate limit status', {
        error,
        userId,
        planType
      });
      throw new BotpressError('Failed to get rate limit status');
    }
  }
}