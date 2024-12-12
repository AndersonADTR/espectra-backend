// services/botpress/services/webhook/webhook-handler.service.ts

import { BotpressError } from '../../utils/errors';
import { BotpressEvent, BotpressMessage } from '../../types/botpress.types';
import { BotpressChatService } from '../chat/botpress-chat.service';
import { HandoffService } from '../../services/handoff.service';
import { TokenManagementService } from '../token/token-management.service';
import { RequestValidatorMiddleware } from '../../middleware/request-validator.middleware';
import { WebhookPayload } from '@services/botpress/types/webhook.types';
import { BaseService } from '../base/base.service';

export class WebhookHandlerService extends BaseService {
  
  private readonly chatService: BotpressChatService;
  private readonly handoffService: HandoffService;
  private readonly tokenService: TokenManagementService;
  private readonly validator: RequestValidatorMiddleware;

  constructor() {
    super('WebhookHandler');
    this.chatService = new BotpressChatService();
    this.handoffService = new HandoffService();
    this.tokenService = new TokenManagementService();
    this.validator = new RequestValidatorMiddleware();
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    try {
      this.validateWebhook(payload);
      
      const startTime = Date.now();
      
      // Registrar recepción del webhook
      this.logger.info('Webhook received', {
        type: payload.type,
        botId: payload.botId,
        timestamp: payload.timestamp
      });

      switch (payload.type) {
        case 'message':
          await this.handleMessageWebhook(payload);
          break;
        case 'handoff':
          await this.handleHandoffWebhook(payload);
          break;
        case 'session':
          await this.handleSessionWebhook(payload);
          break;
        case 'feedback':
          await this.handleFeedbackWebhook(payload);
          break;
        default:
          this.logger.warn('Unhandled webhook type', { type: payload.type });
      }

      // Registrar métricas
      const processingTime = Date.now() - startTime;
      this.metrics.recordLatency('WebhookProcessingTime', processingTime);
      this.metrics.incrementCounter(`Webhook_${payload.type}`);

    } catch (error) {
      this.handleError(error, 'Failed to handle webhook', { 
        operationName: 'handleWebhook',
        type: payload.type, 
        botId: payload.botId 
      });
    }
  }

  private validateWebhook(payload: WebhookPayload): void {
    if (!payload.type) {
      throw new BotpressError('Missing webhook type');
    }
    if (!payload.botId) {
      throw new BotpressError('Missing bot ID');
    }
    if (!payload.timestamp) {
      throw new BotpressError('Missing timestamp');
    }
  }

  private async handleMessageWebhook(payload: WebhookPayload): Promise<void> {
    const message = payload.payload as BotpressMessage;
    
    try {
      // Validar mensaje
      this.validator.validateMessage(message);

      // Verificar y registrar uso de tokens
      if (message.metadata?.userId) {
        await this.tokenService.validateAndTrackTokens(
          message.metadata.userId,
          this.calculateTokens(message),
          message.metadata.planType || 'basic'
        );
      }

      // Procesar mensaje
      await this.chatService.processMessage({
        conversationId: message.id,
        text: message.payload.text || '',
        userId: message.metadata?.userId || 'anonymous',
        metadata: message.metadata
      });

    } catch (error) {
      this.handleError(error, 'Failed to handle message webhook', {
        operationName: 'handleMessageWebhook',
        messageId: message.id
      });
    }
  }

  private async handleHandoffWebhook(payload: WebhookPayload): Promise<void> {
    try {
      const handoffData = payload.payload;
      
      if (handoffData.status === 'requested') {
        await this.handoffService.requestHandoff({
          conversation_id: handoffData.conversationId,
          userId: handoffData.userId,
          timestamp: payload.timestamp,
          metadata: handoffData.metadata,
          message: handoffData.message
        });
      } else if (handoffData.status === 'completed') {
        await this.handoffService.completeHandoff(handoffData.conversationId);
      }

    } catch (error) {
      this.handleError(error, 'Failed to handle handoff webhook', {
        operationName: 'handleHandoffWebhook',
        conversationId: payload.payload.conversationId
      });
    }
  }

  private async handleSessionWebhook(payload: WebhookPayload): Promise<void> {
    try {
      // Actualizar métricas de sesión
      this.metrics.incrementCounter(`Session_${payload.payload.status}`);
      
      this.logger.info('Session event received', {
        status: payload.payload.status,
        userId: payload.payload.userId
      });

    } catch (error) {
      this.handleError(error, 'Failed to handle session webhook', {
        operationName: 'handleSessionWebhook',
        userId: payload.payload.userId
      });
    }
  }

  private async handleFeedbackWebhook(payload: WebhookPayload): Promise<void> {
    try {
      // Registrar feedback y métricas
      this.metrics.recordMetric('UserFeedback', payload.payload.rating || 0);
      
      this.logger.info('Feedback received', {
        rating: payload.payload.rating,
        userId: payload.payload.userId
      });

    } catch (error) {
      this.handleError(error, 'Failed to handle feedback webhook', {
        operationName: 'handleFeedbackWebhook',
        userId: payload.payload.userId
      });
    }
  }

  private calculateTokens(message: BotpressMessage): number {
    // Implementar lógica de cálculo de tokens según el contenido
    let tokens = 0;
    
    if (message.payload.text) {
      // Aproximadamente 1 token por cada 4 caracteres
      tokens += Math.ceil(message.payload.text.length / 4);
    }
    
    if (message.payload.buttons) {
      // Tokens adicionales por botones
      tokens += message.payload.buttons.length * 2;
    }

    return tokens;
  }
}