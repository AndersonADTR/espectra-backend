// services/botpress/services/events/event-processor.service.ts

import { EventBridge } from '@aws-sdk/client-eventbridge';
import { BotpressEvent, BotpressEventType } from '../../types/botpress.types';
import { HandoffService } from '../handoff.service';
import { WebSocketService } from '../../../websocket/services/websocket.service';
import { CHAT_API_CONFIG, MESSAGE_TEMPLATES } from '../../config/chat-api.config';
import { BaseService } from '../base/base.service';

export class EventProcessorService extends BaseService {
  private readonly eventBridge: EventBridge;
  private readonly handoffService: HandoffService;
  private readonly wsService: WebSocketService;
  private readonly eventBusName: string;

  constructor() {
    super('EventProcessorService');
    this.eventBridge = new EventBridge({});
    this.handoffService = new HandoffService();
    this.wsService = new WebSocketService();
    this.eventBusName = process.env.BOTPRESS_EVENT_BUS || '';

    if (!this.eventBusName) {
      throw new Error('BOTPRESS_EVENT_BUS environment variable is not set');
    }
  }

  async processEvent(event: BotpressEvent): Promise<void> {
    try {
      this.validateEvent(event);

      this.logger.info('Processing chat event', {
        type: event.type,
        userId: event.target,
        conversationId: event.threadId
      });

      await this.routeEvent(event);
      await this.publishToEventBus(event);

      this.metrics.incrementCounter(`Event_${event.type}`);

    } catch (error) {
      this.handleError(error, 'Failed to process event', {
        operationName: 'processEvent',
        eventType: event.type
      });
    }
  }

  private validateEvent(event: BotpressEvent): void {
    if (!this.isValidEventType(event.type)) {
      throw new Error('Invalid event type');
    }
  }

  private async routeEvent(event: BotpressEvent): Promise<void> {
    switch (event.type) {
      case 'handoff':
        await this.handleHandoffEvent(event);
        break;
      case 'typing':
        await this.handleTypingEvent(event);
        break;
      case 'message':
        await this.handleMessageEvent(event);
        break;
      default:
        this.logger.warn('Unhandled event type', { type: event.type });
    }
  }

  private async handleHandoffEvent(event: BotpressEvent): Promise<void> {
    const { status, conversationId, userId } = event.payload;

    switch (status) {
      case 'requested':
        await this.notifyUser(userId, {
          type: 'HANDOFF_STATUS',
          content: MESSAGE_TEMPLATES.HANDOFF_REQUESTED,
          conversationId,
          timestamp: new Date().toISOString()
        });
        break;

      case 'started':
        await this.notifyUser(userId, {
          type: 'HANDOFF_STATUS',
          content: MESSAGE_TEMPLATES.HANDOFF_STARTED,
          conversationId,
          timestamp: new Date().toISOString(),
          metadata: { agentId: event.payload.agentId }
        });
        break;

      case 'ended':
        await this.notifyUser(userId, {
          type: 'HANDOFF_STATUS',
          content: MESSAGE_TEMPLATES.HANDOFF_ENDED,
          conversationId,
          timestamp: new Date().toISOString()
        });
        break;
    }
  }

  private async handleTypingEvent(event: BotpressEvent): Promise<void> {
    await this.wsService.sendToUser(event.target, {
      type: 'TYPING_INDICATOR',
      content: '',
      conversationId: event.threadId!,
      timestamp: event.createdAt
    });
  }

  private async handleMessageEvent(event: BotpressEvent): Promise<void> {
    await this.wsService.sendToUser(event.target, {
      type: 'BOT_RESPONSE',
      content: event.payload.text,
      conversationId: event.threadId!,
      timestamp: event.createdAt,
      metadata: event.payload.metadata
    });
  }

  private async publishToEventBus(event: BotpressEvent): Promise<void> {
    await this.eventBridge.putEvents({
      Entries: [{
        EventBusName: this.eventBusName,
        Source: 'spectra.botpress.chat',
        DetailType: event.type,
        Time: new Date(event.createdAt),
        Detail: JSON.stringify(event)
      }]
    });
  }

  private isValidEventType(type: string): type is BotpressEventType {
    return ['message', 'handoff', 'typing', 'error'].includes(type);
  }

  private async notifyUser(userId: string, message: any): Promise<void> {
    await this.wsService.sendToUser(userId, message);
  }
}