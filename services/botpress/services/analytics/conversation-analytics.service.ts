// services/botpress/services/analytics/conversation-analytics.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { BaseService } from '../base/base.service';
import { ChatMessage, ChatResponse } from '../../types/chat.types';

interface ConversationAnalytics {
  averageMessageLength: number;
  messageFrequency: number;
  handoffRate: number;
  topTopics: Array<{ topic: string; count: number }>;
  sentimentAnalysis: {
    positive: number;
    neutral: number;
    negative: number;
  };
  timeOfDay: Record<string, number>;
}

export class ConversationAnalyticsService extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    super('ConversationAnalyticsService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.CONVERSATION_ANALYTICS_TABLE || '';

    if (!this.tableName) {
      throw new Error('CONVERSATION_ANALYTICS_TABLE environment variable is not set');
    }
  }

  async trackConversation(
    message: ChatMessage, 
    response: ChatResponse,
    analytics: {
      processingTime: number;
      sentiment?: number;
      topics?: string[];
    }
  ): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          conversationId: message.conversationId,
          timestamp: new Date().toISOString(),
          userId: message.userId,
          messageLength: message.message.length,
          processingTime: analytics.processingTime,
          sentiment: analytics.sentiment,
          topics: analytics.topics,
          handoffRequested: this.isHandoffRequested(response),
          hourOfDay: new Date().getHours(),
          ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 días TTL
        }
      });

      this.metrics.incrementCounter('AnalyticsRecorded');
    } catch (error) {
      this.handleError(error, 'Failed to track conversation analytics', {
        operationName: 'trackConversation',
        conversationId: message.conversationId
      });
    }
  }

  async getAnalytics(timeRange: {
    startDate: string;
    endDate: string;
  }): Promise<ConversationAnalytics> {
    try {
      const conversations = await this.queryConversations(timeRange);
      
      return {
        averageMessageLength: this.calculateAverageMessageLength(conversations),
        messageFrequency: this.calculateMessageFrequency(conversations),
        handoffRate: this.calculateHandoffRate(conversations),
        topTopics: this.analyzeTopics(conversations),
        sentimentAnalysis: this.analyzeSentiment(conversations),
        timeOfDay: this.analyzeTimeOfDay(conversations)
      };
    } catch (error) {
      this.handleError(error, 'Failed to get conversation analytics', {
        operationName: 'getAnalytics',
        timeRange
      });
    }
  }

  private async queryConversations(timeRange: { startDate: string; endDate: string }) {
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

  private calculateAverageMessageLength(conversations: any[]): number {
    if (!conversations.length) return 0;
    const totalLength = conversations.reduce((sum, conv) => sum + conv.messageLength, 0);
    return totalLength / conversations.length;
  }

  private calculateMessageFrequency(conversations: any[]): number {
    if (!conversations.length) return 0;
    const timeSpan = new Date(conversations[conversations.length - 1].timestamp).getTime() -
                     new Date(conversations[0].timestamp).getTime();
    const hours = timeSpan / (1000 * 60 * 60);
    return conversations.length / hours;
  }

  private calculateHandoffRate(conversations: any[]): number {
    if (!conversations.length) return 0;
    const handoffs = conversations.filter(conv => conv.handoffRequested).length;
    return (handoffs / conversations.length) * 100;
  }

  private analyzeTopics(conversations: any[]): Array<{ topic: string; count: number }> {
    const topicCounts = new Map<string, number>();

    conversations.forEach(conv => {
      conv.topics?.forEach((topic: string) => {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });
    });

    return Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private analyzeSentiment(conversations: any[]): {
    positive: number;
    neutral: number;
    negative: number;
  } {
    let positive = 0, neutral = 0, negative = 0;

    conversations.forEach(conv => {
      if (conv.sentiment > 0.2) positive++;
      else if (conv.sentiment < -0.2) negative++;
      else neutral++;
    });

    const total = conversations.length || 1;
    return {
      positive: (positive / total) * 100,
      neutral: (neutral / total) * 100,
      negative: (negative / total) * 100
    };
  }

  private analyzeTimeOfDay(conversations: any[]): Record<string, number> {
    const hourCounts: Record<string, number> = {};
    
    conversations.forEach(conv => {
      const hour = conv.hourOfDay.toString().padStart(2, '0');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    return hourCounts;
  }

  private isHandoffRequested(response: ChatResponse): boolean {
    return response.responses.some(r => 
      r.type === 'handoff' || r.metadata?.handoff?.requested
    );
  }
}