"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotpressService = exports.BotpressApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@shared/utils/logger");
const token_management_service_1 = require("../token/token-management.service");
const conversation_context_service_1 = require("../context/conversation-context.service");
const message_transformer_service_1 = require("./transformers/message-transformer.service");
const conversation_context_types_1 = require("@services/botpress/types/conversation-context.types");
const handoff_service_1 = require("../handoff/handoff.service");
const handoff_detection_service_1 = require("../handoff/handoff-detection.service");
const user_service_1 = require("../user/user.service");
class BotpressApiClient {
    axios;
    logger;
    maxRetries = 3;
    userService;
    defaultHeaders;
    constructor() {
        this.logger = new logger_1.Logger('BotpressApiClient');
        this.userService = user_service_1.UserService.getInstance();
        this.defaultHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BOTPRESS_API_KEY || ''}`
        };
        this.axios = axios_1.default.create({
            baseURL: process.env.BOTPRESS_API_URL,
            timeout: 10000,
            headers: this.defaultHeaders
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        this.axios.interceptors.response.use(response => response, async (error) => {
            const config = error.config;
            if (!config)
                return Promise.reject(error);
            let retryCount = retryCount || 0;
            this.logger.error('Botpress API error', {
                status: error.response?.status,
                url: config.url,
                method: config.method,
                retryCount: retryCount
            });
            const shouldRetry = (!error.response ||
                (error.response.status >= 500 && error.response.status < 600));
            if (shouldRetry && retryCount < this.maxRetries) {
                retryCount += 1;
                const delay = Math.pow(2, retryCount) * 100 * (0.5 + Math.random());
                this.logger.info(`Retrying request after ${delay}ms`, {
                    url: config.url,
                    retryCount: retryCount
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.axios(config);
            }
            return Promise.reject(error);
        });
    }
    async getOrCreateConversation(conversationId, userId) {
        try {
            const config = {};
            if (userId) {
                const userKey = await this.userService.getBotpressUserKey(userId);
                if (userKey) {
                    config.headers = {
                        'x-user-key': userKey
                    };
                    this.logger.debug('Using dynamic user key for get-or-create conversation', { userId });
                }
                else {
                    this.logger.warn('Botpress user key not found for user in get-or-create', { userId });
                }
            }
            const response = await this.axios.post('/conversations/get-or-create', {
                id: conversationId
            }, config);
            return response.data;
        }
        catch (error) {
            this.logger.error('Error in getOrCreateConversation', {
                error,
                conversationId,
                userId: userId || 'not_provided'
            });
            throw error;
        }
    }
    async sendMessage(conversationId, message, userId) {
        try {
            const messageObj = typeof message === 'string'
                ? { type: 'text', text: message }
                : message;
            const config = {};
            if (userId) {
                const userKey = await this.userService.getBotpressUserKey(userId);
                if (userKey) {
                    config.headers = {
                        'x-user-key': userKey
                    };
                    this.logger.debug('Using dynamic user key for Botpress request', { userId });
                }
                else {
                    this.logger.warn('Botpress user key not found for user', { userId });
                }
            }
            const response = await this.axios.post('/messages', {
                conversationId,
                payload: messageObj
            }, config);
            return response.data;
        }
        catch (error) {
            this.logger.error('Error sending message to Botpress', {
                error,
                conversationId,
                userId: userId || 'not_provided'
            });
            throw error;
        }
    }
    async createUser(userId, name) {
        try {
            const response = await this.axios.post('/users', {
                id: userId,
                name: name
            });
            return response.data;
        }
        catch (error) {
            this.logger.error('Error creating user in Botpress', { error, userId });
            throw error;
        }
    }
}
exports.BotpressApiClient = BotpressApiClient;
class BotpressService {
    static instance;
    apiClient;
    tokenService;
    contextService;
    messageTransformer;
    logger;
    constructor() {
        this.apiClient = new BotpressApiClient();
        this.tokenService = token_management_service_1.TokenManagementService.getInstance();
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
        this.messageTransformer = new message_transformer_service_1.BotpressMessageTransformer();
        this.logger = new logger_1.Logger('BotpressService');
    }
    static getInstance() {
        if (!BotpressService.instance) {
            BotpressService.instance = new BotpressService();
        }
        return BotpressService.instance;
    }
    async sendMessage(userId, message, conversationId, verifyConversationExists) {
        const actualConversationId = conversationId || `conv-${userId}-${Date.now()}`;
        try {
            const estimatedTokens = this.messageTransformer.estimateTokenCount(message);
            const hasTokens = await this.tokenService.checkTokenAvailability(userId, estimatedTokens);
            if (!hasTokens) {
                throw new Error('Insufficient tokens for this operation');
            }
            let context = await this.contextService.getContext(actualConversationId);
            if (!context) {
                context = {
                    conversationId: actualConversationId,
                    userId: userId,
                    status: conversation_context_types_1.ConversationStatus.ACTIVE,
                    type: conversation_context_types_1.ConversationType.BOT,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    lastActivity: Date.now(),
                    messages: []
                };
                await this.contextService.saveContext(context);
            }
            if (verifyConversationExists) {
                await this.apiClient.getOrCreateConversation(actualConversationId, userId);
            }
            const userMessage = {
                role: 'user',
                content: typeof message === 'string' ? message : JSON.stringify(message),
                timestamp: Date.now()
            };
            context.messages.push(userMessage);
            await this.contextService.updateContext(actualConversationId, {
                messages: context.messages,
                updatedAt: Date.now()
            });
            const response = await this.apiClient.sendMessage(actualConversationId, message, userId);
            const tokensUsed = response.tokens?.total || estimatedTokens;
            await this.tokenService.consumeTokens(userId, tokensUsed);
            const handoffService = handoff_service_1.HandoffService.getInstance();
            await handoffService.processMessage(actualConversationId, userId, typeof message === 'string' ? message : JSON.stringify(message), response);
            if (response.messages && response.messages.length > 0) {
                for (const botMessage of response.messages) {
                    const content = botMessage.type === 'text' && botMessage.payload.text
                        ? botMessage.payload.text
                        : JSON.stringify(botMessage);
                    context.messages.push({
                        role: 'assistant',
                        content,
                        timestamp: Date.now()
                    });
                }
                await this.contextService.updateContext(actualConversationId, {
                    messages: context.messages,
                    updatedAt: Date.now()
                });
            }
            return response;
        }
        catch (error) {
            this.logger.error('Error in Botpress service', { error, userId, conversationId: actualConversationId });
            throw error;
        }
    }
    async createBotpressUser(userId, name) {
        try {
            const user = await this.apiClient.createUser(userId, name);
            this.logger.info('Botpress user created successfully', {
                user: user.user,
                key: user.key
            });
            return user;
        }
        catch (error) {
            this.logger.error('Error creating Botpress user', { error, userId });
            throw error;
        }
    }
    async getConversationHistory(userId, conversationId) {
        try {
            const context = await this.contextService.getContext(conversationId);
            if (!context) {
                return null;
            }
            context;
            if (context.userId !== userId) {
                this.logger.warn('User attempted to access conversation they do not own', {
                    userId,
                    conversationId,
                    ownerUserId: context.userId
                });
                return null;
            }
            return context;
        }
        catch (error) {
            this.logger.error('Error retrieving conversation history', { error, userId, conversationId });
            throw error;
        }
    }
    async initiateHandoff(userId, conversationId) {
        try {
            const context = await this.contextService.getContext(conversationId);
            if (!context || context.userId !== userId) {
                this.logger.warn('User attempted to initiate handoff for a conversation they do not own', {
                    userId,
                    conversationId,
                    ownerUserId: context?.userId
                });
                return;
            }
            await this.contextService.updateContext(conversationId, {
                status: conversation_context_types_1.ConversationStatus.WITH_ADVISOR,
                updatedAt: Date.now()
            });
            const handoffService = handoff_service_1.HandoffService.getInstance();
            await handoffService.initiateHandoff(userId, conversationId, handoff_detection_service_1.HandoffReason.COMPLEX_QUERY, 1);
        }
        catch (error) {
            this.logger.error('Error initiating handoff', { error, userId, conversationId });
            throw error;
        }
    }
    async listUserConversations(userId) {
        try {
            const contexts = await this.contextService.listUserContexts(userId);
            return contexts.map(context => ({
                conversationId: context.conversationId,
                createdAt: context.createdAt,
                updatedAt: context.updatedAt,
                messageCount: context.messages.length,
                lastMessage: context.messages.length > 0
                    ? context.messages[context.messages.length - 1]
                    : null
            }));
        }
        catch (error) {
            this.logger.error('Error listing user conversations', { error, userId });
            throw error;
        }
    }
}
exports.BotpressService = BotpressService;
//# sourceMappingURL=botpress.service.js.map