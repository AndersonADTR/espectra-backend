// services/botpress/middleware/request-validator.middleware.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ValidationError } from '@shared/utils/errors';
import { 
  BotpressMessage, 
  MessagePayload
} from '../types/botpress.types';
import { HandoffRequest } from '../types/chat.types';
import { CHAT_CONFIG } from '../config/config';

export class RequestValidatorMiddleware {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  constructor() {
    this.logger = new Logger('RequestValidatorMiddleware');
    this.metrics = new MetricsService('Spectra/Botpress');
  }

  validateMessage(message: Partial<BotpressMessage>): BotpressMessage {
    try {
      // Validar campos requeridos
      if (!message.type) {
        throw new ValidationError('Message type is required');
      }

      if (!message.payload) {
        throw new ValidationError('Message payload is required');
      }

      // Validar tipo de mensaje
      if (!this.isValidMessageType(message.type)) {
        throw new ValidationError(`Invalid message type: ${message.type}`);
      }

      // Validar payload según el tipo
      this.validatePayload(message.type, message.payload);

      // Validar metadata si existe
      if (message.metadata) {
        this.validateMetadata(message.metadata);
      }

      // Validar tamaño del mensaje
      this.validateMessageSize(message);

      this.metrics.incrementCounter('ValidMessageRequests');

      return message as BotpressMessage;
    } catch (error) {
      this.metrics.incrementCounter('InvalidMessageRequests');
      this.logger.error('Message validation failed', { error, message });
      throw error;
    }
  }

  validateHandoffRequest(request: Partial<HandoffRequest>): HandoffRequest {
    try {
      if (!request.conversation_id) {
        throw new ValidationError('Conversation ID is required');
      }

      if (!request.userId) {
        throw new ValidationError('User ID is required');
      }

      // Validar prioridad si existe
      if (request.priority && !['low', 'medium', 'high'].includes(request.priority)) {
        throw new ValidationError('Invalid priority level');
      }

      // Validar metadata si existe
      if (request.metadata) {
        this.validateHandoffMetadata(request.metadata);
      }

      this.metrics.incrementCounter('ValidHandoffRequests');

      return request as HandoffRequest;
    } catch (error) {
      this.metrics.incrementCounter('InvalidHandoffRequests');
      this.logger.error('Handoff request validation failed', { error, request });
      throw error;
    }
  }

  private isValidMessageType(type: string): boolean {
    const validTypes = [
      'text',
      'image',
      'card',
      'carousel',
      'file',
      'audio',
      'video',
      'location',
      'quick_reply',
      'custom'
    ];
    return validTypes.includes(type);
  }

  private validatePayload(type: string, payload: MessagePayload): void {
    switch (type) {
      case 'text':
        if (!payload.text?.trim()) {
          throw new ValidationError('Text messages require non-empty text content');
        }
        if (payload.text.length > CHAT_CONFIG.MAX_MESSAGE_LENGTH) {
            throw new ValidationError(`Text exceeds maximum length of ${CHAT_CONFIG.MAX_MESSAGE_LENGTH} characters`);
          }
        break;

      case 'quick_reply':
        if (!payload.text?.trim()) {
          throw new ValidationError('Quick replies require text content');
        }
        if (!Array.isArray(payload.buttons) || payload.buttons.length === 0) {
          throw new ValidationError('Quick replies require at least one button');
        }
        payload.buttons.forEach(this.validateButton);
        break;

      case 'card':
        if (!payload.title?.trim()) {
          throw new ValidationError('Cards require a title');
        }
        if (payload.buttons) {
          payload.buttons.forEach(this.validateButton);
        }
        break;

      case 'carousel':
        if (!Array.isArray(payload.items) || payload.items.length === 0) {
          throw new ValidationError('Carousel requires at least one item');
        }
        payload.items.forEach(item => {
          if (!item.title?.trim()) {
            throw new ValidationError('Carousel items require a title');
          }
          if (item.buttons) {
            item.buttons.forEach(this.validateButton);
          }
        });
        break;

      case 'location':
        if (!payload.coordinates || 
            typeof payload.coordinates.latitude !== 'number' || 
            typeof payload.coordinates.longitude !== 'number') {
          throw new ValidationError('Location messages require valid coordinates');
        }
        break;
    }
  }

  private validateButton(button: any): void {
    if (!button.title?.trim()) {
      throw new ValidationError('Buttons require a title');
    }
    if (!button.type || !['postback', 'url', 'quick_reply'].includes(button.type)) {
      throw new ValidationError('Invalid button type');
    }
    if (!button.value?.trim()) {
      throw new ValidationError('Buttons require a value');
    }
  }

  private validateMetadata(metadata: Record<string, any>): void {
    // Validar tamaño máximo de metadata
    const metadataSize = new TextEncoder().encode(JSON.stringify(metadata)).length;
    if (metadataSize > 4096) { // 4KB límite
      throw new ValidationError('Metadata size exceeds maximum limit');
    }

    // Validar campos sensibles
    const sensitiveFields = ['password', 'token', 'key', 'secret'];
    Object.keys(metadata).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        throw new ValidationError(`Metadata contains sensitive field: ${key}`);
      }
    });
  }

  private validateHandoffMetadata(metadata: Record<string, any>): void {
    // Validar campos requeridos si existen
    if (metadata.userInfo) {
      const { email } = metadata.userInfo;
      if (email && !this.isValidEmail(email)) {
        throw new ValidationError('Invalid email format in metadata');
      }
    }

    // Validar métricas si existen
    if (metadata.metrics) {
      Object.entries(metadata.metrics).forEach(([key, value]) => {
        if (typeof value !== 'number' || value < 0) {
          throw new ValidationError(`Invalid metric value for ${key}`);
        }
      });
    }
  }

  private validateMessageSize(message: Partial<BotpressMessage>): void {
    const messageSize = new TextEncoder().encode(JSON.stringify(message)).length;
    const maxSize = 256 * 1024; // 256KB límite

    if (messageSize > maxSize) {
      throw new ValidationError('Message size exceeds maximum limit');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}