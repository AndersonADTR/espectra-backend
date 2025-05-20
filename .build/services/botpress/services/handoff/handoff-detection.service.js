"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandoffDetectionService = exports.HandoffReason = void 0;
const logger_1 = require("@shared/utils/logger");
const conversation_context_service_1 = require("../context/conversation-context.service");
const botpress_service_1 = require("../botpress/botpress.service");
const metrics_1 = require("@shared/utils/metrics");
const config_1 = require("../../config/config");
var HandoffReason;
(function (HandoffReason) {
    HandoffReason["EXPLICIT_REQUEST"] = "EXPLICIT_REQUEST";
    HandoffReason["LOW_CONFIDENCE"] = "LOW_CONFIDENCE";
    HandoffReason["COMPLEX_QUERY"] = "COMPLEX_QUERY";
    HandoffReason["TOKEN_LIMIT"] = "TOKEN_LIMIT";
    HandoffReason["REPEATED_ISSUE"] = "REPEATED_ISSUE";
    HandoffReason["DETECTED_FRUSTRATION"] = "DETECTED_FRUSTRATION";
    HandoffReason["SENSITIVE_TOPIC"] = "SENSITIVE_TOPIC";
    HandoffReason["UNDEFINED"] = "UNDEFINED";
})(HandoffReason || (exports.HandoffReason = HandoffReason = {}));
class HandoffDetectionService {
    static instance;
    logger;
    contextService;
    botpressService;
    metrics;
    keywordTriggers;
    confidenceThreshold;
    maxRepetitionsBeforeHandoff;
    sensitiveTopics;
    constructor() {
        this.logger = new logger_1.Logger('HandoffDetectionService');
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
        this.botpressService = botpress_service_1.BotpressService.getInstance();
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.confidenceThreshold = parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4');
        this.maxRepetitionsBeforeHandoff = parseInt(process.env.HANDOFF_MAX_REPETITIONS || '3');
        this.keywordTriggers = (process.env.HANDOFF_KEYWORD_TRIGGERS ||
            'agente,humano,persona,representante,supervisor,hablar con alguien,hablar con una persona')
            .split(',')
            .map(keyword => keyword.trim().toLowerCase());
        this.sensitiveTopics = (process.env.HANDOFF_SENSITIVE_TOPICS ||
            'facturación,pago,cancelación,seguridad,problema legal')
            .split(',')
            .map(topic => topic.trim().toLowerCase());
    }
    static getInstance() {
        if (!HandoffDetectionService.instance) {
            HandoffDetectionService.instance = new HandoffDetectionService();
        }
        return HandoffDetectionService.instance;
    }
    async shouldHandoff(conversationId, latestMessage, botResponse) {
        try {
            const context = await this.contextService.getContext(conversationId);
            if (!context) {
                return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
            }
            const explicitRequest = this.detectExplicitHandoffRequest(latestMessage);
            if (explicitRequest.shouldHandoff) {
                this.metrics.incrementCounter('HandoffDetection_ExplicitRequest');
                return explicitRequest;
            }
            const confidenceCheck = this.analyzeBotConfidence(botResponse);
            if (confidenceCheck.shouldHandoff) {
                this.metrics.incrementCounter('HandoffDetection_LowConfidence');
                return confidenceCheck;
            }
            const sensitiveTopicCheck = this.detectSensitiveTopic(latestMessage);
            if (sensitiveTopicCheck.shouldHandoff) {
                this.metrics.incrementCounter('HandoffDetection_SensitiveTopic');
                return sensitiveTopicCheck;
            }
            const frustrationCheck = this.detectUserFrustration(context.messages);
            if (frustrationCheck.shouldHandoff) {
                this.metrics.incrementCounter('HandoffDetection_UserFrustration');
                return frustrationCheck;
            }
            const repetitionCheck = this.detectConversationRepetition(context.messages);
            if (repetitionCheck.shouldHandoff) {
                this.metrics.incrementCounter('HandoffDetection_ConversationRepetition');
                return repetitionCheck;
            }
            return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
        }
        catch (error) {
            this.logger.error('Error in handoff detection', { error, conversationId });
            return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
        }
    }
    detectExplicitHandoffRequest(message) {
        const normalizedMessage = message.toLowerCase();
        for (const keyword of this.keywordTriggers) {
            if (normalizedMessage.includes(keyword)) {
                return {
                    shouldHandoff: true,
                    reason: HandoffReason.EXPLICIT_REQUEST,
                    confidence: 0.9,
                    metadata: { trigger: keyword }
                };
            }
        }
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    analyzeBotConfidence(botResponse) {
        if (!botResponse || !botResponse.metadata || botResponse.metadata.confidence === undefined) {
            return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
        }
        const responseConfidence = botResponse.metadata.confidence;
        if (responseConfidence < this.confidenceThreshold) {
            return {
                shouldHandoff: true,
                reason: HandoffReason.LOW_CONFIDENCE,
                confidence: 0.7,
                metadata: {
                    botConfidence: responseConfidence,
                    threshold: this.confidenceThreshold
                }
            };
        }
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    detectSensitiveTopic(message) {
        const normalizedMessage = message.toLowerCase();
        for (const topic of this.sensitiveTopics) {
            if (normalizedMessage.includes(topic)) {
                return {
                    shouldHandoff: true,
                    reason: HandoffReason.SENSITIVE_TOPIC,
                    confidence: 0.6,
                    metadata: { sensitiveTopic: topic }
                };
            }
        }
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    detectUserFrustration(messages) {
        if (messages.length < 3) {
            return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
        }
        const userMessages = messages
            .filter(msg => msg.role === 'user')
            .map(msg => msg.content.toLowerCase());
        const recentUserMessages = userMessages.slice(-3);
        const frustrationKeywords = [
            'no entiendes', 'no entendiste', 'no me estás ayudando',
            'no sirves', 'inútil', 'mal servicio', 'hablar con una persona',
            'estoy molesto', 'frustrado', 'enojado'
        ];
        const hasPunctuationSigns = recentUserMessages.some(msg => (msg.match(/\?/g) || []).length > 2 ||
            (msg.match(/\!/g) || []).length > 1);
        const hasShortRepetitiveMessages = recentUserMessages.length >= 2 &&
            recentUserMessages.every(msg => msg.length < 15);
        const hasFrustrationKeywords = recentUserMessages.some(msg => frustrationKeywords.some(keyword => msg.includes(keyword)));
        if (hasFrustrationKeywords || (hasPunctuationSigns && hasShortRepetitiveMessages)) {
            return {
                shouldHandoff: true,
                reason: HandoffReason.DETECTED_FRUSTRATION,
                confidence: 0.7,
                metadata: {
                    hasPunctuationSigns,
                    hasShortRepetitiveMessages,
                    hasFrustrationKeywords
                }
            };
        }
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    detectConversationRepetition(messages) {
        if (messages.length < 4) {
            return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
        }
        const recentUserMessages = messages
            .filter(msg => msg.role === 'user')
            .slice(-3)
            .map(msg => msg.content.toLowerCase());
        const uniqueMessages = new Set(recentUserMessages);
        const hasExactRepetitions = uniqueMessages.size < recentUserMessages.length;
        const messageLengths = recentUserMessages.map(msg => msg.length);
        const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
        const hasConsistentLength = messageLengths.every(length => Math.abs(length - avgLength) < avgLength * 0.2);
        if (hasExactRepetitions || (hasConsistentLength && recentUserMessages.length >= this.maxRepetitionsBeforeHandoff)) {
            return {
                shouldHandoff: true,
                reason: HandoffReason.REPEATED_ISSUE,
                confidence: 0.6,
                metadata: {
                    hasExactRepetitions,
                    hasConsistentLength,
                    messageCount: recentUserMessages.length
                }
            };
        }
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
}
exports.HandoffDetectionService = HandoffDetectionService;
//# sourceMappingURL=handoff-detection.service.js.map