import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { ConversationContext } from '../../types/chat.types';
import { BaseService } from '../base/base.service';
import { CacheService } from '../cache/cache.service';

export class ConversationContextService extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly cache: CacheService;
  private readonly tableName: string;

  constructor() {
    super('ConversationContextService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.cache = new CacheService();
    this.tableName = process.env.CONVERSATION_CONTEXT_TABLE || '';

    if (!this.tableName) {
      throw new Error('CONVERSATION_CONTEXT_TABLE environment variable is not set');
    }
  }

  async getContext(conversationId: string): Promise<ConversationContext | null> {
    try {
      // Intentar obtener de caché primero
      const cached = await this.cache.get<ConversationContext>(`context:${conversationId}`);
      if (cached) {
        this.metrics.incrementCounter('ContextCacheHits');
        return cached;
      }

      // Si no está en caché, obtener de DynamoDB
      const result = await this.ddb.get({
        TableName: this.tableName,
        Key: { conversationId }
      });

      const context = result.Item as ConversationContext;
      if (context) {
        // Guardar en caché para futuras consultas
        await this.cache.set(`context:${conversationId}`, context, 3600);
      }

      return context || null;
    } catch (error) {
      this.handleError(error, 'Failed to get conversation context', {
        operationName: 'getContext',
        conversationId
      });
    }
  }

  async updateContext(
    conversationId: string,
    updates: Partial<ConversationContext>
  ): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const updateExpression = this.buildUpdateExpression(updates);
      const { expressionAttributeNames, expressionAttributeValues } = 
        this.buildExpressionAttributes(updates);

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

      // Invalidar caché
      await this.cache.delete(`context:${conversationId}`);

      this.metrics.incrementCounter('ContextUpdates');
    } catch (error) {
      this.handleError(error, 'Failed to update conversation context', {
        operationName: 'updateContext',
        conversationId
      });
    }
  }

  async createContext(conversationId: string, userId: string): Promise<ConversationContext> {
    try {
      const context: ConversationContext = {
        userId,
        lastInteraction: new Date().toISOString(),
        messageCount: 0,
        topics: [],
        handoffHistory: [],
        customData: {}
      };

      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          conversationId,
          ...context,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 días TTL
        }
      });

      // Guardar en caché
      await this.cache.set(`context:${conversationId}`, context, 3600);

      this.metrics.incrementCounter('ContextCreations');

      return context;
    } catch (error) {
      this.handleError(error, 'Failed to create conversation context', {
        operationName: 'createContext',
        conversationId,
        userId
      });
    }
  }

  async deleteContext(conversationId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { conversationId }
      });

      // Eliminar de caché
      await this.cache.delete(`context:${conversationId}`);

      this.metrics.incrementCounter('ContextDeletions');
    } catch (error) {
      this.handleError(error, 'Failed to delete conversation context', {
        operationName: 'deleteContext',
        conversationId
      });
    }
  }

  private buildUpdateExpression(updates: Partial<ConversationContext>): string {
    const expressions = Object.keys(updates).map(key => `#${key} = :${key}`);
    expressions.push('#lastUpdated = :timestamp');
    
    return `SET ${expressions.join(', ')}`;
  }

  private buildExpressionAttributes(updates: Partial<ConversationContext>): {
    expressionAttributeNames: Record<string, string>;
    expressionAttributeValues: Record<string, any>;
  } {
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value]) => {
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });

    return {
      expressionAttributeNames: names,
      expressionAttributeValues: values
    };
  }

  async getConversationHistory(userId: string): Promise<ConversationContext[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      });

      return result.Items as ConversationContext[];
    } catch (error) {
      this.handleError(error, 'Failed to get conversation history', {
        operationName: 'getConversationHistory',
        userId
      });
    }
  }

  async addTopicToContext(conversationId: string, topic: string): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.tableName,
        Key: { conversationId },
        UpdateExpression: 'SET topics = list_append(if_not_exists(topics, :empty_list), :new_topic)',
        ExpressionAttributeValues: {
          ':empty_list': [],
          ':new_topic': [topic]
        }
      });

      // Invalidar caché
      await this.cache.delete(`context:${conversationId}`);
    } catch (error) {
      this.handleError(error, 'Failed to add topic to context', {
        operationName: 'addTopicToContext',
        conversationId,
        topic
      });
    }
  }
}