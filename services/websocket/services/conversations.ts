// services/websocket/services/conversations.ts

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { ConversationContextService } from '@services/botpress/services/context/conversation-context.service';
import { ConversationStatus, ConversationType } from '@services/botpress/types/conversation-context.types';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';
import { WSMessage } from '../types/websocket.types';
import { Connection } from '../models/connection';

/**
 * Servicio para gestionar conversaciones en el contexto de WebSockets
 */
export class ConversationsService {
  private static instance: ConversationsService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly botpressService: BotpressService;
  private readonly contextService: ConversationContextService;

  constructor() {
    this.logger = new Logger('ConversationsService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.botpressService = BotpressService.getInstance();
    this.contextService = ConversationContextService.getInstance();
  }

  /**
   * Obtiene la instancia singleton del servicio
   * @returns Instancia del servicio
   */
  public static getInstance(): ConversationsService {
    if (!ConversationsService.instance) {
      ConversationsService.instance = new ConversationsService();
    }
    return ConversationsService.instance;
  }

  /**
   * Crea una nueva conversación para un usuario
   * @param userId ID del usuario
   * @param initialMessage Mensaje inicial opcional
   * @param metadata Metadatos adicionales para la conversación
   * @returns ID de la conversación creada
   */
  public async createConversation(
    userId: string,
    initialMessage?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const startTime = Date.now();

    try {
      this.logger.info('Creating new conversation', { userId });

      // Generar ID de conversación único
      const conversationId = `conv-${userId}-${Date.now()}`;

      // Inicializar la conversación en Botpress
      if (initialMessage) {
        // Si hay un mensaje inicial, enviarlo a Botpress
        await this.botpressService.sendMessage(
          userId, initialMessage, conversationId, true
        );
      } else {
        // Si no hay mensaje inicial, enviar un mensaje de sistema para inicializar la conversación
        await this.botpressService.sendMessage(
          userId,
          'Conversation initialized via WebSocket connection',
          conversationId,
          true
        );
      }

      // Crear contexto de conversación
      const context = {
        conversationId,
        userId,
        status: ConversationStatus.ACTIVE,
        type: ConversationType.BOT,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivity: Date.now(),
        messages: [],
        metadata: {
          ...metadata,
          createdVia: 'websocket'
        }
      };

      // Guardar contexto
      await this.contextService.saveContext(context);

      this.metrics.incrementCounter('ConversationsCreated');
      this.metrics.recordLatency('ConversationCreationLatency', Date.now() - startTime);

      this.logger.info('Conversation created successfully', {
        userId,
        conversationId,
        hasInitialMessage: !!initialMessage
      });

      return conversationId;
    } catch (error) {
      this.logger.error('Error creating conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      this.metrics.incrementCounter('ConversationCreationErrors');
      this.metrics.recordLatency('ConversationCreationLatency', Date.now() - startTime);

      throw new WebSocketError(
        'Failed to create conversation',
        500,
        { userId, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Crea una nueva conversación a partir de una conexión WebSocket
   * @param connection Conexión WebSocket
   * @param initialMessage Mensaje inicial opcional
   * @returns Objeto con el ID de la conversación y mensaje de respuesta
   */
  public async createConversationFromConnection(
    connection: Connection,
    initialMessage?: string
  ): Promise<{ conversationId: string, welcomeMessage: WSMessage }> {
    try {
      // Extraer metadatos relevantes de la conexión
      const metadata = {
        connectionId: connection.connectionId,
        userAgent: connection.metadata?.userAgent,
        platform: connection.metadata?.platform,
        clientType: connection.metadata?.clientType,
        clientVersion: connection.metadata?.clientVersion
      };

      // Crear la conversación
      const conversationId = await this.createConversation(
        connection.userId,
        initialMessage,
        metadata
      );

      // Crear mensaje de bienvenida
      const welcomeMessage: WSMessage = {
        messageId: uuidv4(),
        type: 'CONVERSATION_CREATED',
        conversationId,
        content: initialMessage
          ? 'Conversation started with initial message'
          : 'New conversation started',
        timestamp: new Date().toISOString(),
        metadata: {
          conversationId,
          userId: connection.userId,
          serverTime: new Date().toISOString()
        }
      };

      return { conversationId, welcomeMessage };
    } catch (error) {
      this.logger.error('Error creating conversation from connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: connection.connectionId,
        userId: connection.userId
      });

      throw error;
    }
  }

  /**
   * Obtiene todas las conversaciones activas de un usuario
   * @param userId ID del usuario
   * @returns Lista de conversaciones activas
   */
  public async getUserActiveConversations(userId: string): Promise<any[]> {
    try {
      // Usar el servicio de Botpress para obtener las conversaciones
      return await this.botpressService.listUserConversations(userId);
    } catch (error) {
      this.logger.error('Error getting user active conversations', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      throw new WebSocketError(
        'Failed to get user conversations',
        500,
        { userId, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Obtiene una conversación activa existente o crea una nueva si no existe
   * @param userId ID del usuario
   * @param metadata Metadatos adicionales para la conversación si se crea una nueva
   * @returns Objeto con el ID de la conversación y un indicador de si es nueva
   */
  public async getOrCreateConversation(
    userId: string,
    metadata?: Record<string, any>
  ): Promise<{ conversationId: string; isNew: boolean }> {
    try {
      this.logger.info('Getting or creating conversation for user', { userId });

      // Intentar obtener conversaciones activas del usuario
      const activeConversations = await this.getUserActiveConversations(userId);

      // Filtrar solo las conversaciones con estado ACTIVE
      const activeConvs = activeConversations.filter(conv =>
        conv.status === ConversationStatus.ACTIVE
      );

      // Si hay conversaciones activas, devolver la más reciente
      if (activeConvs.length > 0) {
        // Ordenar por fecha de actualización (más reciente primero)
        activeConvs.sort((a, b) => b.updatedAt - a.updatedAt);

        const mostRecentConversation = activeConvs[0];

        this.logger.info('Found existing active conversation', {
          userId,
          conversationId: mostRecentConversation.conversationId
        });

        return {
          conversationId: mostRecentConversation.conversationId,
          isNew: false
        };
      }

      // Si no hay conversaciones activas, crear una nueva
      this.logger.info('No active conversations found, creating new one', { userId });

      const conversationId = await this.createConversation(userId, undefined, metadata);

      return {
        conversationId,
        isNew: true
      };
    } catch (error) {
      this.logger.error('Error getting or creating conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      throw new WebSocketError(
        'Failed to get or create conversation',
        500,
        { userId, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Obtiene o crea una conversación a partir de una conexión WebSocket
   * @param connection Conexión WebSocket
   * @returns Objeto con el ID de la conversación, mensaje de bienvenida e indicador de si es nueva
   */
  public async getOrCreateConversationFromConnection(
    connection: Connection
  ): Promise<{ conversationId: string; welcomeMessage: WSMessage; isNew: boolean }> {
    try {
      // Extraer metadatos relevantes de la conexión
      const metadata = {
        connectionId: connection.connectionId,
        userAgent: connection.metadata?.userAgent,
        platform: connection.metadata?.platform,
        clientType: connection.metadata?.clientType,
        clientVersion: connection.metadata?.clientVersion
      };

      // Obtener o crear la conversación
      const { conversationId, isNew } = await this.getOrCreateConversation(
        connection.userId,
        metadata
      );

      // Crear mensaje de bienvenida
      const welcomeMessage: WSMessage = {
        messageId: uuidv4(),
        type: isNew ? 'CONVERSATION_CREATED' : 'CONVERSATION_RESUMED',
        conversationId,
        content: isNew
          ? 'New conversation started'
          : 'Existing conversation resumed',
        timestamp: new Date().toISOString(),
        metadata: {
          conversationId,
          userId: connection.userId,
          serverTime: new Date().toISOString(),
          isNew
        }
      };

      return { conversationId, welcomeMessage, isNew };
    } catch (error) {
      this.logger.error('Error getting or creating conversation from connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: connection.connectionId,
        userId: connection.userId
      });

      throw error;
    }
  }
}
