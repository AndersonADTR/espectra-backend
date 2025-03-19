// services/botpress/services/handoff/handoff.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { HandoffDetectionService, HandoffReason } from './handoff-detection.service';
import { AdvisorQueueService, AdvisorStatus, HandoffStatus } from './advisor-queue.service';
import { ConversationContextService } from '../context/conversation-context.service';
import { WebSocketService } from '@services/websocket/services/websocket.service';
import { MONITORING_CONFIG } from '../../config/config';
import { ConversationStatus } from '@services/botpress/types/conversation-context.types';

export class HandoffService {
  private static instance: HandoffService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly detectionService: HandoffDetectionService;
  private readonly queueService: AdvisorQueueService;
  private readonly contextService: ConversationContextService;
  private readonly websocketService: WebSocketService;

  private constructor() {
    this.logger = new Logger('HandoffService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.detectionService = HandoffDetectionService.getInstance();
    this.queueService = AdvisorQueueService.getInstance();
    this.contextService = ConversationContextService.getInstance();
    this.websocketService = new WebSocketService();
  }

  public static getInstance(): HandoffService {
    if (!HandoffService.instance) {
      HandoffService.instance = new HandoffService();
    }
    return HandoffService.instance;
  }
  
  /**
   * Procesa un mensaje para verificar si se necesita intervención humana
   */
  public async processMessage(
    conversationId: string, 
    userId: string, 
    message: string, 
    botResponse: any
  ): Promise<boolean> {
    try {
      // Verificar si la conversación ya está en handoff
      const context = await this.contextService.getContext(conversationId);
      if (!context) {
        return false;
      }
      
      // Si ya está con un asesor, no hacer nada
      if (context.status === 'WITH_ADVISOR') {
        return false;
      }
      
      // Determinar si se necesita handoff
      const handoffDecision = await this.detectionService.shouldHandoff(
        conversationId,
        message,
        botResponse
      );
      
      if (!handoffDecision.shouldHandoff) {
        return false;
      }
      
      // Iniciar proceso de handoff
      await this.initiateHandoff(
        conversationId, 
        userId, 
        handoffDecision.reason,
        handoffDecision.confidence
      );
      
      return true;
    } catch (error) {
      this.logger.error('Error processing message for handoff', { 
        error, 
        conversationId, 
        userId 
      });
      return false;
    }
  }
  
  /**
   * Inicia el proceso de handoff
   */
  public async initiateHandoff(
    conversationId: string, 
    userId: string,
    reason: HandoffReason,
    confidence: number
  ): Promise<void> {
    try {
      // Actualizar el estado de la conversación
      await this.contextService.updateContext(conversationId, {
        status: ConversationStatus.PENDING_HANDOFF,
        updatedAt: Date.now()
      });
      
      // Crear solicitud de handoff
      const handoffRequest = await this.queueService.createHandoffRequest(
        conversationId,
        userId,
        reason.toString(),
        this.calculatePriority(reason, confidence),
        {
          confidence,
          detectedAt: new Date().toISOString()
        }
      );
      
      // Notificar al usuario a través de WebSocket
      await this.websocketService.sendMessageToUser(userId, {
        type: 'HANDOFF_STATUS',
        content: 'Tu consulta está siendo transferida a un asesor. Por favor espera un momento.',
        conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          status: HandoffStatus.PENDING,
          handoffId: handoffRequest.handoffId
        }
      });
      
      this.metrics.incrementCounter('HandoffsInitiated');
      this.logger.info('Handoff initiated', { 
        conversationId, 
        userId, 
        reason, 
        handoffId: handoffRequest.handoffId 
      });
    } catch (error) {
      this.logger.error('Error initiating handoff', { 
        error, 
        conversationId, 
        userId, 
        reason 
      });
      throw error;
    }
  }
  
  /**
   * Notifica al usuario cuando un asesor acepta su solicitud
   */
  public async notifyHandoffAccepted(
    handoffId: string, 
    advisorId: string, 
    advisorName: string
  ): Promise<void> {
    try {
      // Obtener detalles de la solicitud
      const handoff = await this.queueService.getHandoffRequest(handoffId);
      if (!handoff) {
        throw new Error(`Handoff request not found: ${handoffId}`);
      }
      
      // Actualizar el estado de la conversación
      await this.contextService.updateContext(handoff.conversationId, {
        status: ConversationStatus.WITH_ADVISOR,
        updatedAt: Date.now(),
        metadata: {
          ...handoff.metadata,
          advisorId,
          advisorName,
          handoffAcceptedAt: new Date().toISOString()
        }
      });
      
      // Notificar al usuario
      await this.websocketService.sendMessageToUser(handoff.userId, {
        type: 'HANDOFF_STATUS',
        content: `${advisorName} se ha unido a la conversación y te ayudará con tu consulta.`,
        conversationId: handoff.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          status: HandoffStatus.IN_PROGRESS,
          handoffId,
          advisorId,
          advisorName
        }
      });
      
      this.metrics.incrementCounter('HandoffsAccepted');
      this.logger.info('Handoff accepted notification sent', { 
        handoffId, 
        conversationId: handoff.conversationId, 
        userId: handoff.userId, 
        advisorId 
      });
    } catch (error) {
      this.logger.error('Error sending handoff accepted notification', { 
        error, 
        handoffId, 
        advisorId 
      });
      throw error;
    }
  }
  
  /**
   * Completa un handoff cuando el asesor finaliza la conversación
   */
  public async completeHandoff(
    handoffId: string, 
    resolution: string
  ): Promise<void> {
    try {
      // Obtener detalles de la solicitud
      const handoff = await this.queueService.getHandoffRequest(handoffId);
      if (!handoff) {
        throw new Error(`Handoff request not found: ${handoffId}`);
      }
      
      // Actualizar estado de la solicitud
      await this.queueService.updateHandoffStatus(
        handoffId, 
        HandoffStatus.COMPLETED
      );
      
      // Actualizar el estado de la conversación
      await this.contextService.updateContext(handoff.conversationId, {
        status: ConversationStatus.ACTIVE, // Volver al bot
        updatedAt: Date.now(),
        metadata: {
          ...handoff.metadata,
          handoffCompletedAt: new Date().toISOString(),
          resolution
        }
      });
      
      // Liberar al asesor
      if (handoff.assignedAdvisorId) {
        // Decrementar contador de handoffs activos
        await this.queueService.updateAdvisorStatus(
          handoff.assignedAdvisorId,
          AdvisorStatus.AVAILABLE // Suponiendo que solo tiene esta conversación activa
        );
      }
      
      // Notificar al usuario
      await this.websocketService.sendMessageToUser(handoff.userId, {
        type: 'HANDOFF_STATUS',
        content: 'Tu conversación con el asesor ha finalizado. Puedes continuar consultando con nuestro asistente virtual.',
        conversationId: handoff.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          status: HandoffStatus.COMPLETED,
          handoffId
        }
      });
      
      this.metrics.incrementCounter('HandoffsCompleted');
      this.logger.info('Handoff completed', { 
        handoffId, 
        conversationId: handoff.conversationId, 
        resolution 
      });
    } catch (error) {
      this.logger.error('Error completing handoff', { 
        error, 
        handoffId 
      });
      throw error;
    }
  }
  
  /**
   * Cancela un handoff pendiente
   */
  public async cancelHandoff(
    handoffId: string, 
    reason: string
  ): Promise<void> {
    try {
      // Obtener detalles de la solicitud
      const handoff = await this.queueService.getHandoffRequest(handoffId);
      if (!handoff) {
        throw new Error(`Handoff request not found: ${handoffId}`);
      }
      
      // Solo se pueden cancelar handoffs pendientes
      if (handoff.status !== HandoffStatus.PENDING) {
        throw new Error(`Cannot cancel handoff with status: ${handoff.status}`);
      }
      
      // Actualizar estado de la solicitud
      await this.queueService.updateHandoffStatus(
        handoffId, 
        HandoffStatus.CANCELLED
      );
      
      // Actualizar el estado de la conversación
      await this.contextService.updateContext(handoff.conversationId, {
        status: ConversationStatus.ACTIVE, // Volver al bot
        updatedAt: Date.now(),
        metadata: {
          ...handoff.metadata,
          handoffCancelledAt: new Date().toISOString(),
          cancellationReason: reason
        }
      });
      
      // Notificar al usuario
      await this.websocketService.sendMessageToUser(handoff.userId, {
        type: 'HANDOFF_STATUS',
        content: `Tu solicitud de asesoría ha sido cancelada: ${reason}. Por favor, continúa interactuando con nuestro asistente virtual.`,
        conversationId: handoff.conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          status: HandoffStatus.CANCELLED,
          handoffId,
          reason
        }
      });
      
      this.metrics.incrementCounter('HandoffsCancelled');
      this.logger.info('Handoff cancelled', { 
        handoffId, 
        conversationId: handoff.conversationId, 
        reason 
      });
    } catch (error) {
      this.logger.error('Error cancelling handoff', { 
        error, 
        handoffId 
      });
      throw error;
    }
  }
  
  /**
   * Calcula la prioridad del handoff basado en la razón y confianza
   */
  private calculatePriority(reason: HandoffReason, confidence: number): number {
    // Mayor valor = mayor prioridad
    const basePriority: Record<HandoffReason, number> = {
      [HandoffReason.EXPLICIT_REQUEST]: 5,      // Máxima prioridad si el usuario lo pide explícitamente
      [HandoffReason.LOW_CONFIDENCE]: 3,        // Media-alta si el bot no está seguro
      [HandoffReason.DETECTED_FRUSTRATION]: 4,  // Alta si el usuario está frustrado
      [HandoffReason.SENSITIVE_TOPIC]: 4,       // Alta si es un tema sensible
      [HandoffReason.TOKEN_LIMIT]: 3,           // Media-alta si se alcanzó el límite de tokens
      [HandoffReason.COMPLEX_QUERY]: 2,         // Media si la consulta es compleja
      [HandoffReason.REPEATED_ISSUE]: 3,         // Media-alta si hay repetición
      [HandoffReason.UNDEFINED]: 1                // Baja si es desconocido o no se puede determinar
    };
    
    // Ajustar por confianza (0.1 a 1.0 adicional)
    const confidenceModifier = confidence;
    
    // Prioridad final (1-10)
    return Math.min(Math.max(basePriority[reason] + confidenceModifier, 1), 10);
  }
}