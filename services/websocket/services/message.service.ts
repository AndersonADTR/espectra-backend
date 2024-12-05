// services/websocket/services/message.service.ts

import { WSMessage, WSMessageType } from '../types/websocket.types';
import { ConnectionService } from './connection.service';
import { BotpressService } from '../../botpress/services/botpress.service';
import { WebSocketService } from './websocket.service';
import { Connection } from '../models/connection';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../botpress/config/config';

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
    const agentMessage: WSMessage = {
      ...message,
      type: 'HANDOFF_REQUEST',
      metadata: {
        ...message.metadata,
        connectionId: connection.connectionId,
        userId: connection.userId,
      },
    };

    await this.webSocketService.sendToUser(connection.userId, agentMessage);
    this.metrics.incrementCounter('HandoffRequests');
  }

  async handleAgentResponse(connectionId: string, message: WSMessage): Promise<void> {
    if (message.type === 'HANDOFF_ACCEPTED') {
      await this.connectionService.updateConnectionStatus(connectionId, 'IN_PROGRESS');
      await this.webSocketService.sendMessage(connectionId, {
        type: 'HANDOFF_STARTED',
        content: 'Un agente ha tomado tu conversación.',
        conversationId: message.conversationId,
        timestamp: new Date().toISOString(),
      });
    } else if (message.type === 'HANDOFF_REJECTED') {
      await this.connectionService.updateConnectionStatus(connectionId, 'CONNECTED');
      await this.webSocketService.sendMessage(connectionId, {
        type: 'SYSTEM_MESSAGE',
        content: 'No hay agentes disponibles en este momento. Por favor, intenta nuevamente más tarde.',
        conversationId: message.conversationId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}