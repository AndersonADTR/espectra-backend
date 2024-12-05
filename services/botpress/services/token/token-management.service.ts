// services/botpress/services/token/token-management.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ValidationError } from '@shared/utils/errors';

interface TokenUsage {
  userId: string;
  date: string;
  tokensUsed: number;
  tokensLimit: number;
  lastUpdated: string;
  planType: string;
}

interface TokenLimits {
  basic: number;
  pro: number;
  business: number;
  enterprise: number;
}

export class TokenManagementService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  private readonly TOKEN_LIMITS: TokenLimits = {
    basic: 50,
    pro: 100,
    business: 200,
    enterprise: Infinity
  };

  constructor() {
    this.logger = new Logger('TokenManagementService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.TOKEN_USAGE_TABLE || '';

    if (!this.tableName) {
      throw new Error('TOKEN_USAGE_TABLE environment variable is not set');
    }
  }

  async validateAndTrackTokens(
    userId: string,
    tokensToUse: number,
    planType: string
  ): Promise<boolean> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const usage = await this.getTokenUsage(userId, today);
      const tokenLimit = this.TOKEN_LIMITS[planType as keyof TokenLimits];

      if (!usage) {
        // Primer uso del día
        await this.createTokenUsage({
          userId,
          date: today,
          tokensUsed: tokensToUse,
          tokensLimit: tokenLimit,
          lastUpdated: new Date().toISOString(),
          planType
        });
        return true;
      }

      const newTotal = usage.tokensUsed + tokensToUse;

      // Actualizar uso de tokens
      await this.updateTokenUsage(userId, today, tokensToUse);

      // Registrar métricas
      this.metrics.recordMetric('TokensUsed', tokensToUse);
      this.metrics.recordMetric('TokensRemaining', tokenLimit - newTotal);

      if (newTotal > tokenLimit) {
        this.logger.warn('Token limit exceeded', {
          userId,
          planType,
          tokenLimit,
          tokensUsed: newTotal
        });

        // Registrar exceso para facturación
        await this.trackTokenOverage(userId, today, newTotal - tokenLimit);
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to validate and track tokens', {
        error,
        userId,
        tokensToUse
      });
      throw error;
    }
  }

  private async getTokenUsage(
    userId: string,
    date: string
  ): Promise<TokenUsage | null> {
    const result = await this.ddb.get({
      TableName: this.tableName,
      Key: { userId, date }
    });

    return (result.Item as TokenUsage) || null;
  }

  private async createTokenUsage(usage: TokenUsage): Promise<void> {
    await this.ddb.put({
      TableName: this.tableName,
      Item: usage
    });

    this.logger.info('Token usage record created', {
      userId: usage.userId,
      date: usage.date,
      tokensUsed: usage.tokensUsed
    });
  }

  private async updateTokenUsage(
    userId: string,
    date: string,
    additionalTokens: number
  ): Promise<void> {
    await this.ddb.update({
      TableName: this.tableName,
      Key: { userId, date },
      UpdateExpression: 'SET tokensUsed = tokensUsed + :tokens, lastUpdated = :timestamp',
      ExpressionAttributeValues: {
        ':tokens': additionalTokens,
        ':timestamp': new Date().toISOString()
      }
    });

    this.logger.info('Token usage updated', {
      userId,
      date,
      additionalTokens
    });
  }

  private async trackTokenOverage(
    userId: string,
    date: string,
    overageAmount: number
  ): Promise<void> {
    const overageTableName = process.env.TOKEN_OVERAGE_TABLE;
    if (!overageTableName) {
      this.logger.error('TOKEN_OVERAGE_TABLE not configured');
      return;
    }

    await this.ddb.put({
      TableName: overageTableName,
      Item: {
        userId,
        date,
        overageAmount,
        timestamp: new Date().toISOString()
      }
    });

    this.metrics.incrementCounter('TokenOverageEvents');
  }

  async generateTokenReport(userId: string, startDate: string, endDate: string): Promise<{
    totalTokens: number;
    dailyUsage: Record<string, number>;
    overages: Record<string, number>;
  }> {
    try {
      const usage = await this.ddb.query({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :userId AND #date BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#date': 'date'
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':start': startDate,
          ':end': endDate
        }
      });

      const dailyUsage: Record<string, number> = {};
      let totalTokens = 0;

      usage.Items?.forEach(item => {
        const { date, tokensUsed } = item as TokenUsage;
        dailyUsage[date] = tokensUsed;
        totalTokens += tokensUsed;
      });

      // Obtener overages si existen
      const overages = await this.getOverages(userId, startDate, endDate);

      return {
        totalTokens,
        dailyUsage,
        overages
      };
    } catch (error) {
      this.logger.error('Failed to generate token report', {
        error,
        userId,
        startDate,
        endDate
      });
      throw error;
    }
  }

  private async getOverages(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    const overageTableName = process.env.TOKEN_OVERAGE_TABLE;
    if (!overageTableName) {
      return {};
    }

    const result = await this.ddb.query({
      TableName: overageTableName,
      KeyConditionExpression: 'userId = :userId AND #date BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#date': 'date'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':start': startDate,
        ':end': endDate
      }
    });

    const overages: Record<string, number> = {};
    result.Items?.forEach(item => {
      overages[item.date] = item.overageAmount;
    });

    return overages;
  }
}