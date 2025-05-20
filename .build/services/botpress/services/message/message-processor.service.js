"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageProcessorService = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const conversation_context_service_1 = require("../context/conversation-context.service");
const token_management_service_1 = require("../token/token-management.service");
const botpress_service_1 = require("../botpress/botpress.service");
const websocket_service_1 = require("@services/websocket/services/websocket.service");
const message_transformer_service_1 = require("../botpress/transformers/message-transformer.service");
const conversation_context_types_1 = require("../../types/conversation-context.types");
const handoff_detection_service_1 = require("../handoff/handoff-detection.service");
class MessageProcessorService {
    static instance;
    contextService;
    tokenService;
    botpressService;
    websocketService;
    handoffDetectionService;
    messageTransformer;
    logger;
    metrics;
    constructor() {
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
        this.tokenService = token_management_service_1.TokenManagementService.getInstance();
        this.botpressService = botpress_service_1.BotpressService.getInstance();
        this.websocketService = new websocket_service_1.WebSocketService();
        this.handoffDetectionService = handoff_detection_service_1.HandoffDetectionService.getInstance();
        this.messageTransformer = new message_transformer_service_1.BotpressMessageTransformer();
        this.logger = new logger_1.Logger('MessageProcessorService');
        this.metrics = new metrics_1.MetricsService('MessageProcessor');
    }
    static getInstance() {
        if (!MessageProcessorService.instance) {
            MessageProcessorService.instance = new MessageProcessorService();
        }
        return MessageProcessorService.instance;
    }
    async processIncomingMessage(message) {
        const startTime = Date.now();
        const messageId = (0, uuid_1.v4)();
        try {
            this.logger.info('Processing incoming message', {
                userId: message.userId,
                conversationId: message.conversationId,
                messageType: message.type || 'text'
            });
            this.metrics.incrementCounter('IncomingMessagesReceived');
            this.validateMessage(message);
            const conversationId = message.conversationId || `conv-${message.userId}-${Date.now()}`;
            const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
            const estimatedTokens = this.messageTransformer.estimateTokenCount(content);
            const hasTokens = await this.tokenService.checkTokenAvailability(message.userId, estimatedTokens);
            if (!hasTokens) {
                this.logger.warn('Insufficient tokens for message processing', {
                    userId: message.userId,
                    estimatedTokens,
                    conversationId
                });
                this.metrics.incrementCounter('InsufficientTokens');
                if (message.connectionId) {
                    await this.websocketService.sendMessage(message.connectionId, {
                        type: 'ERROR',
                        conversationId,
                        content: 'Insufficient tokens for this operation. Please upgrade your plan or wait for your tokens to reset.',
                        timestamp: new Date().toISOString()
                    });
                }
                throw new Error('Insufficient tokens for this operation');
            }
            let context = await this.contextService.getContext(conversationId);
            if (!context) {
                context = {
                    conversationId,
                    userId: message.userId,
                    status: conversation_context_types_1.ConversationStatus.ACTIVE,
                    type: conversation_context_types_1.ConversationType.BOT,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastActivity: Date.now(),
                    messages: [],
                    metadata: message.metadata
                };
                await this.contextService.saveContext(context);
                this.metrics.incrementCounter('ConversationsCreated');
            }
            if (message.connectionId) {
                await this.websocketService.sendMessage(message.connectionId, {
                    type: 'MESSAGE_RECEIVED',
                    messageId,
                    conversationId,
                    timestamp: new Date().toISOString()
                });
            }
            await this.contextService.addMessage(conversationId, {
                role: 'user',
                content,
                timestamp: Date.now()
            });
            if (context.status === conversation_context_types_1.ConversationStatus.PENDING_HANDOFF ||
                context.status === conversation_context_types_1.ConversationStatus.WITH_ADVISOR) {
                this.logger.info('Message in handoff state, forwarding to advisor', {
                    conversationId,
                    userId: message.userId,
                    status: context.status
                });
                const processedMessage = {
                    messageId,
                    conversationId,
                    userId: message.userId,
                    content: message.content,
                    timestamp: new Date().toISOString(),
                    type: message.type || 'text',
                    metadata: {
                        ...message.metadata,
                        status: 'forwarded_to_advisor'
                    }
                };
                this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
                return processedMessage;
            }
            const botpressResponse = await this.botpressService.sendMessage(message.userId, message.content, conversationId);
            const shouldHandoff = await this.checkForHandoff(message, botpressResponse);
            if (shouldHandoff) {
                this.logger.info('Handoff required, will be implemented in phase 3', {
                    conversationId,
                    userId: message.userId
                });
            }
            const processedMessage = {
                messageId,
                conversationId,
                userId: message.userId,
                content: botpressResponse.messages,
                timestamp: new Date().toISOString(),
                type: 'bot_response',
                metadata: {
                    ...message.metadata,
                    tokens: botpressResponse.tokens,
                    shouldHandoff
                }
            };
            this.metrics.incrementCounter('MessagesProcessed');
            this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
            return processedMessage;
        }
        catch (error) {
            this.logger.error('Error processing message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: message.userId,
                conversationId: message.conversationId
            });
            this.metrics.incrementCounter('MessageProcessingErrors');
            this.metrics.recordLatency('MessageProcessingTime', Date.now() - startTime);
            throw error;
        }
    }
    validateMessage(message) {
        if (!message.userId) {
            throw new Error('Message must include userId');
        }
        if (!message.content) {
            throw new Error('Message must include content');
        }
    }
    async checkForHandoff(message, botpressResponse) {
        if (typeof message.content === 'string' &&
            (message.content.toLowerCase().includes('hablar con asesor') ||
                message.content.toLowerCase().includes('hablar con humano') ||
                message.content.toLowerCase().includes('hablar con agente') ||
                message.content.toLowerCase().includes('speak to agent') ||
                message.content.toLowerCase().includes('speak to human'))) {
            return true;
        }
        if (botpressResponse.metadata?.needsHandoff) {
            return true;
        }
        if (botpressResponse.metadata?.confidence &&
            botpressResponse.metadata.confidence < 0.5) {
            return true;
        }
        return false;
    }
}
exports.MessageProcessorService = MessageProcessorService;
//# sourceMappingURL=message-processor.service.js.map