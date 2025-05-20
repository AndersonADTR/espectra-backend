"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandoffService = void 0;
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const handoff_detection_service_1 = require("./handoff-detection.service");
const advisor_queue_service_1 = require("./advisor-queue.service");
const conversation_context_service_1 = require("../context/conversation-context.service");
const websocket_service_1 = require("@services/websocket/services/websocket.service");
const config_1 = require("../../config/config");
const conversation_context_types_1 = require("@services/botpress/types/conversation-context.types");
class HandoffService {
    static instance;
    logger;
    metrics;
    detectionService;
    queueService;
    contextService;
    websocketService;
    constructor() {
        this.logger = new logger_1.Logger('HandoffService');
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.detectionService = handoff_detection_service_1.HandoffDetectionService.getInstance();
        this.queueService = advisor_queue_service_1.AdvisorQueueService.getInstance();
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
        this.websocketService = new websocket_service_1.WebSocketService();
    }
    static getInstance() {
        if (!HandoffService.instance) {
            HandoffService.instance = new HandoffService();
        }
        return HandoffService.instance;
    }
    async processMessage(conversationId, userId, message, botResponse) {
        try {
            const context = await this.contextService.getContext(conversationId);
            if (!context) {
                return false;
            }
            if (context.status === 'WITH_ADVISOR') {
                return false;
            }
            const handoffDecision = await this.detectionService.shouldHandoff(conversationId, message, botResponse);
            if (!handoffDecision.shouldHandoff) {
                return false;
            }
            await this.initiateHandoff(conversationId, userId, handoffDecision.reason, handoffDecision.confidence);
            return true;
        }
        catch (error) {
            this.logger.error('Error processing message for handoff', {
                error,
                conversationId,
                userId
            });
            return false;
        }
    }
    async initiateHandoff(conversationId, userId, reason, confidence) {
        try {
            await this.contextService.updateContext(conversationId, {
                status: conversation_context_types_1.ConversationStatus.PENDING_HANDOFF,
                updatedAt: Date.now()
            });
            const handoffRequest = await this.queueService.createHandoffRequest(conversationId, userId, reason.toString(), this.calculatePriority(reason, confidence), {
                confidence,
                detectedAt: new Date().toISOString()
            });
            await this.websocketService.sendMessageToUser(userId, {
                type: 'HANDOFF_STATUS',
                content: 'Tu consulta está siendo transferida a un asesor. Por favor espera un momento.',
                conversationId,
                timestamp: new Date().toISOString(),
                metadata: {
                    status: advisor_queue_service_1.HandoffStatus.PENDING,
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
        }
        catch (error) {
            this.logger.error('Error initiating handoff', {
                error,
                conversationId,
                userId,
                reason
            });
            throw error;
        }
    }
    async notifyHandoffAccepted(handoffId, advisorId, advisorName) {
        try {
            const handoff = await this.queueService.getHandoffRequest(handoffId);
            if (!handoff) {
                throw new Error(`Handoff request not found: ${handoffId}`);
            }
            await this.contextService.updateContext(handoff.conversationId, {
                status: conversation_context_types_1.ConversationStatus.WITH_ADVISOR,
                updatedAt: Date.now(),
                metadata: {
                    ...handoff.metadata,
                    advisorId,
                    advisorName,
                    handoffAcceptedAt: new Date().toISOString()
                }
            });
            await this.websocketService.sendMessageToUser(handoff.userId, {
                type: 'HANDOFF_STATUS',
                content: `${advisorName} se ha unido a la conversación y te ayudará con tu consulta.`,
                conversationId: handoff.conversationId,
                timestamp: new Date().toISOString(),
                metadata: {
                    status: advisor_queue_service_1.HandoffStatus.IN_PROGRESS,
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
        }
        catch (error) {
            this.logger.error('Error sending handoff accepted notification', {
                error,
                handoffId,
                advisorId
            });
            throw error;
        }
    }
    async completeHandoff(handoffId, resolution) {
        try {
            const handoff = await this.queueService.getHandoffRequest(handoffId);
            if (!handoff) {
                throw new Error(`Handoff request not found: ${handoffId}`);
            }
            await this.queueService.updateHandoffStatus(handoffId, advisor_queue_service_1.HandoffStatus.COMPLETED);
            await this.contextService.updateContext(handoff.conversationId, {
                status: conversation_context_types_1.ConversationStatus.ACTIVE,
                updatedAt: Date.now(),
                metadata: {
                    ...handoff.metadata,
                    handoffCompletedAt: new Date().toISOString(),
                    resolution
                }
            });
            if (handoff.assignedAdvisorId) {
                await this.queueService.updateAdvisorStatus(handoff.assignedAdvisorId, advisor_queue_service_1.AdvisorStatus.AVAILABLE);
            }
            await this.websocketService.sendMessageToUser(handoff.userId, {
                type: 'HANDOFF_STATUS',
                content: 'Tu conversación con el asesor ha finalizado. Puedes continuar consultando con nuestro asistente virtual.',
                conversationId: handoff.conversationId,
                timestamp: new Date().toISOString(),
                metadata: {
                    status: advisor_queue_service_1.HandoffStatus.COMPLETED,
                    handoffId
                }
            });
            this.metrics.incrementCounter('HandoffsCompleted');
            this.logger.info('Handoff completed', {
                handoffId,
                conversationId: handoff.conversationId,
                resolution
            });
        }
        catch (error) {
            this.logger.error('Error completing handoff', {
                error,
                handoffId
            });
            throw error;
        }
    }
    async cancelHandoff(handoffId, reason) {
        try {
            const handoff = await this.queueService.getHandoffRequest(handoffId);
            if (!handoff) {
                throw new Error(`Handoff request not found: ${handoffId}`);
            }
            if (handoff.status !== advisor_queue_service_1.HandoffStatus.PENDING) {
                throw new Error(`Cannot cancel handoff with status: ${handoff.status}`);
            }
            await this.queueService.updateHandoffStatus(handoffId, advisor_queue_service_1.HandoffStatus.CANCELLED);
            await this.contextService.updateContext(handoff.conversationId, {
                status: conversation_context_types_1.ConversationStatus.ACTIVE,
                updatedAt: Date.now(),
                metadata: {
                    ...handoff.metadata,
                    handoffCancelledAt: new Date().toISOString(),
                    cancellationReason: reason
                }
            });
            await this.websocketService.sendMessageToUser(handoff.userId, {
                type: 'HANDOFF_STATUS',
                content: `Tu solicitud de asesoría ha sido cancelada: ${reason}. Por favor, continúa interactuando con nuestro asistente virtual.`,
                conversationId: handoff.conversationId,
                timestamp: new Date().toISOString(),
                metadata: {
                    status: advisor_queue_service_1.HandoffStatus.CANCELLED,
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
        }
        catch (error) {
            this.logger.error('Error cancelling handoff', {
                error,
                handoffId
            });
            throw error;
        }
    }
    calculatePriority(reason, confidence) {
        const basePriority = {
            [handoff_detection_service_1.HandoffReason.EXPLICIT_REQUEST]: 5,
            [handoff_detection_service_1.HandoffReason.LOW_CONFIDENCE]: 3,
            [handoff_detection_service_1.HandoffReason.DETECTED_FRUSTRATION]: 4,
            [handoff_detection_service_1.HandoffReason.SENSITIVE_TOPIC]: 4,
            [handoff_detection_service_1.HandoffReason.TOKEN_LIMIT]: 3,
            [handoff_detection_service_1.HandoffReason.COMPLEX_QUERY]: 2,
            [handoff_detection_service_1.HandoffReason.REPEATED_ISSUE]: 3,
            [handoff_detection_service_1.HandoffReason.UNDEFINED]: 1
        };
        const confidenceModifier = confidence;
        return Math.min(Math.max(basePriority[reason] + confidenceModifier, 1), 10);
    }
}
exports.HandoffService = HandoffService;
//# sourceMappingURL=handoff.service.js.map