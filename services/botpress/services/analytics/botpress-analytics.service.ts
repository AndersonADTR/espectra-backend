// services/botpress/services/analytics/botpress-analytics.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { BotpressAnalytics, NLUResult } from '../../types/botpress.types';
import { BaseService } from '../base/base.service';

export class BotpressAnalyticsService extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly analyticsTable: string;
  private readonly nluTable: string;

  constructor() {
    super('BotpressAnalyticsService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    
    this.analyticsTable = process.env.BOTPRESS_ANALYTICS_TABLE || '';
    this.nluTable = process.env.BOTPRESS_NLU_TABLE || '';

    if (!this.analyticsTable || !this.nluTable) {
      throw new Error('Required environment variables are not set');
    }
  }

  async trackInteraction(data: {
    userId: string;
    messageId: string;
    type: string;
    intent?: string;
    handoff?: boolean;
    success?: boolean;
    duration?: number;
    nluResult?: NLUResult;
  }): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      
      await this.ddb.put({
        TableName: this.analyticsTable,
        Item: {
          userId: data.userId,
          messageId: data.messageId,
          timestamp,
          type: data.type,
          intent: data.intent,
          handoff: data.handoff,
          success: data.success,
          duration: data.duration,
          date: timestamp.split('T')[0]
        }
      });

      // Si hay resultados de NLU, guardarlos separadamente
      if (data.nluResult) {
        await this.trackNLUResult(data.messageId, data.nluResult);
      }

      // Registrar métricas
      this.metrics.incrementCounter(`BotInteraction_${data.type}`);
      if (data.handoff) {
        this.metrics.incrementCounter('HandoffRequests');
      }
      if (data.duration) {
        this.metrics.recordLatency('InteractionDuration', data.duration);
      }

      this.logger.info('Interaction tracked successfully', {
        userId: data.userId,
        messageId: data.messageId,
        type: data.type
      });
    } catch (error) {
      this.handleError(error as Error, 'Failed to track interaction', {
        operationName: 'TrackInteraction',
        userId: data.userId,
        messageId: data.messageId
      });
    }
  }

  private async trackNLUResult(messageId: string, nluResult: NLUResult): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.nluTable,
        Item: {
          messageId,
          timestamp: new Date().toISOString(),
          ...nluResult
        }
      });

      this.metrics.recordMetric('NLUConfidence', nluResult.intent.confidence);
    } catch (error) {
      this.logger.error('Failed to track NLU result', {
        error,
        messageId
      });
      // No relanzamos el error para no interrumpir el flujo principal
    }
  }

  async generateAnalytics(timeRange: {
    startDate: string;
    endDate: string;
  }): Promise<BotpressAnalytics> {
    try {
      const [interactions, nluResults] = await Promise.all([
        this.queryInteractions(timeRange),
        this.queryNLUResults(timeRange)
      ]);

      const analytics = this.calculateAnalytics(interactions, nluResults);

      this.logger.info('Analytics generated successfully', {
        timeRange,
        messageCount: analytics.messageCount
      });

      return analytics;
    } catch (error) {
      this.handleError(error as Error, 'Failed to generate analytics', {
        operationName: 'GenerateAnalytics',
        timeRange: timeRange
      });
    }
  }

  private async queryInteractions(timeRange: { startDate: string; endDate: string }) {
    const result = await this.ddb.query({
      TableName: this.analyticsTable,
      KeyConditionExpression: '#date BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#date': 'date'
      },
      ExpressionAttributeValues: {
        ':start': timeRange.startDate,
        ':end': timeRange.endDate
      }
    });

    return result.Items || [];
  }

  private async queryNLUResults(timeRange: { startDate: string; endDate: string }) {
    const result = await this.ddb.query({
      TableName: this.nluTable,
      KeyConditionExpression: '#timestamp BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp'
      },
      ExpressionAttributeValues: {
        ':start': timeRange.startDate,
        ':end': timeRange.endDate
      }
    });

    return result.Items || [];
  }

  private calculateAnalytics(interactions: any[], nluResults: any[]): BotpressAnalytics {
    const uniqueUsers = new Set(interactions.map(i => i.userId));
    const uniqueSessions = new Set(interactions.map(i => i.sessionId));
    const handoffs = interactions.filter(i => i.handoff);
    const successfulInteractions = interactions.filter(i => i.success);

    // Calcular intents más comunes
    const intentCounts = nluResults.reduce((acc, curr) => {
      const intent = curr.intent.name;
      if (!acc[intent]) {
        acc[intent] = { count: 0, confidenceSum: 0 };
      }
      acc[intent].count++;
      acc[intent].confidenceSum += curr.intent.confidence;
      return acc;
    }, {} as Record<string, { count: number; confidenceSum: number; }>);

    const topIntents = Object.entries(intentCounts)
      .map(([intent, data]) => ({
        intent,
        count: (data as { count: number; confidenceSum: number }).count,
        confidence: (data as { count: number; confidenceSum: number }).confidenceSum / (data as { count: number; confidenceSum: number }).count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      messageCount: interactions.length,
      userCount: uniqueUsers.size,
      sessionCount: uniqueSessions.size,
      retentionRate: this.calculateRetentionRate(interactions),
      averageSessionDuration: this.calculateAverageSessionDuration(interactions),
      topIntents,
      handoffRate: handoffs.length / interactions.length,
      successRate: successfulInteractions.length / interactions.length
    };
  }

  private calculateRetentionRate(interactions: any[]): number {
    try {
      // Agrupar interacciones por usuario y fecha
      const userInteractionsByDate = new Map<string, Set<string>>();
      
      interactions.forEach(interaction => {
        const date = interaction.timestamp.split('T')[0];
        const userId = interaction.userId;
        
        if (!userInteractionsByDate.has(date)) {
          userInteractionsByDate.set(date, new Set());
        }
        userInteractionsByDate.get(date)?.add(userId);
      });
  
      // Ordenar fechas cronológicamente
      const dates = Array.from(userInteractionsByDate.keys()).sort();
      
      if (dates.length < 2) return 0;
  
      // Calcular usuarios que regresan
      let totalRetentionRate = 0;
      let daysWithRetention = 0;
  
      for (let i = 1; i < dates.length; i++) {
        const previousUsers = userInteractionsByDate.get(dates[i-1]) || new Set();
        const currentUsers = userInteractionsByDate.get(dates[i]) || new Set();
        
        const returningUsers = Array.from(currentUsers)
          .filter(user => previousUsers.has(user)).length;
        
        if (previousUsers.size > 0) {
          const dailyRetentionRate = returningUsers / previousUsers.size;
          totalRetentionRate += dailyRetentionRate;
          daysWithRetention++;
        }
      }
  
      // Retornar la tasa promedio de retención
      return daysWithRetention > 0 ? 
        (totalRetentionRate / daysWithRetention) * 100 : 0;
    } catch (error) {
      this.logger.error('Error calculating retention rate', { error });
      return 0;
    }
  }

  private calculateAverageSessionDuration(interactions: any[]): number {
    const sessionDurations = new Map<string, { start: string; end: string; }>();
    
    interactions.forEach(interaction => {
      if (!interaction.sessionId) return;
      
      const session = sessionDurations.get(interaction.sessionId);
      if (!session) {
        sessionDurations.set(interaction.sessionId, {
          start: interaction.timestamp,
          end: interaction.timestamp
        });
      } else {
        session.end = interaction.timestamp;
      }
    });

    let totalDuration = 0;
    sessionDurations.forEach(session => {
      const duration = new Date(session.end).getTime() - new Date(session.start).getTime();
      totalDuration += duration;
    });

    return totalDuration / sessionDurations.size || 0;
  }
}