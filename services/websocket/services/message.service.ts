// services/websocket/services/message.service.ts

import { v4 as uuidv4 } from 'uuid';
import { WSMessage, WSConnectionStatus } from '../types/websocket.types';
import { ConnectionService } from './connection.service';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { WebSocketService } from '../services/websocket.service';
import { Connection } from '../models/connection';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { HANDOFF_CONFIG, MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';
import { ConversationContextService } from '../../botpress/services/context/conversation-context.service';
import { TokenManagementService } from '../../botpress/services/token/token-management.service';
import { ConversationStatus } from '@services/botpress/types/conversation-context.types';

export interface MessageQueueItem {
  userId: string;
  connectionId: string;
  message: WSMessage;
  attempts: number;
  nextRetry?: number;
}

export interface HandoffRequest {
  conversationId: string,
  userId: string,
  message: string,
  metadata: Record<string, any>,
  timestamp: string,
  priority: number
}

export class MessageService {
  private static instance: MessageService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly connectionService: ConnectionService;
  private readonly botpressService: BotpressService;
  private readonly webSocketService: WebSocketService;
  private readonly contextService: ConversationContextService;
  private readonly tokenService: TokenManagementService;
  
  // Cola para mensajes pendientes de entrega
  private readonly messageQueue: Map<string, MessageQueueItem> = new Map();
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.logger = new Logger('MessageService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.connectionService = new ConnectionService();
    this.botpressService = BotpressService.getInstance();
    this.webSocketService = new WebSocketService();
    this.contextService = ConversationContextService.getInstance();
    this.tokenService = TokenManagementService.getInstance();

    // Iniciar procesamiento de cola de mensajes pendientes
    this.startMessageQueueProcessor();
  }

  public static getInstance(): MessageService {
    if (!MessageService.instance) {
      MessageService.instance = new MessageService();
    }
    return MessageService.instance;
  }

  /**
   * Obtiene una conexión por su ID
   * @param connectionId ID de la conexión WebSocket
   * @returns La conexión o null si no se encuentra
   */
  async getConnectionById(connectionId: string): Promise<Connection | null> {
    const startTime = Date.now();
    
    try {
      const connection = await this.connectionService.getConnection(connectionId);
      
      this.metrics.recordLatency('ConnectionRetrievalLatency', Date.now() - startTime);
      
      if (!connection) {
        this.metrics.incrementCounter('ConnectionNotFound');
      }
      
      return connection;
    } catch (error) {
      this.logger.error('Error retrieving connection', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId 
      });
      
      this.metrics.incrementCounter('ConnectionRetrievalErrors');
      this.metrics.recordLatency('ConnectionRetrievalLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Actualiza el estado de una conexión
   * @param connectionId ID de la conexión WebSocket
   * @param status Nuevo estado
   */
  async updateConnectionStatus(connectionId: string, status: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.connectionService.updateConnectionStatus(connectionId, status as WSConnectionStatus);
      
      this.metrics.incrementCounter('ConnectionStatusUpdated');
      this.metrics.recordLatency('ConnectionStatusUpdateLatency', Date.now() - startTime);
      
      this.logger.info('Connection status updated', { connectionId, status });
    } catch (error) {
      this.logger.error('Error updating connection status', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId, 
        status 
      });
      
      this.metrics.incrementCounter('ConnectionStatusUpdateErrors');
      this.metrics.recordLatency('ConnectionStatusUpdateLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Envía un mensaje a través de una conexión WebSocket específica
   * @param connectionId ID de la conexión
   * @param message Mensaje a enviar
   * @param guaranteedDelivery Si es true, el mensaje se guarda para reintento en caso de fallo
   */
  async sendMessage(
    connectionId: string, 
    message: WSMessage, 
    guaranteedDelivery: boolean = false
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Asegurar que el mensaje tenga un timestamp
      const enrichedMessage: WSMessage = {
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      };
      
      // Intentar enviar el mensaje inmediatamente
      const success = await this.webSocketService.sendMessage(connectionId, enrichedMessage);
      
      if (success) {
        this.metrics.incrementCounter('MessagesSent');
        this.logger.debug('Message sent', { connectionId, messageType: message.type });
      } else if (guaranteedDelivery) {
        // Si no se pudo enviar y se requiere entrega garantizada, añadir a la cola
        this.queueMessageForRetry(connectionId, enrichedMessage);
        this.logger.info('Message queued for retry', { connectionId, messageType: message.type });
      } else {
        this.metrics.incrementCounter('MessagesFailedNoRetry');
        this.logger.warn('Message delivery failed with no retry', { 
          connectionId, 
          messageType: message.type 
        });
      }
      
      this.metrics.recordLatency('MessageSendLatency', Date.now() - startTime);
    } catch (error) {
      this.logger.error('Error sending message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId, 
        messageType: message.type 
      });
      
      if (guaranteedDelivery) {
        this.queueMessageForRetry(connectionId, message);
        this.logger.info('Message queued for retry after error', { 
          connectionId, 
          messageType: message.type 
        });
      }
      
      this.metrics.incrementCounter('MessageSendErrors');
      this.metrics.recordLatency('MessageSendLatency', Date.now() - startTime);
      
      if (!guaranteedDelivery) {
        throw error;
      }
    }
  }

  /**
   * Envía un mensaje a múltiples usuarios
   * @param message Mensaje a enviar
   * @param userIds IDs de usuarios o undefined para enviar a todos
   * @param guaranteedDelivery Si es true, los mensajes que fallan se guardan para reintento
   */
  async broadcastMessage(
    message: WSMessage, 
    userIds?: string[],
    guaranteedDelivery: boolean = false
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Usar el servicio WebSocket para el broadcast
      const sentCount = await this.webSocketService.broadcastMessage(message, userIds);
      
      this.logger.info('Message broadcast completed', { 
        userCount: userIds?.length || 'all',
        sentCount,
        messageType: message.type
      });
      
      this.metrics.incrementCounter('MessagesBroadcasted');
      this.metrics.recordLatency('BroadcastLatency', Date.now() - startTime);
    } catch (error) {
      this.logger.error('Error broadcasting message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userCount: userIds?.length || 'all',
        messageType: message.type
      });
      
      this.metrics.incrementCounter('BroadcastErrors');
      this.metrics.recordLatency('BroadcastLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Procesa un mensaje entrante del usuario
   * @param connection Conexión del usuario
   * @param message Mensaje enviado
   * @returns ID del mensaje procesado
   */
  async processUserMessage(connection: Connection, message: WSMessage): Promise<string> {
    const startTime = Date.now();
    const messageId = message.messageId || uuidv4();
    
    try {
      this.logger.info('Processing user message', {
        userId: connection.userId,
        connectionId: connection.connectionId,
        conversationId: message.conversationId,
        messageType: message.type
      });
      
      // Enviar confirmación de recepción
      await this.sendMessage(connection.connectionId, {
        type: 'MESSAGE_RECEIVED',
        messageId,
        conversationId: message.conversationId,
        content: '',
        timestamp: new Date().toISOString()
      });
      
      // Validar tokens disponibles
      const tokensRequired = this.estimateTokenRequirement(message);
      const hasTokens = await this.tokenService.checkTokenAvailability(
        connection.userId, 
        tokensRequired
      );
      
      if (!hasTokens) {
        await this.sendMessage(connection.connectionId, {
          type: 'ERROR',
          conversationId: message.conversationId,
          content: 'No tienes suficientes tokens para procesar este mensaje.',
          timestamp: new Date().toISOString(),
          messageId
        }, true);
        
        this.metrics.incrementCounter('InsufficientTokens');
        this.logger.warn('User has insufficient tokens', { 
          userId: connection.userId,
          required: tokensRequired
        });
        
        return messageId;
      }
      
      // Verificar si el mensaje debe ir a un asesor
      if (this.isHandoffRequest(message) || 
          (await this.isInHandoffState(message.conversationId))) {
        await this.notifyHumanAgent(connection, message);
        
        // Enviar indicación de que el mensaje está siendo procesado por un asesor
        await this.sendMessage(connection.connectionId, {
          type: 'HANDOFF_STATUS',
          conversationId: message.conversationId,
          content: 'Tu mensaje está siendo procesado por un asesor.',
          timestamp: new Date().toISOString(),
          messageId
        }, true);
      } else {
        // Procesar con Botpress
        try {
          // Mostrar indicador de escritura
          await this.sendMessage(connection.connectionId, {
            messageId: messageId,
            type: 'TYPING_INDICATOR',
            conversationId: message.conversationId,
            content: 'true',
            timestamp: new Date().toISOString()
          });
          
          // Enviar a Botpress
          const response = await this.botpressService.sendMessage(
            connection.userId,
            message.content,
            message.conversationId
          );
          
          // Detener indicador de escritura
          await this.sendMessage(connection.connectionId, {
            messageId: messageId,
            type: 'TYPING_INDICATOR',
            conversationId: message.conversationId,
            content: 'false',
            timestamp: new Date().toISOString()
          });
          
          // Enviar respuesta al cliente
          await this.sendMessage(connection.connectionId, {
            messageId: messageId,
            type: 'BOT_RESPONSE',
            conversationId: message.conversationId,
            content: response.messages.toString(),
            timestamp: new Date().toISOString(),
          }, true);
          
          // Verificar si es necesario handoff
          if (response.metadata?.needsHandoff) {
            await this.initiateHandoff(connection, message);
          }
        } catch (error) {
          this.logger.error('Error processing message with Botpress', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: connection.userId,
            conversationId: message.conversationId
          });
          
          // Notificar error al usuario
          await this.sendMessage(connection.connectionId, {
            type: 'ERROR',
            conversationId: message.conversationId,
            content: 'Error al procesar tu mensaje. Por favor, intenta nuevamente más tarde.',
            timestamp: new Date().toISOString(),
            messageId
          }, true);
          
          this.metrics.incrementCounter('BotpressProcessingErrors');
        }
      }
      
      this.metrics.incrementCounter('UserMessagesProcessed');
      this.metrics.recordLatency('MessageProcessingLatency', Date.now() - startTime);
      
      return messageId;
    } catch (error) {
      this.logger.error('Error processing user message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: connection.userId,
        connectionId: connection.connectionId,
        conversationId: message.conversationId
      });
      
      try {
        // Notificar error al usuario
        await this.sendMessage(connection.connectionId, {
          type: 'ERROR',
          conversationId: message.conversationId,
          content: 'Error al procesar tu mensaje. Por favor, intenta nuevamente más tarde.',
          timestamp: new Date().toISOString(),
          messageId
        }, true);
      } catch (sendError) {
        this.logger.error('Failed to send error notification', { 
          error: sendError, 
          connectionId: connection.connectionId 
        });
      }
      
      this.metrics.incrementCounter('MessageProcessingErrors');
      this.metrics.recordLatency('MessageProcessingLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Notifica a un asesor humano sobre una solicitud de handoff
   * @param connection Conexión del usuario
   * @param message Mensaje del usuario
   */
  async notifyHumanAgent(connection: Connection, message: WSMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Notifying human agent', {
        connectionId: connection.connectionId,
        userId: connection.userId,
        conversationId: message.conversationId
      });

      // Crear mensaje para los asesores
      const agentMessage: WSMessage = {
        ...message,
        type: 'HANDOFF_REQUEST',
        metadata: {
          ...message.metadata,
          connectionId: connection.connectionId,
          userId: connection.userId,
          userInfo: {
            // Añadir información relevante del usuario para el asesor
            name: message.metadata?.userInfo?.name || 'Usuario',
            plan: message.metadata?.userInfo?.plan || 'basic'
          }
        },
      };
      
      // Actualizar estado de la conexión
      await this.connectionService.updateConnectionStatus(
        connection.connectionId, 
        'IN_PROGRESS'
      );
      
      // Actualizar contexto de la conversación
      await this.contextService.updateStatus(
        message.conversationId, 
        ConversationStatus.PENDING_HANDOFF
      );
      
      // Enviar al sistema de handoff (servicio Botpress)
      await this.botpressService.initiateHandoff(connection.userId, message.conversationId);
      
      // Buscar asesores disponibles y notificarles
      // (Esta parte se implementará completamente en Fase 3)
      // Por ahora, enviaremos a todos los asesores disponibles
      const availableAdvisors = await this.getAvailableAdvisors();
      if (availableAdvisors.length > 0) {
        const advisorUserIds = availableAdvisors.map(advisor => advisor.userId);
        await this.webSocketService.broadcastMessage(agentMessage, advisorUserIds);
        
        this.logger.info('Handoff request broadcast to advisors', {
          advisorCount: advisorUserIds.length,
          conversationId: message.conversationId
        });
      } else {
        this.logger.warn('No available advisors for handoff', {
          conversationId: message.conversationId
        });
        
        // Notificar al usuario que no hay asesores disponibles
        await this.sendMessage(connection.connectionId, {
          messageId: message.messageId,
          type: 'SYSTEM_MESSAGE',
          conversationId: message.conversationId,
          content: 'En este momento no hay asesores disponibles. Tu solicitud ha sido registrada y será atendida lo antes posible.',
          timestamp: new Date().toISOString()
        }, true);
      }
      
      this.metrics.incrementCounter('HandoffRequestsInitiated');
      this.metrics.recordLatency('HandoffRequestLatency', Date.now() - startTime);
    } catch (error) {
      this.logger.error('Failed to notify human agent', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: connection.connectionId,
        conversationId: message.conversationId
      });
      
      // Intentar revertir al estado anterior
      try {
        await this.connectionService.updateConnectionStatus(
          connection.connectionId, 
          'CONNECTED'
        );
        
        await this.contextService.updateStatus(
          message.conversationId, 
          ConversationStatus.ACTIVE
        );
      } catch (revertError) {
        this.logger.error('Error reverting connection status after handoff failure', {
          error: revertError,
          connectionId: connection.connectionId
        });
      }
      
      this.metrics.incrementCounter('HandoffRequestErrors');
      this.metrics.recordLatency('HandoffRequestLatency', Date.now() - startTime);
      
      throw error;
    }
  }
  
  /**
   * Procesa una respuesta de un asesor humano
   * @param connectionId ID de la conexión del asesor
   * @param message Mensaje del asesor
   */
  async handleAgentResponse(connectionId: string, message: WSMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Handling agent response', {
        connectionId,
        conversationId: message.conversationId,
        messageType: message.type
      });
      
      // Obtener información de la conexión del asesor
      const connection = await this.connectionService.getConnection(connectionId);
      if (!connection) {
        throw new WebSocketError('Connection not found', 404);
      }
      
      // Obtener información de la conversación
      const context = await this.contextService.getContext(message.conversationId);
      if (!context) {
        throw new WebSocketError('Conversation not found', 404);
      }
      
      // Obtener conexiones del usuario
      const userConnections = await this.connectionService.getConnectionsByUserId(context.userId);
      if (userConnections.length === 0) {
        throw new WebSocketError('User not connected', 400, { userId: context.userId });
      }
      
      // Procesar según el tipo de mensaje
      switch (message.type) {
        case 'HANDOFF_ACCEPTED':
          // Actualizar estado de handoff
          await this.contextService.updateHandoffContext(message.conversationId, {
            handoffCount: (context.handoffContext?.handoffCount || 0) + 1,
            lastAdvisorId: connection.userId,
            lastHandoffTimestamp: Date.now()
          });
          
          await this.contextService.updateStatus(message.conversationId, ConversationStatus.WITH_ADVISOR);
          
          // Notificar al usuario
          for (const userConn of userConnections) {
            await this.sendMessage(userConn.connectionId, {
              messageId: message.messageId,
              type: 'HANDOFF_STARTED',
              content: 'Un asesor ha tomado tu conversación.',
              conversationId: message.conversationId,
              timestamp: new Date().toISOString(),
              metadata: {
                advisorInfo: message.metadata?.advisorInfo
              }
            }, true);
          }
          
          this.metrics.incrementCounter('HandoffsAccepted');
          break;
          
        case 'HANDOFF_REJECTED':
          // Actualizar estado de conexión
          for (const userConn of userConnections) {
            await this.connectionService.updateConnectionStatus(userConn.connectionId, 'CONNECTED');
          }
          
          await this.contextService.updateStatus(message.conversationId, ConversationStatus.ACTIVE);
          
          // Notificar al usuario
          for (const userConn of userConnections) {
            await this.sendMessage(userConn.connectionId, {
              messageId: message.messageId,
              type: 'SYSTEM_MESSAGE',
              content: message.content || 'No hay asesores disponibles en este momento. Por favor, intenta nuevamente más tarde.',
              conversationId: message.conversationId,
              timestamp: new Date().toISOString()
            }, true);
          }
          
          this.metrics.incrementCounter('HandoffsRejected');
          break;
          
        case 'AGENT_MESSAGE':
          // Guardar mensaje en el historial
          await this.contextService.addMessage(message.conversationId, {
            role: 'advisor',
            content: message.content,
            timestamp: Date.now()
          });
          
          // Enviar mensaje al usuario
          for (const userConn of userConnections) {
            await this.sendMessage(userConn.connectionId, {
              messageId: message.messageId,
              type: 'AGENT_MESSAGE',
              content: message.content,
              conversationId: message.conversationId,
              timestamp: new Date().toISOString(),
              metadata: message.metadata
            }, true);
          }
          
          this.metrics.incrementCounter('AgentMessagesSent');
          break;
          
        case 'HANDOFF_COMPLETED':
          // Actualizar estado
          await this.contextService.updateStatus(message.conversationId, ConversationStatus.ACTIVE);
          
          for (const userConn of userConnections) {
            await this.connectionService.updateConnectionStatus(userConn.connectionId, 'CONNECTED');
            
            // Notificar al usuario
            await this.sendMessage(userConn.connectionId, {
              messageId: message.messageId,
              type: 'HANDOFF_COMPLETED',
              content: message.content || 'El asesor ha terminado la conversación. Ahora estás hablando con el bot nuevamente.',
              conversationId: message.conversationId,
              timestamp: new Date().toISOString()
            }, true);
          }
          
          this.metrics.incrementCounter('HandoffsCompleted');
          break;
          
        default:
          throw new WebSocketError(`Unsupported message type: ${message.type}`, 400);
      }
      
      this.metrics.recordLatency('AgentResponseLatency', Date.now() - startTime);
    } catch (error) {
      this.logger.error('Failed to handle agent response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId,
        conversationId: message.conversationId,
        messageType: message.type
      });
      
      this.metrics.incrementCounter('AgentResponseErrors');
      this.metrics.recordLatency('AgentResponseLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Inicia un proceso de handoff
   * @param connection Conexión del usuario
   * @param message Mensaje que desencadenó el handoff
   */
  private async initiateHandoff(connection: Connection, message: WSMessage): Promise<void> {
    try {
      // Notificar al usuario que su conversación será transferida
      await this.sendMessage(connection.connectionId, {
        messageId: message.messageId,
        type: 'HANDOFF_STATUS',
        conversationId: message.conversationId,
        content: 'Tu conversación será transferida a un asesor humano.',
        timestamp: new Date().toISOString()
      }, true);
      
      // Llamar al método de notificación a agente
      await this.notifyHumanAgent(connection, message);
    } catch (error) {
      this.logger.error('Failed to initiate handoff', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: connection.userId,
        conversationId: message.conversationId
      });
      
      throw error;
    }
  }

  /**
   * Estima la cantidad de tokens requeridos para procesar un mensaje
   * @param message Mensaje a procesar
   * @returns Número estimado de tokens
   */
  private estimateTokenRequirement(message: WSMessage): number {
    const content = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content);
      
    // Estimación básica: ~4 caracteres por token
    return Math.max(50, Math.ceil(content.length / 4));
  }

  /**
   * Verifica si un mensaje es una solicitud explícita de handoff
   * @param message Mensaje a verificar
   * @returns true si es solicitud de handoff
   */
  private isHandoffRequest(message: WSMessage): boolean {
    if (typeof message.content !== 'string') {
      return false;
    }
    
    const content = message.content.toLowerCase();
    return (
      content.includes('hablar con asesor') ||
      content.includes('hablar con humano') ||
      content.includes('hablar con agente') ||
      content.includes('speak to agent') ||
      content.includes('speak to human') ||
      content.includes('agente humano') ||
      content.includes('human agent') ||
      content.includes('chat with human') ||
      content.includes('support agent')
    );
  }

  /**
   * Verifica si una conversación está en estado de handoff
   * @param conversationId ID de la conversación
   * @returns true si está en handoff
   */
  private async isInHandoffState(conversationId: string): Promise<boolean> {
    try {
      const context = await this.contextService.getContext(conversationId);
      
      if (!context) {
        return false;
      }
      
      return (
        context.status === 'PENDING_HANDOFF' ||
        context.status === 'WITH_ADVISOR'
      );
    } catch (error) {
      this.logger.error('Error checking handoff state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId
      });
      
      return false;
    }
  }

  /**
   * Calcula la prioridad de un handoff
   * @param message Mensaje que generó el handoff
   * @returns Nivel de prioridad (1-10, donde 10 es máxima prioridad)
   */
  private calculateHandoffPriority(message: WSMessage): number {
    const basePriority = HANDOFF_CONFIG.DEFAULT_PRIORITY;
    let priority = basePriority;
    
    // Incrementar prioridad si es usuario de plan superior
    if (message.metadata?.userInfo?.plan) {
      switch (message.metadata.userInfo.plan) {
        case 'enterprise':
          priority += 3;
          break;
        case 'business':
          priority += 2;
          break;
        case 'pro':
          priority += 1;
          break;
      }
    }
    
    // Incrementar si es una solicitud explícita
    if (this.isHandoffRequest(message)) {
      priority += 1;
    }
    
    // Limitar entre 1-10
    return Math.max(1, Math.min(10, priority));
  }

  /**
   * Obtiene asesores disponibles
   * @returns Lista de asesores disponibles
   */
  private async getAvailableAdvisors(): Promise<{ userId: string; specialties?: string[] }[]> {
    // Esta es una implementación temporal hasta que se implemente AdvisorService en Fase 3
    // En producción, obtendríamos esta información de DynamoDB
    return [
      // Datos de ejemplo
      { userId: 'advisor-001', specialties: ['general', 'technical'] },
      { userId: 'advisor-002', specialties: ['general', 'billing'] }
    ];
  }

  /**
   * Añade un mensaje a la cola de reintentos
   * @param connectionId ID de la conexión
   * @param message Mensaje a guardar
   */
  private queueMessageForRetry(connectionId: string, message: WSMessage): void {
    const queueKey = `${connectionId}:${message.messageId || uuidv4()}`;
    
    this.messageQueue.set(queueKey, {
      userId: message.metadata?.userId || '',
      connectionId,
      message,
      attempts: 0,
      nextRetry: Date.now() + this.RETRY_DELAY_MS
    });
    
    this.metrics.incrementCounter('MessagesQueued');
    
    this.logger.info('Message queued for retry', {
      connectionId,
      messageType: message.type,
      queueSize: this.messageQueue.size
    });
  }

  /**
   * Inicia el procesador de la cola de mensajes
   */
  private startMessageQueueProcessor(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    
    this.retryInterval = setInterval(() => {
      this.processMessageQueue().catch(error => {
        this.logger.error('Error processing message queue', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }, 5000); // Procesar cada 5 segundos
  }

  /**
   * Procesa la cola de mensajes pendientes
   */
  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.size === 0) {
      return;
    }
    
    const now = Date.now();
    const itemsToProcess: [string, MessageQueueItem][] = [];
    
    // Identificar mensajes listos para reintento
    for (const [key, item] of this.messageQueue.entries()) {
      if (item.nextRetry && item.nextRetry <= now) {
        itemsToProcess.push([key, item]);
      }
    }
    
    if (itemsToProcess.length === 0) {
      return;
    }
    
    this.logger.info('Processing message queue', {
      readyCount: itemsToProcess.length,
      totalQueued: this.messageQueue.size
    });
    
    // Procesar cada mensaje
    for (const [key, item] of itemsToProcess) {
      try {
        const success = await this.webSocketService.sendMessage(
          item.connectionId, 
          item.message
        );
        
        if (success) {
          // Mensaje enviado correctamente, eliminar de la cola
          this.messageQueue.delete(key);
          this.metrics.incrementCounter('QueuedMessagesDelivered');
          
          this.logger.info('Queued message delivered successfully', {
            connectionId: item.connectionId,
            messageType: item.message.type
          });
        } else {
          // Incrementar contador de intentos
          item.attempts++;
          
          if (item.attempts >= this.MAX_RETRY_ATTEMPTS) {
            // Alcanzado máximo de intentos, eliminar de la cola
            this.messageQueue.delete(key);
            this.metrics.incrementCounter('QueuedMessagesAbandoned');
            
            this.logger.warn('Abandoned message after max retries', {
              connectionId: item.connectionId,
              messageType: item.message.type,
              attempts: item.attempts
            });
          } else {
            // Programar próximo intento con backoff exponencial
            const delay = this.RETRY_DELAY_MS * Math.pow(2, item.attempts);
            item.nextRetry = now + delay;
            
            this.logger.info('Scheduled message for retry', {
              connectionId: item.connectionId,
              messageType: item.message.type,
              attempt: item.attempts,
              nextRetryIn: Math.round(delay / 1000)
            });
          }
        }
      } catch (error) {
        // Error al intentar enviar, manejar igual que envío fallido
        item.attempts++;
        
        this.logger.error('Error retrying queued message', {
          error: error instanceof Error ? error.message : 'Unknown error',
          connectionId: item.connectionId,
          messageType: item.message.type,
          attempt: item.attempts
        });
        
        if (item.attempts >= this.MAX_RETRY_ATTEMPTS) {
          this.messageQueue.delete(key);
          this.metrics.incrementCounter('QueuedMessagesAbandoned');
        } else {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, item.attempts);
          item.nextRetry = now + delay;
        }
      }
    }
  }

  /**
   * Limpia los recursos del servicio
   */
  public cleanup(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    
    this.messageQueue.clear();
    this.logger.info('MessageService resources cleaned up');
  }
}