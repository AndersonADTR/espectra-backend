// services/botpress/services/persistence/handoff-persistence.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { HandoffQueue, HandoffStatus, HandoffFilters } from '../../types/handoff.types';
import { HANDOFF_CONSTANTS, HANDOFF_CACHE } from '../../config/handoff.config';
import { HandoffCacheService } from '../cache/handoff-cache.service';

export class HandoffPersistenceService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly cacheService: HandoffCacheService;
  private readonly tableName: string;

  constructor() {
    this.logger = new Logger('HandoffPersistenceService');
    this.metrics = new MetricsService(HANDOFF_CONSTANTS.METRICS.NAMESPACE);
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.cacheService = new HandoffCacheService();
    this.tableName = HANDOFF_CONSTANTS.QUEUE.TABLE_NAME;

    if (!this.tableName) {
      throw new Error('Handoff queue table name is not configured');
    }
  }

  async createHandoff(handoff: HandoffQueue): Promise<string> {
    try {
      // Añadir TTL al registro
      const ttl = Math.floor(Date.now() / 1000) + (HANDOFF_CONSTANTS.QUEUE.TTL_DAYS * 24 * 60 * 60);
      const handoffWithTTL = { ...handoff, ttl };

      await this.ddb.put({
        TableName: this.tableName,
        Item: handoffWithTTL,
        ConditionExpression: 'attribute_not_exists(queueId)'
      });

      // Cachear el nuevo handoff
      await this.cacheService.cacheQueueItem(handoffWithTTL);

      this.metrics.incrementCounter('HandoffCreated');
      
      this.logger.info('Handoff created successfully', {
        queueId: handoff.queueId,
        conversationId: handoff.conversationId
      });

      return handoff.queueId;
    } catch (error) {
      this.logger.error('Failed to create handoff', {
        error,
        queueId: handoff.queueId
      });
      throw error;
    }
  }

  async updateHandoff(
    queueId: string,
    updates: Partial<HandoffQueue>
  ): Promise<HandoffQueue> {
    try {
      // Construir expresiones de actualización
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      });

      const result = await this.ddb.update({
        TableName: this.tableName,
        Key: { queueId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const updatedHandoff = result.Attributes as HandoffQueue;

      // Actualizar caché
      await this.cacheService.cacheQueueItem(updatedHandoff);

      this.metrics.incrementCounter('HandoffUpdated');
      
      this.logger.info('Handoff updated successfully', {
        queueId,
        updates: Object.keys(updates)
      });

      return updatedHandoff;
    } catch (error) {
      this.logger.error('Failed to update handoff', {
        error,
        queueId,
        updates
      });
      throw error;
    }
  }

  async getHandoff(queueId: string): Promise<HandoffQueue | null> {
    try {
      // Intentar obtener de caché primero
      const cached = await this.cacheService.getCachedQueueItem(queueId);
      if (cached) {
        this.metrics.incrementCounter('HandoffCacheHit');
        return cached;
      }

      // Si no está en caché, obtener de DynamoDB
      const result = await this.ddb.get({
        TableName: this.tableName,
        Key: { queueId }
      });

      const handoff = result.Item as HandoffQueue;
      
      if (handoff) {
        // Cachear para futuras consultas
        await this.cacheService.cacheQueueItem(handoff);
        this.metrics.incrementCounter('HandoffCacheMiss');
      }

      return handoff || null;
    } catch (error) {
      this.logger.error('Failed to get handoff', {
        error,
        queueId
      });
      throw error;
    }
  }

  async getHandoffsByStatus(status: HandoffStatus): Promise<HandoffQueue[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.tableName,
        IndexName: HANDOFF_CONSTANTS.QUEUE.INDEX.STATUS,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        }
      });

      this.metrics.recordMetric(`HandoffsByStatus_${status}`, result.Items?.length || 0);

      return (result.Items || []) as HandoffQueue[];
    } catch (error) {
      this.logger.error('Failed to get handoffs by status', {
        error,
        status
      });
      throw error;
    }
  }

  async getHandoffsByFilters(filters: HandoffFilters): Promise<HandoffQueue[]> {
    try {
      let filterExpression = '';
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};

      // Construir expresiones de filtro
      if (filters.status) {
        filterExpression += '#status = :status';
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = filters.status;
      }

      if (filters.priority) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += '#priority = :priority';
        expressionAttributeNames['#priority'] = 'priority';
        expressionAttributeValues[':priority'] = filters.priority;
      }

      if (filters.advisorId) {
        if (filterExpression) filterExpression += ' AND ';
        filterExpression += '#advisorId = :advisorId';
        expressionAttributeNames['#advisorId'] = 'advisorId';
        expressionAttributeValues[':advisorId'] = filters.advisorId;
      }

      const result = await this.ddb.scan({
        TableName: this.tableName,
        FilterExpression: filterExpression || undefined,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 
          ? expressionAttributeNames 
          : undefined,
        ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0
          ? expressionAttributeValues
          : undefined
      });

      return (result.Items || []) as HandoffQueue[];
    } catch (error) {
      this.logger.error('Failed to get handoffs by filters', {
        error,
        filters
      });
      throw error;
    }
  }

  async deleteHandoff(queueId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { queueId }
      });

      // Invalidar caché
      await this.cacheService.invalidateCache(
        `${HANDOFF_CACHE.KEYS.QUEUE_PREFIX}${queueId}`
      );

      this.metrics.incrementCounter('HandoffDeleted');
      
      this.logger.info('Handoff deleted successfully', { queueId });
    } catch (error) {
      this.logger.error('Failed to delete handoff', {
        error,
        queueId
      });
      throw error;
    }
  }

  async cleanupExpiredHandoffs(): Promise<number> {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      const result = await this.ddb.scan({
        TableName: this.tableName,
        FilterExpression: 'ttl < :now',
        ExpressionAttributeValues: {
          ':now': now
        }
      });

      if (!result.Items?.length) {
        return 0;
      }

      const deletePromises = result.Items.map(item => 
        this.deleteHandoff(item.queueId)
      );

      await Promise.all(deletePromises);

      this.metrics.recordMetric('ExpiredHandoffsCleanup', result.Items.length);
      
      this.logger.info('Expired handoffs cleaned up', {
        count: result.Items.length
      });

      return result.Items.length;
    } catch (error) {
      this.logger.error('Failed to cleanup expired handoffs', { error });
      throw error;
    }
  }
}