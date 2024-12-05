// services/botpress/services/handoff.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { WebSocketService } from '../../websocket/services/websocket.service';
import { HandoffRequest, HandoffResponse } from '../types/chat.types';
import { MONITORING_CONFIG, HANDOFF_CONFIG } from '../config/config';

interface HandoffQueueItem {
  queueId: string;
  conversationId: string;
  userId: string;
  timestamp: string;
  status: 'pending' | 'assigned' | 'completed';
  priority: 'low' | 'medium' | 'high';
  agentId?: string;
  metadata?: Record<string, any>;
  ttl?: number;
}

export class HandoffService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly wsService: WebSocketService;
  private readonly handoffQueueTable: string;

  constructor() {
    this.logger = new Logger('HandoffService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.wsService = new WebSocketService();
    
    this.handoffQueueTable = process.env.HANDOFF_QUEUE_TABLE || '';
    
    if (!this.handoffQueueTable) {
      throw new Error('HANDOFF_QUEUE_TABLE environment variable is not set');
    }
  }

  async requestHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    try {
      const queueId = `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const queueItem: HandoffQueueItem = {
        queueId,
        conversationId: request.conversation_id,
        userId: request.userId,
        timestamp: new Date().toISOString(),
        status: 'pending',
        priority: request.priority || HANDOFF_CONFIG.DEFAULT_PRIORITY,
        metadata: request.metadata,
        ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas TTL
      };

      await this.ddb.put({
        TableName: this.handoffQueueTable,
        Item: queueItem
      });

      this.metrics.incrementCounter('HandoffRequests');

      // Notificar a los agentes disponibles
      await this.notifyAgents(queueItem);

      this.logger.info('Handoff request queued', {
        queueId,
        conversationId: request.conversation_id,
        userId: request.userId
      });

      return {
        status: 'pending',
        conversation_id: request.conversation_id,
        timestamp: queueItem.timestamp
      };
    } catch (error) {
      this.logger.error('Failed to request handoff', {
        error,
        conversationId: request.conversation_id,
        userId: request.userId
      });
      throw error;
    }
  }

  async assignHandoff(queueId: string, agentId: string): Promise<HandoffResponse> {
    try {
      const queueItem = await this.getQueueItem(queueId);
      
      if (!queueItem) {
        throw new Error('Handoff request not found');
      }

      if (queueItem.status !== 'pending') {
        throw new Error('Handoff request is no longer pending');
      }

      // Actualizar el estado en la cola
      await this.ddb.update({
        TableName: this.handoffQueueTable,
        Key: { queueId },
        UpdateExpression: 'SET #status = :status, agentId = :agentId, lastUpdated = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'assigned',
          ':agentId': agentId,
          ':timestamp': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter('HandoffAssignments');

      // Notificar al usuario sobre la asignación
      await this.notifyUser(queueItem.userId, {
        type: 'HANDOFF_ACCEPTED',
        content: 'Un asesor se ha unido a la conversación.',
        conversationId: queueItem.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          agentId
        }
      });

      this.logger.info('Handoff assigned successfully', {
        queueId,
        agentId,
        conversationId: queueItem.conversationId
      });

      return {
        status: 'accepted',
        conversation_id: queueItem.conversationId,
        agentId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to assign handoff', {
        error,
        queueId,
        agentId
      });
      throw error;
    }
  }

  async completeHandoff(queueId: string): Promise<void> {
    try {
      const queueItem = await this.getQueueItem(queueId);
      
      if (!queueItem) {
        throw new Error('Handoff request not found');
      }

      await this.ddb.update({
        TableName: this.handoffQueueTable,
        Key: { queueId },
        UpdateExpression: 'SET #status = :status, completedAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'completed',
          ':timestamp': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter('HandoffCompletions');

      this.logger.info('Handoff completed', {
        queueId,
        conversationId: queueItem.conversationId
      });
    } catch (error) {
      this.logger.error('Failed to complete handoff', {
        error,
        queueId
      });
      throw error;
    }
  }

  async getPendingHandoffs(): Promise<HandoffQueueItem[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.handoffQueueTable,
        IndexName: 'StatusIndex', // Asegúrate de que este índice existe
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'pending'
        }
      });
  
      this.metrics.recordMetric('PendingHandoffsCount', result.Items?.length || 0);
  
      this.logger.info('Retrieved pending handoffs', {
        count: result.Items?.length || 0
      });
  
      return (result.Items || []) as HandoffQueueItem[];
    } catch (error) {
      this.logger.error('Failed to get pending handoffs', { error });
      throw error;
    }
  }

  private async getQueueItem(queueId: string): Promise<HandoffQueueItem | null> {
    const result = await this.ddb.get({
      TableName: this.handoffQueueTable,
      Key: { queueId }
    });

    return result.Item as HandoffQueueItem || null;
  }

  private async notifyAgents(queueItem: HandoffQueueItem): Promise<void> {
    try {
      // Enviar notificación a todos los agentes disponibles
      await this.wsService.broadcastMessage({
        type: 'HANDOFF_REQUEST',
        content: 'Nueva solicitud de asistencia',
        conversationId: queueItem.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          queueId: queueItem.queueId,
          priority: queueItem.priority,
          userId: queueItem.userId,
          ...queueItem.metadata
        }
      });

      this.logger.info('Agents notified of handoff request', {
        queueId: queueItem.queueId,
        conversationId: queueItem.conversationId
      });
    } catch (error) {
      this.logger.error('Failed to notify agents', {
        error,
        queueId: queueItem.queueId
      });
      // No relanzamos el error para evitar que falle todo el proceso
    }
  }

  private async notifyUser(userId: string, message: any): Promise<void> {
    try {
      const userConnections = await this.wsService.getConnectionsByUserId(userId);
      
      if (userConnections.length > 0) {
        await Promise.all(
          userConnections.map(conn => 
            this.wsService.sendMessage(conn.connectionId, message)
          )
        );
      }

      this.logger.info('User notified of handoff status', {
        userId,
        messageType: message.type
      });
    } catch (error) {
      this.logger.error('Failed to notify user', {
        error,
        userId
      });
      // No relanzamos el error para evitar que falle todo el proceso
    }
  }
}