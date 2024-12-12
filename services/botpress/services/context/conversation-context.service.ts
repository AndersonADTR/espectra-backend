// services/botpress/services/context/conversation-context.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { ConversationContext } from '../../types/chat.types';
import { BaseService } from '../base/base.service';

export class ConversationContextService extends BaseService {

  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    super('ConversationContextService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.CONVERSATION_CONTEXT_TABLE || '';

    if (!this.tableName) {
      throw new Error('CONVERSATION_CONTEXT_TABLE environment variable is not set');
    }
  }

  async getContext(conversationId: string): Promise<ConversationContext | null> {
    try {
      const result = await this.ddb.get({
        TableName: this.tableName,
        Key: { conversationId }
      });

      this.metrics.incrementCounter('ContextRetrievals');

      if (!result.Item) {
        this.logger.info('No context found for conversation', { conversationId });
        return null;
      }

      return result.Item as ConversationContext;
    } catch (error) {
      this.handleError(error, 'Failed to get conversation context', { 
        operationName: 'GetContext',
        conversationId 
      });
    }
  }

  async updateContext(
    conversationId: string,
    context: Partial<ConversationContext>
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const updateExpression = this.buildUpdateExpression(context);
      const { expressionAttributeNames, expressionAttributeValues } = 
        this.buildExpressionAttributes(context);

      await this.ddb.update({
        TableName: this.tableName,
        Key: { conversationId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#lastUpdated': 'lastUpdated',
          ...expressionAttributeNames
        },
        ExpressionAttributeValues: {
          ':timestamp': timestamp,
          ...expressionAttributeValues
        }
      });

      this.metrics.incrementCounter('ContextUpdates');

      this.logger.info('Context updated successfully', {
        conversationId,
        updatedFields: Object.keys(context)
      });
    } catch (error) {
      this.handleError(error, 'Failed to update conversation context', {
        operationName: 'UpdateContext',
        conversationId,
        context
      });
    }
  }

  async clearContext(conversationId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { conversationId }
      });

      this.metrics.incrementCounter('ContextClears');

      this.logger.info('Context cleared successfully', { conversationId });
    } catch (error) {
      this.handleError(error, 'Failed to clear conversation context', {
        operationName: 'ClearContext',
        conversationId
      });
    }
  }

  async listRecentContexts(limit: number = 10): Promise<ConversationContext[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.tableName,
        IndexName: 'LastUpdatedIndex',
        KeyConditionExpression: '#lastUpdated > :minDate',
        ExpressionAttributeNames: {
          '#lastUpdated': 'lastUpdated'
        },
        ExpressionAttributeValues: {
          ':minDate': new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Últimas 24 horas
        },
        Limit: limit,
        ScanIndexForward: false // Orden descendente
      });

      return (result.Items || []) as ConversationContext[];
    } catch (error) {
      this.handleError(error, 'Failed to list recent conversation contexts', {
        operationName: 'ListRecentContexts'
      });
    }
  }

  private buildUpdateExpression(context: Partial<ConversationContext>): string {
    const expressions = Object.keys(context).map(key => `#${key} = :${key}`);
    expressions.push('#lastUpdated = :timestamp');
    
    return `SET ${expressions.join(', ')}`;
  }

  private buildExpressionAttributes(context: Partial<ConversationContext>): {
    expressionAttributeNames: Record<string, string>;
    expressionAttributeValues: Record<string, any>;
  } {
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(context).forEach(([key, value]) => {
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });

    return {
      expressionAttributeNames: names,
      expressionAttributeValues: values
    };
  }

  async analyzeContextTrends(): Promise<{
    totalContexts: number;
    averageMessageCount: number;
    topTopics: string[];
  }> {
    try {
      const contexts = await this.scanAllContexts();
      
      const totalContexts = contexts.length;
      const totalMessages = contexts.reduce(
        (sum, ctx) => sum + (ctx.messageCount || 0), 
        0
      );
      
      const topics = contexts
        .flatMap(ctx => ctx.topics || [])
        .reduce((acc, topic) => {
          acc[topic] = (acc[topic] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      const topTopics = Object.entries(topics)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([topic]) => topic);

      return {
        totalContexts,
        averageMessageCount: totalMessages / totalContexts,
        topTopics
      };
    } catch (error) {
      this.handleError(error, 'Failed to analyze conversation context trends', {
        operationName: 'AnalyzeContextTrends'
      });
    }
  }

  private async scanAllContexts(): Promise<ConversationContext[]> {
    const contexts: ConversationContext[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const result = await this.ddb.scan({
        TableName: this.tableName,
        ExclusiveStartKey: lastEvaluatedKey
      });

      contexts.push(...(result.Items as ConversationContext[]));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return contexts;
  }
}