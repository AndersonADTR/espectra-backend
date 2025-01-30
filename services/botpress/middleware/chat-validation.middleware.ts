// services/botpress/middleware/chat-validation.middleware.ts

import { ChatMessage } from '../types/chat.types';
import { BotpressValidationError } from '../utils/errors';
import { BaseService } from '../services/base/base.service';
import { CHAT_CONFIG } from '../config/config';

export class ChatValidationMiddleware extends BaseService {
  constructor() {
    super('ChatValidationMiddleware');
  }

  async validateMessage(message: ChatMessage): Promise<void> {
    try {
      this.validateRequired(message);
      this.validateContentLength(message);
      this.validateFormat(message);
      
      this.metrics.incrementCounter('MessageValidations');
    } catch (error) {
      this.metrics.incrementCounter('ValidationFailures');
      throw error;
    }
  }

  private validateRequired(message: ChatMessage): void {
    if (!message.message?.trim()) {
      throw new BotpressValidationError('Message content cannot be empty');
    }

    if (!message.conversationId) {
      throw new BotpressValidationError('Conversation ID is required');
    }

    if (!message.userId) {
      throw new BotpressValidationError('User ID is required');
    }
  }

  private validateContentLength(message: ChatMessage): void {
    const maxLength = CHAT_CONFIG.MAX_MESSAGE_LENGTH || 1000;
    
    if (message.message.length > maxLength) {
      throw new BotpressValidationError(
        `Message exceeds maximum length of ${maxLength} characters`
      );
    }
  }

  private validateFormat(message: ChatMessage): void {
    // Validar estructura del mensaje
    if (message.metadata) {
      this.validateMetadata(message.metadata);
    }

    // Validar contenido por tipo de mensaje
    this.validateMessageContent(message);
  }

  private validateMetadata(metadata: Record<string, any>): void {
    const maxMetadataSize = 4096; // 4KB límite
    const metadataSize = new TextEncoder().encode(
      JSON.stringify(metadata)
    ).length;

    if (metadataSize > maxMetadataSize) {
      throw new BotpressValidationError('Metadata size exceeds maximum limit');
    }

    // Validar campos sensibles
    const sensitiveFields = ['password', 'token', 'key', 'secret'];
    Object.keys(metadata).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        throw new BotpressValidationError(
          `Metadata contains sensitive field: ${key}`
        );
      }
    });
  }

  private validateMessageContent(message: ChatMessage): void {
    // Detectar y prevenir contenido malicioso
    const maliciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /onerror=/gi,
      /onload=/gi,
      /onclick=/gi
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(message.message)) {
        throw new BotpressValidationError(
          'Message contains potentially malicious content'
        );
      }
    }

    // Validar estructura JSON si es necesario
    if (typeof message.message === 'string' && 
        (message.message.startsWith('{') || message.message.startsWith('['))) {
      try {
        JSON.parse(message.message);
      } catch {
        throw new BotpressValidationError('Invalid JSON format in message');
      }
    }
  }
}