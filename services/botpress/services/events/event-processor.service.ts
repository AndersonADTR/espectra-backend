// services/botpress/services/event/event-processor.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';
import { BotpressEvent, BotpressEventType } from '../../types/botpress.types';
import { BotpressChatService } from '../chat/botpress-chat.service';
import { HandoffService } from '../../services/handoff.service';
import { TokenManagementService } from '../token/token-management.service';
import { EventBridge } from '@aws-sdk/client-eventbridge';

export class EventProcessorService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly chatService: BotpressChatService;
  private readonly handoffService: HandoffService;
  private readonly tokenService: TokenManagementService;
  private readonly eventBridge: EventBridge;
  private readonly eventBusName: string;

  constructor() {
    this.logger = new Logger('EventProcessorService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.chatService = new BotpressChatService();
    this.handoffService = new HandoffService();
    this.tokenService = new TokenManagementService();
    this.eventBridge = new EventBridge({});
    this.eventBusName = process.env.BOTPRESS_EVENT_BUS || '';

    if (!this.eventBusName) {
      throw new Error('BOTPRESS_EVENT_BUS environment variable is not set');
    }
  }

  async processEvent(event: BotpressEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.validateEvent(event);

      this.logger.info('Processing Botpress event', {
        type: event.type,
        botId: event.botId,
        userId: event.target
      });

      // Procesar el evento según su tipo
      await this.routeEvent(event);

      // Publicar evento en EventBridge para procesamiento asíncrono adicional
      await this.publishToEventBus(event);

      // Registrar métricas
      const processingTime = Date.now() - startTime;
      this.metrics.recordLatency('EventProcessingTime', processingTime);
      this.metrics.incrementCounter(`Event_${event.type}`);

    } catch (error) {
      this.logger.error('Failed to process event', {
        error,
        eventType: event.type,
        botId: event.botId
      });

      this.metrics.incrementCounter('EventProcessingErrors');
      throw new BotpressError('Event processing failed', { originalError: error });
    }
  }

  private validateEvent(event: BotpressEvent): void {
    if (!event.type || !this.isValidEventType(event.type)) {
      throw new BotpressError('Invalid event type');
    }

    if (!event.botId) {
      throw new BotpressError('Missing bot ID');
    }

    if (!event.target) {
      throw new BotpressError('Missing target user ID');
    }
  }

  private isValidEventType(type: string): type is BotpressEventType {
    const validTypes: BotpressEventType[] = [
      'message',
      'handoff',
      'session',
      'feedback',
      'typing',
      'error'
    ];
    return validTypes.includes(type as BotpressEventType);
  }

  private async routeEvent(event: BotpressEvent): Promise<void> {
    switch (event.type) {
      case 'message':
        await this.handleMessageEvent(event);
        break;
      case 'handoff':
        await this.handleHandoffEvent(event);
        break;
      case 'session':
        await this.handleSessionEvent(event);
        break;
      case 'feedback':
        await this.handleFeedbackEvent(event);
        break;
      case 'typing':
        await this.handleTypingEvent(event);
        break;
      case 'error':
        await this.handleErrorEvent(event);
        break;
      default:
        this.logger.warn('Unhandled event type', { type: event.type });
    }
  }

  private async handleMessageEvent(event: BotpressEvent): Promise<void> {
    // Validar y registrar tokens si es necesario
    if (event.payload.userId) {
      await this.tokenService.validateAndTrackTokens(
        event.payload.userId,
        this.calculateTokens(event.payload),
        event.payload.planType || 'basic'
      );
    }

    // Procesar el mensaje
    await this.chatService.processMessage({
      conversationId: event.messageId || `msg_${Date.now()}`,
      text: event.payload.text || '',
      userId: event.target,
      metadata: event.payload.metadata
    });
  }

  private async handleHandoffEvent(event: BotpressEvent): Promise<void> {
    if (event.payload.status === 'requested') {
      await this.handoffService.requestHandoff({
        conversation_id: event.payload.conversationId,
        userId: event.target,
        timestamp: event.createdAt,
        metadata: event.payload.metadata
      });
    } else if (event.payload.status === 'completed') {
      await this.handoffService.completeHandoff(event.payload.conversationId);
    }
  }

  private async handleSessionEvent(event: BotpressEvent): Promise<void> {
    this.metrics.incrementCounter(`Session_${event.payload.status}`);
    
    await this.publishToEventBus({
      ...event
      //type: 'session_update'
    });
  }

  private async handleFeedbackEvent(event: BotpressEvent): Promise<void> {
    if (event.payload.rating) {
      this.metrics.recordMetric('UserFeedback', event.payload.rating);
    }
  }

  private async handleTypingEvent(event: BotpressEvent): Promise<void> {
    // Manejar indicadores de escritura si es necesario
    this.metrics.incrementCounter('TypingIndicators');
  }

  private async handleErrorEvent(event: BotpressEvent): Promise<void> {
    this.logger.error('Botpress error event received', {
      error: event.payload,
      userId: event.target
    });

    this.metrics.incrementCounter('BotpressErrors');
  }

  private async publishToEventBus(event: BotpressEvent): Promise<void> {
    try {
      await this.eventBridge.putEvents({
        Entries: [{
          EventBusName: this.eventBusName,
          Source: 'spectra.botpress',
          DetailType: event.type,
          Time: new Date(event.createdAt),
          Detail: JSON.stringify(event)
        }]
      });

      this.logger.debug('Event published to EventBus', {
        type: event.type,
        eventId: event.id
      });
    } catch (error) {
      this.logger.error('Failed to publish event to EventBus', {
        error,
        eventType: event.type
      });
      // No relanzamos el error para no interrumpir el flujo principal
    }
  }

  private calculateTokens(payload: any): number {
    let tokens = 0;
    
    if (payload.text) {
      tokens += Math.ceil(payload.text.length / 4);
    }
    
    if (payload.buttons) {
      tokens += payload.buttons.length * 2;
    }

    return tokens;
  }
}