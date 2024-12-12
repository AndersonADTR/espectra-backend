// services/botpress/services/events/handoff-event.service.ts

import { EventBridge } from '@aws-sdk/client-eventbridge';
import { HandoffEvent, HandoffStatus } from '../../types/handoff.types';
import { HANDOFF_CONSTANTS } from '../../config/handoff.config';
import { WebSocketService } from '../../../websocket/services/websocket.service';
import { WSMessage } from '@services/websocket/types/websocket.types';
import { BaseService } from '../base/base.service';

export class HandoffEventService extends BaseService{
  
  private readonly eventBridge: EventBridge;
  private readonly wsService: WebSocketService;
  private readonly eventBusName: string;

  constructor() {
    super('HandoffEventService', 'Spectra/Handoff');
    this.eventBridge = new EventBridge({});
    this.wsService = new WebSocketService();
    this.eventBusName = process.env.HANDOFF_EVENT_BUS || '';

    if (!this.eventBusName) {
      throw new Error('HANDOFF_EVENT_BUS environment variable is not set');
    }
  }

  async publishEvent(event: HandoffEvent): Promise<void> {
    try {
      this.logger.info('Publishing handoff event', {
        type: event.type,
        queueId: event.queueId,
        conversationId: event.conversationId
      });

      await this.eventBridge.putEvents({
        Entries: [{
          EventBusName: this.eventBusName,
          Source: 'spectra.handoff',
          DetailType: event.type,
          Time: new Date(),
          Detail: JSON.stringify({
            ...event,
            timestamp: new Date().toISOString()
          })
        }]
      });

      this.metrics.incrementCounter(`HandoffEvent_${event.type}`);

      // Manejar notificaciones en tiempo real basadas en el tipo de evento
      await this.handleRealTimeNotifications(event);

      this.logger.debug('Handoff event published successfully', {
        type: event.type,
        queueId: event.queueId
      });
    } catch (error) {
      this.handleError(error, 'Failed to publish handoff event', {
        operationName: 'publishEvent',
        eventType: event.type,
        queueId: event.queueId
      });
    }
  }

  private async handleRealTimeNotifications(event: HandoffEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'handoff_requested':
          await this.notifyAdvisors(event);
          await this.notifyUser(event);
          break;

        case 'advisor_assigned':
          await this.notifyUserAssignment(event);
          break;

        case 'handoff_started':
          await this.notifyHandoffStart(event);
          break;

        case 'handoff_completed':
          await this.notifyHandoffCompletion(event);
          break;

        case 'status_updated':
          await this.notifyStatusUpdate(event);
          break;

        default:
          this.logger.warn('Unhandled event type for notifications', {
            type: event.type
          });
      }
    } catch (error) {
      this.logger.error('Failed to handle real-time notifications', {
        error,
        eventType: event.type,
        queueId: event.queueId
      });
      // No relanzamos el error para evitar que falle la publicación del evento
    }
  }

  private async notifyAdvisors(event: HandoffEvent): Promise<void> {
    const message: WSMessage = {
      type: 'HANDOFF_REQUEST',
      content: HANDOFF_CONSTANTS.MESSAGES.TO_ADVISOR.QUEUED,
      conversationId: event.conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        queueId: event.queueId,
        priority: event.data.priority,
        ...event.data
      }
    };

    // Broadcast a todos los asesores disponibles
    await this.wsService.broadcastMessage(message);
  }

  private async notifyUser(event: HandoffEvent): Promise<void> {
    if (!event.data.userId) {
      this.logger.warn('No userId provided for user notification', { event });
      return;
    }

    const message: WSMessage = {
      type: 'HANDOFF_REQUEST',
      content: HANDOFF_CONSTANTS.MESSAGES.TO_USER.QUEUED,
      conversationId: event.conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        queueId: event.queueId,
        status: 'queued'
      }
    };

    await this.wsService.sendToUser(event.data.userId, message);
  }

  private async notifyUserAssignment(event: HandoffEvent): Promise<void> {
    if (!event.data.userId) {
      this.logger.warn('No userId provided for assignment notification', { event });
      return;
    }

    const message: WSMessage = {
      type: 'HANDOFF_ACCEPTED',
      content: HANDOFF_CONSTANTS.MESSAGES.TO_USER.ASSIGNED,
      conversationId: event.conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        queueId: event.queueId,
        status: 'assigned',
        advisorId: event.data.advisorId
      }
    };

    await this.wsService.sendToUser(event.data.userId, message);
  }

  private async notifyHandoffStart(event: HandoffEvent): Promise<void> {
    // Notificar tanto al usuario como al asesor
  const userMessage: WSMessage = {
    type: 'HANDOFF_STARTED',
    content: HANDOFF_CONSTANTS.MESSAGES.TO_USER.ASSIGNED,
    conversationId: event.conversationId,
    timestamp: new Date().toISOString(),
    metadata: {
      queueId: event.queueId,
      status: 'active'
    }
  };

  const advisorMessage: WSMessage = {
    type: 'HANDOFF_STARTED',
    content: HANDOFF_CONSTANTS.MESSAGES.TO_ADVISOR.ASSIGNED,
    conversationId: event.conversationId,
    timestamp: new Date().toISOString(),
    metadata: {
      queueId: event.queueId,
      status: 'active'
    }
  };

  const promises = [
    this.wsService.sendToUser(event.data.userId!, userMessage),
    this.wsService.sendToUser(event.data.advisorId!, advisorMessage)
  ];

    await Promise.all(promises);
  }

  private async notifyHandoffCompletion(event: HandoffEvent): Promise<void> {
    if (!event.data.userId) {
      this.logger.warn('No userId provided for completion notification', { event });
      return;
    }

    const message: WSMessage = {
      type: 'HANDOFF_COMPLETED',
      content: HANDOFF_CONSTANTS.MESSAGES.TO_USER.COMPLETED,
      conversationId: event.conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        queueId: event.queueId,
        status: 'completed'
      }
    };

    await this.wsService.sendToUser(event.data.userId, message);
  }

  private async notifyStatusUpdate(event: HandoffEvent): Promise<void> {
    const { userId, advisorId, status } = event.data;

    if (userId) {
      await this.wsService.sendToUser(userId, {
        type: 'HANDOFF_STATUS',
        content: this.getStatusMessage(status, 'user'),
        conversationId: event.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          queueId: event.queueId,
          status
        }
      });
    }

    if (advisorId) {
      await this.wsService.sendToUser(advisorId, {
        type: 'HANDOFF_STATUS',
        content: this.getStatusMessage(status, 'advisor'),
        conversationId: event.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          queueId: event.queueId,
          status
        }
      });
    }
  }

  private getStatusMessage(status: HandoffStatus, recipient: 'user' | 'advisor'): string {
    const messages = recipient === 'user' 
      ? HANDOFF_CONSTANTS.MESSAGES.TO_USER 
      : HANDOFF_CONSTANTS.MESSAGES.TO_ADVISOR;
  
    // Mapeo de estados a keys de mensajes
    const messageMap: Record<HandoffStatus, keyof typeof HANDOFF_CONSTANTS.MESSAGES.TO_USER> = {
      pending: 'QUEUED',
      assigned: 'ASSIGNED',
      active: 'ACTIVE',
      completed: 'COMPLETED',
      cancelled: 'CANCELLED',
      timeout: 'TIMEOUT'
    };
  
    const messageKey = messageMap[status];
    
    if (messageKey && messageKey in messages) {
      return messages[messageKey];
    }
  
    this.logger.warn('No specific message found for status', {
      status,
      recipient,
      availableMessages: Object.keys(messages)
    });
  
    // Mensaje genérico como fallback
    return recipient === 'user'
      ? `Estado de la solicitud: ${status}`
      : `Estado de la conversación: ${status}`;
  }
}