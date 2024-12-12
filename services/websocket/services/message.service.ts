// services/websocket/services/message.service.ts

import { WSMessage, WSMessageType } from '../types/websocket.types';
import { ConnectionService } from './connection.service';
import { BotpressService } from '../../botpress/services/botpress.service';
import { WebSocketService } from './websocket.service';
import { Connection } from '../models/connection';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { HandoffRequest } from '@services/botpress/types/chat.types';
import { WebSocketError } from '../utils/errors';

export class MessageService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly connectionService: ConnectionService;
  private readonly botpressService: BotpressService;
  private readonly webSocketService: WebSocketService;

  constructor() {
    this.logger = new Logger('MessageService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.connectionService = new ConnectionService();
    this.botpressService = new BotpressService();
    this.webSocketService = new WebSocketService();
  }

  async getConnectionById(connectionId: string): Promise<Connection | null> {
    return this.connectionService.getConnection(connectionId);
  }

  async updateConnectionStatus(connectionId: string, status: string): Promise<void> {
    await this.connectionService.updateConnectionStatus(connectionId, status as any);
  }

  async sendMessage(connectionId: string, message: WSMessage): Promise<void> {
    await this.webSocketService.sendMessage(connectionId, message);
    this.metrics.incrementCounter('MessagesSent');
  }

  async broadcastMessage(message: WSMessage, userIds?: string[]): Promise<void> {
    await this.webSocketService.broadcastMessage(message, userIds);
    this.metrics.incrementCounter('MessagesBroadcasted');
  }

  async notifyHumanAgent(connection: Connection, message: WSMessage): Promise<void> {
    try {
      this.logger.info('Notifying human agent', {
        connectionId: connection.connectionId,
        userId: connection.userId,
        conversationId: message.conversationId
      });

      const agentMessage: WSMessage = {
        ...message,
        type: 'HANDOFF_REQUEST',
        metadata: {
          ...message.metadata,
          connectionId: connection.connectionId,
          userId: connection.userId,
        },
      };
  
      const handoffRequest: HandoffRequest = {
        conversation_id: message.conversationId,
        userId: connection.userId,
        message: message.content,
        metadata: {
          connectionId: connection.connectionId,
          ...message.metadata
        },
        timestamp: new Date().toISOString()
      };
  
      await this.webSocketService.sendToUser(connection.userId, agentMessage);
      await this.botpressService.initiateHandoff(handoffRequest);
      this.metrics.incrementCounter('HandoffRequestsInitiated');
  
      this.logger.info('Handoff request sent to Botpress', {
        connectionId: connection.connectionId,
        conversationId: message.conversationId
      });
    } catch (error) {
      this.logger.error('Failed to notify human agent', {
        error,
        connectionId: connection.connectionId,
        conversationId: message.conversationId
      });
      throw error;
    }
  }
  
  async handleAgentResponse(connectionId: string, message: WSMessage): Promise<void> {
    try {
      this.logger.info('Handling agent response', {
        connectionId,
        conversationId: message.conversationId
      });
  
      const connection = await this.connectionService.getConnection(connectionId);
      if (!connection) {
        throw new WebSocketError('Connection not found', 404);
      }
  
      switch (message.type) {
        case 'HANDOFF_ACCEPTED':
          await this.connectionService.updateConnectionStatus(connectionId, 'IN_PROGRESS');
          await this.sendMessage(connectionId, {
            type: 'HANDOFF_STARTED',
            content: 'Un agente ha tomado tu conversación.',
            conversationId: message.conversationId,
            timestamp: new Date().toISOString()
          });
          break;
  
        case 'HANDOFF_REJECTED':
          await this.connectionService.updateConnectionStatus(connectionId, 'CONNECTED');
          await this.sendMessage(connectionId, {
            type: 'SYSTEM_MESSAGE',
            content: 'No hay agentes disponibles en este momento. Por favor, intenta nuevamente más tarde.',
            conversationId: message.conversationId,
            timestamp: new Date().toISOString()
          });
          break;
  
        case 'AGENT_MESSAGE':
          await this.sendMessage(connectionId, {
            type: 'AGENT_MESSAGE',
            content: message.content,
            conversationId: message.conversationId,
            timestamp: new Date().toISOString()
          });
          break;
  
        case 'HANDOFF_COMPLETED':
          await this.connectionService.updateConnectionStatus(connectionId, 'CONNECTED');
          await this.sendMessage(connectionId, {
            type: 'HANDOFF_COMPLETED',
            content: 'El agente ha terminado la conversación. Ahora estás hablando con el bot nuevamente.',
            conversationId: message.conversationId,
            timestamp: new Date().toISOString()
          });
          break;
      }
    } catch (error) {
      this.logger.error('Failed to handle agent response', {
        error,
        connectionId,
        conversationId: message.conversationId
      });
      throw error;
    }
  }
}