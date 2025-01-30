import { WebSocketService } from '../../../websocket/services/websocket.service';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { SNS } from '@aws-sdk/client-sns';
import { BaseService } from '../base/base.service';
import { HandoffRequest } from '../../types/chat.types';
import { MESSAGE_TEMPLATES } from '../../config/chat-api.config';
import { WSMessage } from '@services/websocket/types/websocket.types';
import { HANDOFF_CONFIG } from '@services/botpress/config/config';

export class HandoffNotificationService extends BaseService {
  private readonly wsService: WebSocketService;
  private readonly eventBridge: EventBridge;
  private readonly sns: SNS;
  private readonly topicArn: string;

  constructor() {
    super('HandoffNotificationService');
    this.wsService = new WebSocketService();
    this.eventBridge = new EventBridge({});
    this.sns = new SNS({});
    this.topicArn = process.env.HANDOFF_NOTIFICATION_TOPIC || '';

    if (!this.topicArn) {
      throw new Error('HANDOFF_NOTIFICATION_TOPIC environment variable is not set');
    }
  }

  async notifyHandoffRequested(request: HandoffRequest): Promise<void> {
    try {
      await Promise.all([
        this.notifyUser(request),
        this.notifyAdvisors(request),
        this.publishEvent(request),
        this.sendSNSNotification(request)
      ]);

      this.metrics.incrementCounter('HandoffNotificationsSent');
    } catch (error) {
      this.handleError(error, 'Failed to send handoff notifications', {
        operationName: 'notifyHandoffRequested',
        conversationId: request.conversation_id
      });
    }
  }

  private async notifyUser(request: HandoffRequest): Promise<void> {
    await this.wsService.sendToUser(request.userId, {
      type: 'HANDOFF_STATUS',
      content: MESSAGE_TEMPLATES.HANDOFF_REQUESTED,
      conversationId: request.conversation_id,
      timestamp: new Date().toISOString(),
      metadata: {
        handoff: {
          requested: true,
          status: 'pending'
        }
      }
    });
  }

  private async notifyAdvisors(request: HandoffRequest): Promise<void> {
    const message = {
      type: 'HANDOFF_REQUEST',
      content: `Nueva solicitud de asistencia - ${request.message.substring(0, 100)}...`,
      conversationId: request.conversation_id,
      timestamp: new Date().toISOString(),
      metadata: {
        userId: request.userId,
        userInfo: request.metadata?.userInfo,
        priority: request.priority
      }
    } as WSMessage;

    await this.wsService.broadcastMessage(message);
  }

  private async publishEvent(request: HandoffRequest): Promise<void> {
    await this.eventBridge.putEvents({
      Entries: [{
        EventBusName: process.env.BOTPRESS_EVENT_BUS!,
        Source: 'spectra.handoff',
        DetailType: 'handoff_requested',
        Time: new Date(),
        Detail: JSON.stringify({
          conversationId: request.conversation_id,
          userId: request.userId,
          timestamp: new Date().toISOString(),
          metadata: request.metadata
        })
      }]
    });
  }

  private async sendSNSNotification(request: HandoffRequest): Promise<void> {
    await this.sns.publish({
      TopicArn: this.topicArn,
      Message: JSON.stringify({
        type: 'HANDOFF_REQUEST',
        conversationId: request.conversation_id,
        userId: request.userId,
        message: request.message,
        timestamp: new Date().toISOString(),
        metadata: request.metadata
      }),
      MessageAttributes: {
        type: {
          DataType: 'String',
          StringValue: 'HANDOFF_REQUEST'
        },
        priority: {
          DataType: 'String',
          StringValue: request.priority || HANDOFF_CONFIG.DEFAULT_PRIORITY
        }
      }
    });
  }
}