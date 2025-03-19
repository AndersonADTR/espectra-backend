// services/botpress/services/message/message-processor.service.ts

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConversationContextService } from '../context/conversation-context.service';
import { TokenManagementService } from '../token/token-management.service';
import { BotpressService } from '../botpress/botpress.service';
import { WebSocketService } from '@services/websocket/services/websocket.service';
import { BotpressMessageTransformer } from '../botpress/transformers/message-transformer.service';
import { ConversationStatus, ConversationType } from '../../types/conversation-context.types';
import { HandoffDetectionService } from '../handoff/handoff-detection.service';

export interface ProcessedMessage {
  messageId: string;
  conversationId: string;
  userId: string;
  content: any;
  timestamp: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface IncomingMessage {
  userId: string;
  connectionId?: string;
  conversationId?: string;
  content: string | any;
  type?: string;
  metadata?: Record<string, any>;
}

export class MessageProcessorService {
  private static instance: MessageProcessorService;
  private readonly contextService: ConversationContextService;
  private readonly tokenService: TokenManagementService;
  private readonly botpressService: BotpressService;
  private readonly websocketService: WebSocketService;
  private readonly handoffDetectionService: HandoffDetectionService;
  private readonly messageTransformer: BotpressMessageTransformer;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  private constructor() {
    this.contextService = ConversationContextService.getInstance();
    this.tokenService = TokenManagementService.getInstance();
    this.botpressService = BotpressService.getInstance();
    this.websocketService = new WebSocketService();
    this.handoffDetectionService = HandoffDetectionService.getInstance();
    this.messageTransformer = new BotpressMessageTransformer();
    this.logger = new Logger('MessageProcessorService');
    this.metrics = new MetricsService('MessageProcessor');
  }

  public static getInstance(): MessageProcessorService {
    if (!MessageProcessorService.instance) {
      MessageProcessorService.instance = new MessageProcessorService();
    }
    return MessageProcessorService.instance;
  }

  /**
   * Procesa un mensaje entrante a través del pipeline completo
   * @param message Mensaje entrante
   * @returns Mensaje procesado
   */
  public async processIncomingMessage(message: IncomingMessage): Promise<ProcessedMessage> {
    const startTime = Date.now();
    const messageId = uuidv4();
    
    try {
      this.logger.info('Processing incoming message', {
        userId: message.userId,
        conversationId: message.conversationId,
        messageType: message.type || 'text'
      });
      
      this.metrics.incrementCounter('IncomingMessagesReceived');
      
      // Validación inicial del mensaje
      this.validateMessage(message);
      
      // Determinar ID de conversación (usar existente o crear uno nuevo)
      const conversationId = message.conversationId || `conv-${message.userId}-${Date.now()}`;
      
      // Verificar tokens disponibles
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      const estimatedTokens = this.messageTransformer.estimateTokenCount(content);
      
      const hasTokens = await this.tokenService.checkTokenAvailability(message.userId, estimatedTokens);
      if (!hasTokens) {
        this.logger.warn('Insufficient tokens for message processing', { 
          userId: message.userId, 
          estimatedTokens,
          conversationId
        });
        
        this.metrics.incrementCounter('InsufficientTokens');
        
        // Notificar al usuario sobre tokens insuficientes
        if (message.connectionId) {
          await this.websocketService.sendMessage(message.connectionId, {
            type: 'ERROR',
            conversationId,
            content: 'Insufficient tokens for this operation. Please upgrade your plan or wait for your tokens to reset.',
            timestamp: new Date().toISOString()
          });
        }
        
        throw new Error('Insufficient tokens for this operation');
      }
      
      // Procesar basado en el estado de la conversación
      let context = await this.contextService.getContext(conversationId);
      
      // Si es una nueva conversación, crear contexto
      if (!context) {
        context = {
          conversationId,
          userId: message.userId,
          status: ConversationStatus.ACTIVE,
          type: ConversationType.BOT,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastActivity: Date.now(),
          messages: [],
          metadata: message.metadata
        };
        
        await this.contextService.saveContext(context);
        this.metrics.incrementCounter('ConversationsCreated');
      }
      
      // Enviar feedback de recepción al cliente si hay ID de conexión
      if (message.connectionId) {
        await this.websocketService.sendMessage(message.connectionId, {
          type: 'MESSAGE_RECEIVED',
          messageId,
          conversationId,
          timestamp: new Date().toISOString()
        });
      }
      
      // Añadir mensaje al historial de conversación
      await this.contextService.addMessage(conversationId, {
        role: 'user',
        content,
        timestamp: Date.now()
      });
      
      // Si la conversación está en estado de handoff, enviar a asesor
      if (context.status === ConversationStatus.PENDING_HANDOFF || 
          context.status === ConversationStatus.WITH_ADVISOR) {
        // Lógica para enviar al asesor (Fase 3)
        // Este código se implementará en la Fase 3
        this.logger.info('Message in handoff state, forwarding to advisor', {
          conversationId,
          userId: message.userId,
          status: context.status
        });
        
        // Por ahora, solo guardamos el mensaje y enviamos confirmación
        const processedMessage: ProcessedMessage = {
          messageId,
          conversationId,
          userId: message.userId,
          content: message.content,
          timestamp: new Date().toISOString(),
          type: message.type || 'text',
          metadata: {
            ...message.metadata,
            status: 'forwarded_to_advisor'
          }
        };
        
        this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
        return processedMessage;
      }
      
      // Procesar con Botpress
      const botpressResponse = await this.botpressService.sendMessage(
        message.userId,
        message.content,
        conversationId
      );
      
      // Verificar si se necesita handoff basado en la respuesta
      // Aquí usamos el HandoffDetectionService que implementaremos en la Fase 3
      // Por ahora, solo verificamos el estado pero no iniciamos el handoff
      const shouldHandoff = await this.checkForHandoff(message, botpressResponse);
      
      if (shouldHandoff) {
        this.logger.info('Handoff required, will be implemented in phase 3', {
          conversationId,
          userId: message.userId
        });
        
        // En Fase 3, aquí iniciaríamos el proceso de handoff
      }
      
      // Construir mensaje procesado
      const processedMessage: ProcessedMessage = {
        messageId,
        conversationId,
        userId: message.userId,
        content: botpressResponse.messages,
        timestamp: new Date().toISOString(),
        type: 'bot_response',
        metadata: {
          ...message.metadata,
          tokens: botpressResponse.tokens,
          shouldHandoff
        }
      };
      
      this.metrics.incrementCounter('MessagesProcessed');
      this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
      
      return processedMessage;
    } catch (error) {
      this.logger.error('Error processing message', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: message.userId,
        conversationId: message.conversationId
      });
      
      this.metrics.incrementCounter('MessageProcessingErrors');
      this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Valida un mensaje entrante
   * @param message Mensaje a validar
   * @throws Error si el mensaje no es válido
   */
  private validateMessage(message: IncomingMessage): void {
    if (!message.userId) {
      throw new Error('Message must include userId');
    }
    
    if (!message.content) {
      throw new Error('Message must include content');
    }
  }

  /**
   * Comprueba si se necesita handoff basado en la respuesta de Botpress
   * Este es un placeholder que se implementará completamente en la Fase 3
   * @param message Mensaje original
   * @param botpressResponse Respuesta de Botpress
   * @returns true si se necesita handoff
   */
  private async checkForHandoff(message: IncomingMessage, botpressResponse: any): Promise<boolean> {
    // Implementación básica para la Fase 2, se completará en la Fase 3
    // Simplemente verificamos flags básicos
    
    // Si el mensaje contiene solicitud explícita de handoff
    if (typeof message.content === 'string' && 
        (message.content.toLowerCase().includes('hablar con asesor') || 
         message.content.toLowerCase().includes('hablar con humano') ||
         message.content.toLowerCase().includes('hablar con agente') ||
         message.content.toLowerCase().includes('speak to agent') ||
         message.content.toLowerCase().includes('speak to human'))) {
      return true;
    }
    
    // Si la respuesta de Botpress tiene un flag de handoff
    if (botpressResponse.metadata?.needsHandoff) {
      return true;
    }
    
    // Verificar confianza baja (si está disponible)
    if (botpressResponse.metadata?.confidence && 
        botpressResponse.metadata.confidence < 0.5) {
      return true;
    }
    
    return false;
  }
}