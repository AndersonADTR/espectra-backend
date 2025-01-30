import { WebSocketService } from '../../../websocket/services/websocket.service';
import { HandoffService } from '../handoff.service';
import { MessageHandlerService } from '../message-handler.service';
import { BaseService } from '../base/base.service';
import { WebhookPayload } from '../../types/webhook.types';
import { MESSAGE_TEMPLATES } from '../../config/chat-api.config';
import { HANDOFF_CONFIG } from '@services/botpress/config/config';

export class BotpressWebhookService extends BaseService {
  private readonly wsService: WebSocketService;
  private readonly handoffService: HandoffService;
  private readonly messageHandler: MessageHandlerService;

  constructor() {
    super('BotpressWebhookService');
    this.wsService = new WebSocketService();
    this.handoffService = new HandoffService();
    this.messageHandler = new MessageHandlerService();
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    try {
      this.logger.info('Processing webhook payload', {
        type: payload.type,
        conversationId: payload.payload.conversationId
      });

      switch (payload.type) {
        case 'message':
          await this.handleBotMessage(payload);
          break;
        case 'handoff_requested':
          await this.handleHandoffRequest(payload);
          break;
        case 'handoff_accepted':
          await this.handleHandoffAccepted(payload);
          break;
        case 'typing':
          await this.handleTypingIndicator(payload);
          break;
        default:
          this.logger.warn('Unhandled webhook type', { type: payload.type });
      }

      this.metrics.incrementCounter(`Webhook_${payload.type}`);
    } catch (error) {
      this.handleError(error, 'Failed to process webhook', {
        operationName: 'handleWebhook',
        webhookType: payload.type
      });
    }
  }

  private async handleBotMessage(payload: WebhookPayload): Promise<void> {
    const { conversationId, userId, message } = payload.payload;
    
    await this.wsService.sendToUser(userId, {
      type: 'BOT_RESPONSE',
      content: message,
      conversationId,
      timestamp: new Date().toISOString(),
      metadata: payload.payload.metadata
    });
  }

  private async handleHandoffRequest(payload: WebhookPayload): Promise<void> {
    const { conversationId, userId } = payload.payload;

    // Notificar al usuario
    await this.wsService.sendToUser(userId, {
      type: 'HANDOFF_STATUS',
      content: MESSAGE_TEMPLATES.HANDOFF_REQUESTED,
      conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        handoff: {
          requested: true,
          status: 'pending'
        }
      }
    });

    // Iniciar proceso de handoff
    await this.handoffService.requestHandoff({
      conversation_id: conversationId,
      userId,
      message: payload.payload.message || '',
      timestamp: new Date().toISOString(),
      metadata: payload.payload.metadata,
      priority: HANDOFF_CONFIG.DEFAULT_PRIORITY
    });
  }

  private async handleHandoffAccepted(payload: WebhookPayload): Promise<void> {
    const { conversationId, userId, agentId } = payload.payload;

    await this.wsService.sendToUser(userId, {
      type: 'HANDOFF_STATUS',
      content: MESSAGE_TEMPLATES.HANDOFF_STARTED,
      conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        handoff: {
          status: 'accepted',
          agentId
        }
      }
    });
  }

  private async handleTypingIndicator(payload: WebhookPayload): Promise<void> {
    const { conversationId, userId } = payload.payload;

    await this.wsService.sendToUser(userId, {
      type: 'TYPING_INDICATOR',
      content: '',
      conversationId,
      timestamp: new Date().toISOString()
    });
  }
}