// services/botpress/services/feedback/botpress-feedback.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';

interface FeedbackData {
  userId: string;
  conversationId: string;
  messageId?: string;
  rating: number;
  comment?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export class BotpressFeedbackService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    this.logger = new Logger('BotpressFeedbackService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.BOTPRESS_FEEDBACK_TABLE || '';

    if (!this.tableName) {
      throw new Error('BOTPRESS_FEEDBACK_TABLE environment variable is not set');
    }
  }

  async recordFeedback(feedback: FeedbackData): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          ...feedback,
          timestamp: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 días TTL
        }
      });

      this.metrics.recordMetric('FeedbackRating', feedback.rating);
      
      if (feedback.rating < 3) {
        this.metrics.incrementCounter('NegativeFeedback');
      }

      this.logger.info('Feedback recorded successfully', {
        userId: feedback.userId,
        conversationId: feedback.conversationId,
        rating: feedback.rating
      });
    } catch (error) {
      this.logger.error('Failed to record feedback', {
        error,
        userId: feedback.userId,
        conversationId: feedback.conversationId
      });
      throw new BotpressError('Failed to record feedback');
    }
  }

  async analyzeFeedback(timeRange: { startDate: string; endDate: string }): Promise<{
    averageRating: number;
    totalFeedback: number;
    negativeCount: number;
    commonTags: Array<{ tag: string; count: number }>;
  }> {
    try {
      const feedbackItems = await this.queryFeedback(timeRange);
      
      const totalFeedback = feedbackItems.length;
      const totalRating = feedbackItems.reduce((sum, item) => sum + item.rating, 0);
      const negativeCount = feedbackItems.filter(item => item.rating < 3).length;
      
      // Análisis de tags
      const tagCounts = new Map<string, number>();
      feedbackItems.forEach(item => {
        item.tags?.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });

      const commonTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        averageRating: totalFeedback > 0 ? totalRating / totalFeedback : 0,
        totalFeedback,
        negativeCount,
        commonTags
      };
    } catch (error) {
      this.logger.error('Failed to analyze feedback', { error });
      throw new BotpressError('Failed to analyze feedback');
    }
  }

  private async queryFeedback(timeRange: { startDate: string; endDate: string }) {
    const result = await this.ddb.query({
      TableName: this.tableName,
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
}