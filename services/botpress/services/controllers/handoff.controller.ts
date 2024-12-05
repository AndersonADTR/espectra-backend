// services/botpress/controllers/handoff.controller.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { HandoffPersistenceService } from 'services/botpress/services/persistence/handoff-persistence.service';
import { HandoffEventService } from 'services/botpress/services/events/handoff-event.service';
import { HandoffMetricsService } from 'services/botpress/services/metrics/handoff-metrics.service';
import { HandoffValidatorService } from 'services/botpress/services/validators/handoff-validator.service';
import { HandoffQueue, HandoffStatus, CreateHandoffRequest, UpdateHandoffRequest } from 'services/botpress/types/handoff.types';
import { HANDOFF_CONSTANTS, HANDOFF_ERRORS } from '../../config/handoff.config';
import { ValidationError, ResourceNotFoundError } from '@shared/utils/errors';

export class HandoffController {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly persistenceService: HandoffPersistenceService;
  private readonly eventService: HandoffEventService;
  private readonly metricsService: HandoffMetricsService;
  private readonly validatorService: HandoffValidatorService;

  constructor() {
    this.logger = new Logger('HandoffController');
    this.metrics = new MetricsService(HANDOFF_CONSTANTS.METRICS.NAMESPACE);
    this.persistenceService = new HandoffPersistenceService();
    this.eventService = new HandoffEventService();
    this.metricsService = new HandoffMetricsService();
    this.validatorService = new HandoffValidatorService();
  }

  async createHandoff(request: CreateHandoffRequest): Promise<HandoffQueue> {
    try {
      // Validar la solicitud
      const validationResult = this.validatorService.validateCreateRequest(request);
      if (!validationResult.isValid) {
        throw new ValidationError('Invalid handoff request', {
          errors: validationResult.errors
        });
      }

      // Verificar límites del sistema
      await this.checkSystemLimits();

      // Crear el handoff
      const handoff: HandoffQueue = {
        queueId: `hq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId: request.conversationId,
        userId: request.userId,
        status: 'pending',
        priority: request.priority || 'medium',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: request.metadata
      };

      await this.persistenceService.createHandoff(handoff);

      // Publicar evento
      await this.eventService.publishEvent({
        type: 'handoff_requested',
        queueId: handoff.queueId,
        conversationId: handoff.conversationId,
        timestamp: handoff.createdAt,
        data: {
          userId: handoff.userId,
          priority: handoff.priority,
          metadata: handoff.metadata
        }
      });

      // Registrar métricas
      await this.metricsService.recordHandoffCreated(handoff);

      this.logger.info('Handoff created successfully', {
        queueId: handoff.queueId,
        userId: handoff.userId
      });

      return handoff;
    } catch (error) {
      this.logger.error('Failed to create handoff', {
        error,
        request
      });
      throw error;
    }
  }

  async assignHandoff(queueId: string, advisorId: string): Promise<HandoffQueue> {
    try {
      // Obtener el handoff actual
      const handoff = await this.persistenceService.getHandoff(queueId);
      if (!handoff) {
        throw new ResourceNotFoundError('Handoff not found');
      }

      // Verificar que el handoff esté pendiente
      if (handoff.status !== 'pending') {
        throw new ValidationError(HANDOFF_ERRORS.ALREADY_ASSIGNED.message);
      }

      // Actualizar el handoff
      const updatedHandoff = await this.persistenceService.updateHandoff(queueId, {
        status: 'assigned',
        advisorId,
        updatedAt: new Date().toISOString()
      });

      // Publicar evento
      await this.eventService.publishEvent({
        type: 'advisor_assigned',
        queueId,
        conversationId: handoff.conversationId,
        timestamp: new Date().toISOString(),
        data: {
          userId: handoff.userId,
          advisorId,
          metadata: handoff.metadata
        }
      });

      // Registrar métricas
      await this.metricsService.recordHandoffAssigned(
        queueId,
        advisorId,
        this.calculateWaitTime(handoff.createdAt)
      );

      this.logger.info('Handoff assigned successfully', {
        queueId,
        advisorId
      });

      return updatedHandoff;
    } catch (error) {
      this.logger.error('Failed to assign handoff', {
        error,
        queueId,
        advisorId
      });
      throw error;
    }
  }
  
  async getHandoff(queueId: string): Promise<HandoffQueue | null> {
    try {
      const handoff = await this.persistenceService.getHandoff(queueId);
  
      if (handoff) {
        this.logger.info('Retrieved handoff successfully', {
          queueId,
          status: handoff.status
        });
      } else {
        this.logger.info('Handoff not found', { queueId });
      }
  
      return handoff;
    } catch (error) {
      this.logger.error('Failed to get handoff', {
        error,
        queueId
      });
      throw error;
    }
  }

  async completeHandoff(queueId: string): Promise<HandoffQueue> {
    try {
      const handoff = await this.persistenceService.getHandoff(queueId);
      if (!handoff) {
        throw new ResourceNotFoundError('Handoff not found');
      }

      const updatedHandoff = await this.persistenceService.updateHandoff(queueId, {
        status: 'completed',
        updatedAt: new Date().toISOString()
      });

      await this.eventService.publishEvent({
        type: 'handoff_completed',
        queueId,
        conversationId: handoff.conversationId,
        timestamp: new Date().toISOString(),
        data: {
          userId: handoff.userId,
          advisorId: handoff.advisorId,
          metadata: handoff.metadata
        }
      });

      await this.metricsService.recordHandoffCompleted(
        queueId,
        handoff.advisorId!,
        this.calculateResolutionTime(handoff.createdAt)
      );

      this.logger.info('Handoff completed successfully', { queueId });

      return updatedHandoff;
    } catch (error) {
      this.logger.error('Failed to complete handoff', {
        error,
        queueId
      });
      throw error;
    }
  }

  private async checkSystemLimits(): Promise<void> {
    const pendingHandoffs = await this.persistenceService.getHandoffsByStatus('pending');
    
    if (pendingHandoffs.length >= HANDOFF_CONSTANTS.QUEUE.MAX_SIZE) {
      throw new ValidationError(HANDOFF_ERRORS.QUEUE_FULL.message);
    }
  }

  private calculateWaitTime(createdAt: string): number {
    return Date.now() - new Date(createdAt).getTime();
  }

  private calculateResolutionTime(createdAt: string): number {
    return Date.now() - new Date(createdAt).getTime();
  }
}