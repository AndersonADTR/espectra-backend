// services/botpress/services/message-handler.service.ts

import { BotpressService } from './botpress.service';
import { BotpressValidationError } from '../utils/errors';
import { ChatMessage, ChatResponse } from '../types/chat.types';
import { MONITORING_CONFIG, CHAT_CONFIG } from '../config/config';
import { BaseService } from './base/base.service';

export class MessageHandlerService extends BaseService {
  
  private readonly botpressService: BotpressService;

  constructor() {
    super('MessageHandlerService', MONITORING_CONFIG.METRICS.NAMESPACE);
    this.botpressService = new BotpressService();
  }

  async handleIncomingMessage(message: {
    userId: string;
    conversationId: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<ChatResponse> {
    try {
      this.validateMessage(message);

      this.logger.info('Processing incoming message', {
        userId: message.userId,
        conversationId: message.conversationId
      });

      const chatMessage: ChatMessage = {
        conversationId: message.conversationId,
        message: message.content,
        userId: message.userId,
        metadata: {
          timestamp: new Date().toISOString(),
          ...message.metadata
        },
        text: undefined
      };

      const startTime = Date.now();
      const response = await this.botpressService.sendMessage(chatMessage);
      const processingTime = Date.now() - startTime;

      this.metrics.recordLatency('MessageProcessingTime', processingTime);
      
      // Detectar si necesitamos handoff basado en las respuestas
      if (this.shouldInitiateHandoff(response)) {
        await this.handleHandoffRequest(chatMessage);
      }

      this.metrics.incrementCounter('ProcessedMessages');

      this.logger.info('Message processed successfully', {
        userId: message.userId,
        conversationId: message.conversationId,
        processingTime
      });

      return response;
    } catch (error) {
      this.handleError(error, 'Failed to process message', {
        operationName: 'MessageProcessing',
        userId: message.userId,
        conversationId: message.conversationId
      });
    }
  }

  private validateMessage(message: {
    content: string;
    userId: string;
    conversationId: string;
  }): void {
    if (!message.content?.trim()) {
      throw new BotpressValidationError('Message content cannot be empty');
    }

    if (message.content.length > CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
      throw new BotpressValidationError(
        `Message exceeds maximum length of ${CHAT_CONFIG.MAX_MESSAGE_LENGTH} characters`
      );
    }

    if (!message.userId) {
      throw new BotpressValidationError('User ID is required');
    }

    if (!message.conversationId) {
      throw new BotpressValidationError('Conversation ID is required');
    }
  }

  private shouldInitiateHandoff(response: ChatResponse): boolean {
    return response.responses.some(
      (r) => 
        r.type === 'handoff' ||
        r.tags?.includes('handoff') ||
        r.metadata?.handoff?.requested
    );
  }

  private async handleHandoffRequest(message: ChatMessage): Promise<void> {
    try {
      this.logger.info('Initiating handoff request', {
        conversationId: message.conversationId,
        userId: message.userId
      });

      await this.botpressService.initiateHandoff({
        conversation_id: message.conversationId,
        userId: message.userId,
        message: message.message,
        timestamp: new Date().toISOString(),
        metadata: {
          contextData: message.metadata?.context,
          userInfo: {
            name: message.metadata?.source,
            email: message.metadata?.sessionId
          },
          connectionId: message.metadata?.context?.connectionId
        }
      });

      this.metrics.incrementCounter('HandoffRequests');
    } catch (error) {
      this.logger.error('Failed to initiate handoff', {
        error,
        conversationId: message.conversationId,
        userId: message.userId
      });
      // No relanzamos el error para no interrumpir el flujo del mensaje
    }
  }

  async validateBotHealth(): Promise<boolean> {
    try {
      const isHealthy = await this.botpressService.checkBotHealth();
      this.metrics.recordMetric('BotHealthCheck', isHealthy ? 1 : 0);
      return isHealthy;
    } catch (error) {
      this.logger.error('Bot health check failed', { error });
      this.metrics.recordMetric('BotHealthCheck', 0);
      return false;
    }
  }
}