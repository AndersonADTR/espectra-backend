"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationsService = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const botpress_service_1 = require("@services/botpress/services/botpress/botpress.service");
const conversation_context_service_1 = require("@services/botpress/services/context/conversation-context.service");
const conversation_context_types_1 = require("@services/botpress/types/conversation-context.types");
const config_1 = require("../../botpress/config/config");
const errors_1 = require("../utils/errors");
class ConversationsService {
    static instance;
    logger;
    metrics;
    botpressService;
    contextService;
    constructor() {
        this.logger = new logger_1.Logger('ConversationsService');
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.botpressService = botpress_service_1.BotpressService.getInstance();
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
    }
    static getInstance() {
        if (!ConversationsService.instance) {
            ConversationsService.instance = new ConversationsService();
        }
        return ConversationsService.instance;
    }
    async createConversation(userId, initialMessage, metadata) {
        const startTime = Date.now();
        try {
            this.logger.info('Creating new conversation', { userId });
            const conversationId = `conv-${userId}-${Date.now()}`;
            if (initialMessage) {
                await this.botpressService.sendMessage(userId, initialMessage, conversationId, true);
            }
            else {
                await this.botpressService.sendMessage(userId, 'Conversation initialized via WebSocket connection', conversationId, true);
            }
            const context = {
                conversationId,
                userId,
                status: conversation_context_types_1.ConversationStatus.ACTIVE,
                type: conversation_context_types_1.ConversationType.BOT,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastActivity: Date.now(),
                messages: [],
                metadata: {
                    ...metadata,
                    createdVia: 'websocket'
                }
            };
            await this.contextService.saveContext(context);
            this.metrics.incrementCounter('ConversationsCreated');
            this.metrics.recordLatency('ConversationCreationLatency', Date.now() - startTime);
            this.logger.info('Conversation created successfully', {
                userId,
                conversationId,
                hasInitialMessage: !!initialMessage
            });
            return conversationId;
        }
        catch (error) {
            this.logger.error('Error creating conversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            this.metrics.incrementCounter('ConversationCreationErrors');
            this.metrics.recordLatency('ConversationCreationLatency', Date.now() - startTime);
            throw new errors_1.WebSocketError('Failed to create conversation', 500, { userId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }
    async createConversationFromConnection(connection, initialMessage) {
        try {
            const metadata = {
                connectionId: connection.connectionId,
                userAgent: connection.metadata?.userAgent,
                platform: connection.metadata?.platform,
                clientType: connection.metadata?.clientType,
                clientVersion: connection.metadata?.clientVersion
            };
            const conversationId = await this.createConversation(connection.userId, initialMessage, metadata);
            const welcomeMessage = {
                messageId: (0, uuid_1.v4)(),
                type: 'CONVERSATION_CREATED',
                conversationId,
                content: initialMessage
                    ? 'Conversation started with initial message'
                    : 'New conversation started',
                timestamp: new Date().toISOString(),
                metadata: {
                    conversationId,
                    userId: connection.userId,
                    serverTime: new Date().toISOString()
                }
            };
            return { conversationId, welcomeMessage };
        }
        catch (error) {
            this.logger.error('Error creating conversation from connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId: connection.connectionId,
                userId: connection.userId
            });
            throw error;
        }
    }
    async getUserActiveConversations(userId) {
        try {
            return await this.botpressService.listUserConversations(userId);
        }
        catch (error) {
            this.logger.error('Error getting user active conversations', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            throw new errors_1.WebSocketError('Failed to get user conversations', 500, { userId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }
    async getOrCreateConversation(userId, metadata) {
        try {
            this.logger.info('Getting or creating conversation for user', { userId });
            const activeConversations = await this.getUserActiveConversations(userId);
            const activeConvs = activeConversations.filter(conv => conv.status === conversation_context_types_1.ConversationStatus.ACTIVE);
            if (activeConvs.length > 0) {
                activeConvs.sort((a, b) => b.updatedAt - a.updatedAt);
                const mostRecentConversation = activeConvs[0];
                this.logger.info('Found existing active conversation', {
                    userId,
                    conversationId: mostRecentConversation.conversationId
                });
                return {
                    conversationId: mostRecentConversation.conversationId,
                    isNew: false
                };
            }
            this.logger.info('No active conversations found, creating new one', { userId });
            const conversationId = await this.createConversation(userId, undefined, metadata);
            return {
                conversationId,
                isNew: true
            };
        }
        catch (error) {
            this.logger.error('Error getting or creating conversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            throw new errors_1.WebSocketError('Failed to get or create conversation', 500, { userId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }
    async getOrCreateConversationFromConnection(connection) {
        try {
            const metadata = {
                connectionId: connection.connectionId,
                userAgent: connection.metadata?.userAgent,
                platform: connection.metadata?.platform,
                clientType: connection.metadata?.clientType,
                clientVersion: connection.metadata?.clientVersion
            };
            const { conversationId, isNew } = await this.getOrCreateConversation(connection.userId, metadata);
            const welcomeMessage = {
                messageId: (0, uuid_1.v4)(),
                type: isNew ? 'CONVERSATION_CREATED' : 'CONVERSATION_RESUMED',
                conversationId,
                content: isNew
                    ? 'New conversation started'
                    : 'Existing conversation resumed',
                timestamp: new Date().toISOString(),
                metadata: {
                    conversationId,
                    userId: connection.userId,
                    serverTime: new Date().toISOString(),
                    isNew
                }
            };
            return { conversationId, welcomeMessage, isNew };
        }
        catch (error) {
            this.logger.error('Error getting or creating conversation from connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId: connection.connectionId,
                userId: connection.userId
            });
            throw error;
        }
    }
}
exports.ConversationsService = ConversationsService;
//# sourceMappingURL=conversations.js.map