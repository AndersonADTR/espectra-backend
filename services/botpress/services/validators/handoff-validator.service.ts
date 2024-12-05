// services/botpress/services/validators/handoff-validator.service.ts

import { Logger } from '@shared/utils/logger';
import { ValidationError } from '@shared/utils/errors';
import { 
  HandoffQueue,
  HandoffStatus, 
  HandoffPriority,
  HandoffMetadata,
  CreateHandoffRequest,
  UpdateHandoffRequest,
  HandoffValidationResult 
} from '../../types/handoff.types';
import { HANDOFF_CONFIG } from '../../config/config';

export class HandoffValidatorService {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('HandoffValidator');
  }

  validateCreateRequest(request: CreateHandoffRequest): HandoffValidationResult {
    const errors: string[] = [];

    // Validar campos requeridos
    if (!request.conversationId?.trim()) {
      errors.push('Conversation ID is required');
    }

    if (!request.userId?.trim()) {
      errors.push('User ID is required');
    }

    // Validar prioridad
    if (request.priority && !this.isValidPriority(request.priority)) {
      errors.push('Invalid priority level');
    }

    // Validar metadata
    if (request.metadata) {
      const metadataErrors = this.validateMetadata(request.metadata);
      errors.push(...metadataErrors);
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      this.logger.warn('Create handoff request validation failed', {
        errors,
        request
      });
    }

    return {
      isValid,
      errors: isValid ? undefined : errors
    };
  }

  validateUpdateRequest(request: UpdateHandoffRequest): HandoffValidationResult {
    const errors: string[] = [];

    // Validar ID de cola
    if (!request.queueId?.trim()) {
      errors.push('Queue ID is required');
    }

    // Validar estado
    if (request.status && !this.isValidStatus(request.status)) {
      errors.push('Invalid status');
    }

    // Validar ID de asesor
    if (request.advisorId && !this.isValidAdvisorId(request.advisorId)) {
      errors.push('Invalid advisor ID format');
    }

    // Validar prioridad
    if (request.priority && !this.isValidPriority(request.priority)) {
      errors.push('Invalid priority level');
    }

    // Validar metadata
    if (request.metadata) {
      const metadataErrors = this.validateMetadata(request.metadata);
      errors.push(...metadataErrors);
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      this.logger.warn('Update handoff request validation failed', {
        errors,
        request
      });
    }

    return {
      isValid,
      errors: isValid ? undefined : errors
    };
  }

  validateQueueItem(item: HandoffQueue): HandoffValidationResult {
    const errors: string[] = [];

    // Validar campos requeridos
    if (!item.queueId?.trim()) {
      errors.push('Queue ID is required');
    }

    if (!item.conversationId?.trim()) {
      errors.push('Conversation ID is required');
    }

    if (!item.userId?.trim()) {
      errors.push('User ID is required');
    }

    // Validar timestamps
    if (!this.isValidTimestamp(item.createdAt)) {
      errors.push('Invalid creation timestamp');
    }

    if (!this.isValidTimestamp(item.updatedAt)) {
      errors.push('Invalid update timestamp');
    }

    // Validar estado
    if (!this.isValidStatus(item.status)) {
      errors.push('Invalid status');
    }

    // Validar prioridad
    if (!this.isValidPriority(item.priority)) {
      errors.push('Invalid priority level');
    }

    // Validar TTL si existe
    if (item.ttl && !this.isValidTTL(item.ttl)) {
      errors.push('Invalid TTL value');
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      this.logger.warn('Queue item validation failed', {
        errors,
        queueId: item.queueId
      });
    }

    return {
      isValid,
      errors: isValid ? undefined : errors
    };
  }

  private validateMetadata(metadata: Partial<HandoffMetadata>): string[] {
    const errors: string[] = [];

    if (metadata.userInfo) {
      // Validar email si existe
      if (metadata.userInfo.email && !this.isValidEmail(metadata.userInfo.email)) {
        errors.push('Invalid email format in metadata');
      }
    }

    if (metadata.metrics) {
      // Validar que los tiempos sean números positivos
      if (metadata.metrics.waitTime && metadata.metrics.waitTime < 0) {
        errors.push('Wait time must be positive');
      }
      if (metadata.metrics.responseTime && metadata.metrics.responseTime < 0) {
        errors.push('Response time must be positive');
      }
      if (metadata.metrics.resolutionTime && metadata.metrics.resolutionTime < 0) {
        errors.push('Resolution time must be positive');
      }
    }

    if (metadata.contextData) {
      // Validar previousMessages si existe
      if (metadata.contextData.previousMessages && metadata.contextData.previousMessages < 0) {
        errors.push('Previous messages count must be positive');
      }

      // Validar sentimentScore si existe
      if (metadata.contextData.sentimentScore !== undefined && 
          (metadata.contextData.sentimentScore < -1 || metadata.contextData.sentimentScore > 1)) {
        errors.push('Sentiment score must be between -1 and 1');
      }
    }

    return errors;
  }

  private isValidStatus(status: string): status is HandoffStatus {
    const validStatuses: HandoffStatus[] = [
      'pending',
      'assigned',
      'active',
      'completed',
      'cancelled',
      'timeout'
    ];
    return validStatuses.includes(status as HandoffStatus);
  }

  private isValidPriority(priority: string): priority is HandoffPriority {
    const validPriorities: HandoffPriority[] = ['low', 'medium', 'high'];
    return validPriorities.includes(priority as HandoffPriority);
  }

  private isValidTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return date.toString() !== 'Invalid Date';
  }

  private isValidTTL(ttl: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return ttl > now && ttl < now + (7 * 24 * 60 * 60); // 7 días máximo
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidAdvisorId(advisorId: string): boolean {
    // Implementar validación específica según el formato de IDs de asesores
    return /^adv_[a-zA-Z0-9]{16}$/.test(advisorId);
  }
}