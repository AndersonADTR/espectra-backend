"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageService = void 0;
const uuid_1 = require("uuid");
const connection_service_1 = require("./connection.service");
const conversations_1 = require("./conversations");
const botpress_service_1 = require("@services/botpress/services/botpress/botpress.service");
const websocket_service_1 = require("../services/websocket.service");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const config_1 = require("../../botpress/config/config");
const errors_1 = require("../utils/errors");
const conversation_context_service_1 = require("../../botpress/services/context/conversation-context.service");
const token_management_service_1 = require("../../botpress/services/token/token-management.service");
const conversation_context_types_1 = require("@services/botpress/types/conversation-context.types");
class MessageService {
    static instance;
    logger;
    metrics;
    connectionService;
    botpressService;
    webSocketService;
    contextService;
    tokenService;
    conversationsService;
    messageQueue = new Map();
    MAX_RETRY_ATTEMPTS = 3;
    RETRY_DELAY_MS = 1000;
    retryInterval = null;
    constructor() {
        this.logger = new logger_1.Logger('MessageService');
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.connectionService = new connection_service_1.ConnectionService();
        this.botpressService = botpress_service_1.BotpressService.getInstance();
        this.webSocketService = new websocket_service_1.WebSocketService();
        this.contextService = conversation_context_service_1.ConversationContextService.getInstance();
        this.tokenService = token_management_service_1.TokenManagementService.getInstance();
        this.conversationsService = conversations_1.ConversationsService.getInstance();
        this.startMessageQueueProcessor();
    }
    static getInstance() {
        if (!MessageService.instance) {
            MessageService.instance = new MessageService();
        }
        return MessageService.instance;
    }
    async getConnectionById(connectionId) {
        const startTime = Date.now();
        try {
            const connection = await this.connectionService.getConnection(connectionId);
            this.metrics.recordLatency('ConnectionRetrievalLatency', Date.now() - startTime);
            if (!connection) {
                this.metrics.incrementCounter('ConnectionNotFound');
            }
            return connection;
        }
        catch (error) {
            this.logger.error('Error retrieving connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId
            });
            this.metrics.incrementCounter('ConnectionRetrievalErrors');
            this.metrics.recordLatency('ConnectionRetrievalLatency', Date.now() - startTime);
            throw error;
        }
    }
    async updateConnectionStatus(connectionId, status) {
        const startTime = Date.now();
        try {
            await this.connectionService.updateConnectionStatus(connectionId, status);
            this.metrics.incrementCounter('ConnectionStatusUpdated');
            this.metrics.recordLatency('ConnectionStatusUpdateLatency', Date.now() - startTime);
            this.logger.info('Connection status updated', { connectionId, status });
        }
        catch (error) {
            this.logger.error('Error updating connection status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId,
                status
            });
            this.metrics.incrementCounter('ConnectionStatusUpdateErrors');
            this.metrics.recordLatency('ConnectionStatusUpdateLatency', Date.now() - startTime);
            throw error;
        }
    }
    async sendMessage(connectionId, message, guaranteedDelivery = false) {
        const startTime = Date.now();
        try {
            const enrichedMessage = {
                ...message,
                timestamp: message.timestamp || new Date().toISOString()
            };
            const success = await this.webSocketService.sendMessage(connectionId, enrichedMessage);
            if (success) {
                this.metrics.incrementCounter('MessagesSent');
                this.logger.debug('Message sent', { connectionId, messageType: message.type });
            }
            else if (guaranteedDelivery) {
                this.queueMessageForRetry(connectionId, enrichedMessage);
                this.logger.info('Message queued for retry', { connectionId, messageType: message.type });
            }
            else {
                this.metrics.incrementCounter('MessagesFailedNoRetry');
                this.logger.warn('Message delivery failed with no retry', {
                    connectionId,
                    messageType: message.type
                });
            }
            this.metrics.recordLatency('MessageSendLatency', Date.now() - startTime);
        }
        catch (error) {
            this.logger.error('Error sending message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId,
                messageType: message.type
            });
            if (guaranteedDelivery) {
                this.queueMessageForRetry(connectionId, message);
                this.logger.info('Message queued for retry after error', {
                    connectionId,
                    messageType: message.type
                });
            }
            this.metrics.incrementCounter('MessageSendErrors');
            this.metrics.recordLatency('MessageSendLatency', Date.now() - startTime);
            if (!guaranteedDelivery) {
                throw error;
            }
        }
    }
    async broadcastMessage(message, userIds, guaranteedDelivery = false) {
        const startTime = Date.now();
        try {
            const sentCount = await this.webSocketService.broadcastMessage(message, userIds);
            this.logger.info('Message broadcast completed', {
                userCount: userIds?.length || 'all',
                sentCount,
                messageType: message.type
            });
            this.metrics.incrementCounter('MessagesBroadcasted');
            this.metrics.recordLatency('BroadcastLatency', Date.now() - startTime);
        }
        catch (error) {
            this.logger.error('Error broadcasting message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userCount: userIds?.length || 'all',
                messageType: message.type
            });
            this.metrics.incrementCounter('BroadcastErrors');
            this.metrics.recordLatency('BroadcastLatency', Date.now() - startTime);
            throw error;
        }
    }
    async processUserMessage(connection, message) {
        const startTime = Date.now();
        const messageId = message.messageId || (0, uuid_1.v4)();
        try {
            this.logger.info('Processing user message', {
                userId: connection.userId,
                connectionId: connection.connectionId,
                conversationId: message.conversationId,
                messageType: message.type
            });
            await this.sendMessage(connection.connectionId, {
                type: 'MESSAGE_RECEIVED',
                messageId,
                conversationId: message.conversationId,
                content: '',
                timestamp: new Date().toISOString()
            });
            const tokensRequired = this.estimateTokenRequirement(message);
            const hasTokens = await this.tokenService.checkTokenAvailability(connection.userId, tokensRequired);
            if (!hasTokens) {
                await this.sendMessage(connection.connectionId, {
                    type: 'ERROR',
                    conversationId: message.conversationId,
                    content: 'No tienes suficientes tokens para procesar este mensaje.',
                    timestamp: new Date().toISOString(),
                    messageId
                }, true);
                this.metrics.incrementCounter('InsufficientTokens');
                this.logger.warn('User has insufficient tokens', {
                    userId: connection.userId,
                    required: tokensRequired
                });
                return messageId;
            }
            if (this.isHandoffRequest(message) ||
                (await this.isInHandoffState(message.conversationId))) {
                await this.notifyHumanAgent(connection, message);
                await this.sendMessage(connection.connectionId, {
                    type: 'HANDOFF_STATUS',
                    conversationId: message.conversationId,
                    content: 'Tu mensaje está siendo procesado por un asesor.',
                    timestamp: new Date().toISOString(),
                    messageId
                }, true);
            }
            else {
                try {
                    await this.sendMessage(connection.connectionId, {
                        messageId: messageId,
                        type: 'TYPING_INDICATOR',
                        conversationId: message.conversationId,
                        content: 'true',
                        timestamp: new Date().toISOString()
                    });
                    const response = await this.botpressService.sendMessage(connection.userId, message.content, message.conversationId);
                    await this.sendMessage(connection.connectionId, {
                        messageId: messageId,
                        type: 'TYPING_INDICATOR',
                        conversationId: message.conversationId,
                        content: 'false',
                        timestamp: new Date().toISOString()
                    });
                    await this.sendMessage(connection.connectionId, {
                        messageId: messageId,
                        type: 'BOT_RESPONSE',
                        conversationId: message.conversationId,
                        content: response.messages.toString(),
                        timestamp: new Date().toISOString(),
                    }, true);
                    if (response.metadata?.needsHandoff) {
                        await this.initiateHandoff(connection, message);
                    }
                }
                catch (error) {
                    this.logger.error('Error processing message with Botpress', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        userId: connection.userId,
                        conversationId: message.conversationId
                    });
                    await this.sendMessage(connection.connectionId, {
                        type: 'ERROR',
                        conversationId: message.conversationId,
                        content: 'Error al procesar tu mensaje. Por favor, intenta nuevamente más tarde.',
                        timestamp: new Date().toISOString(),
                        messageId
                    }, true);
                    this.metrics.incrementCounter('BotpressProcessingErrors');
                }
            }
            this.metrics.incrementCounter('UserMessagesProcessed');
            this.metrics.recordLatency('MessageProcessingLatency', Date.now() - startTime);
            return messageId;
        }
        catch (error) {
            this.logger.error('Error processing user message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: connection.userId,
                connectionId: connection.connectionId,
                conversationId: message.conversationId
            });
            try {
                await this.sendMessage(connection.connectionId, {
                    type: 'ERROR',
                    conversationId: message.conversationId,
                    content: 'Error al procesar tu mensaje. Por favor, intenta nuevamente más tarde.',
                    timestamp: new Date().toISOString(),
                    messageId
                }, true);
            }
            catch (sendError) {
                this.logger.error('Failed to send error notification', {
                    error: sendError,
                    connectionId: connection.connectionId
                });
            }
            this.metrics.incrementCounter('MessageProcessingErrors');
            this.metrics.recordLatency('MessageProcessingLatency', Date.now() - startTime);
            throw error;
        }
    }
    async notifyHumanAgent(connection, message) {
        const startTime = Date.now();
        try {
            this.logger.info('Notifying human agent', {
                connectionId: connection.connectionId,
                userId: connection.userId,
                conversationId: message.conversationId
            });
            const agentMessage = {
                ...message,
                type: 'HANDOFF_REQUEST',
                metadata: {
                    ...message.metadata,
                    connectionId: connection.connectionId,
                    userId: connection.userId,
                    userInfo: {
                        name: message.metadata?.userInfo?.name || 'Usuario',
                        plan: message.metadata?.userInfo?.plan || 'basic'
                    }
                },
            };
            await this.connectionService.updateConnectionStatus(connection.connectionId, 'IN_PROGRESS');
            await this.contextService.updateStatus(message.conversationId, conversation_context_types_1.ConversationStatus.PENDING_HANDOFF);
            await this.botpressService.initiateHandoff(connection.userId, message.conversationId);
            const availableAdvisors = await this.getAvailableAdvisors();
            if (availableAdvisors.length > 0) {
                const advisorUserIds = availableAdvisors.map(advisor => advisor.userId);
                await this.webSocketService.broadcastMessage(agentMessage, advisorUserIds);
                this.logger.info('Handoff request broadcast to advisors', {
                    advisorCount: advisorUserIds.length,
                    conversationId: message.conversationId
                });
            }
            else {
                this.logger.warn('No available advisors for handoff', {
                    conversationId: message.conversationId
                });
                await this.sendMessage(connection.connectionId, {
                    messageId: message.messageId,
                    type: 'SYSTEM_MESSAGE',
                    conversationId: message.conversationId,
                    content: 'En este momento no hay asesores disponibles. Tu solicitud ha sido registrada y será atendida lo antes posible.',
                    timestamp: new Date().toISOString()
                }, true);
            }
            this.metrics.incrementCounter('HandoffRequestsInitiated');
            this.metrics.recordLatency('HandoffRequestLatency', Date.now() - startTime);
        }
        catch (error) {
            this.logger.error('Failed to notify human agent', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId: connection.connectionId,
                conversationId: message.conversationId
            });
            try {
                await this.connectionService.updateConnectionStatus(connection.connectionId, 'CONNECTED');
                await this.contextService.updateStatus(message.conversationId, conversation_context_types_1.ConversationStatus.ACTIVE);
            }
            catch (revertError) {
                this.logger.error('Error reverting connection status after handoff failure', {
                    error: revertError,
                    connectionId: connection.connectionId
                });
            }
            this.metrics.incrementCounter('HandoffRequestErrors');
            this.metrics.recordLatency('HandoffRequestLatency', Date.now() - startTime);
            throw error;
        }
    }
    async handleAgentResponse(connectionId, message) {
        const startTime = Date.now();
        try {
            this.logger.info('Handling agent response', {
                connectionId,
                conversationId: message.conversationId,
                messageType: message.type
            });
            const connection = await this.connectionService.getConnection(connectionId);
            if (!connection) {
                throw new errors_1.WebSocketError('Connection not found', 404);
            }
            const context = await this.contextService.getContext(message.conversationId);
            if (!context) {
                throw new errors_1.WebSocketError('Conversation not found', 404);
            }
            const userConnections = await this.connectionService.getConnectionsByUserId(context.userId);
            if (userConnections.length === 0) {
                throw new errors_1.WebSocketError('User not connected', 400, { userId: context.userId });
            }
            switch (message.type) {
                case 'HANDOFF_ACCEPTED':
                    await this.contextService.updateHandoffContext(message.conversationId, {
                        handoffCount: (context.handoffContext?.handoffCount || 0) + 1,
                        lastAdvisorId: connection.userId,
                        lastHandoffTimestamp: Date.now()
                    });
                    await this.contextService.updateStatus(message.conversationId, conversation_context_types_1.ConversationStatus.WITH_ADVISOR);
                    for (const userConn of userConnections) {
                        await this.sendMessage(userConn.connectionId, {
                            messageId: message.messageId,
                            type: 'HANDOFF_STARTED',
                            content: 'Un asesor ha tomado tu conversación.',
                            conversationId: message.conversationId,
                            timestamp: new Date().toISOString(),
                            metadata: {
                                advisorInfo: message.metadata?.advisorInfo
                            }
                        }, true);
                    }
                    this.metrics.incrementCounter('HandoffsAccepted');
                    break;
                case 'HANDOFF_REJECTED':
                    for (const userConn of userConnections) {
                        await this.connectionService.updateConnectionStatus(userConn.connectionId, 'CONNECTED');
                    }
                    await this.contextService.updateStatus(message.conversationId, conversation_context_types_1.ConversationStatus.ACTIVE);
                    for (const userConn of userConnections) {
                        await this.sendMessage(userConn.connectionId, {
                            messageId: message.messageId,
                            type: 'SYSTEM_MESSAGE',
                            content: message.content || 'No hay asesores disponibles en este momento. Por favor, intenta nuevamente más tarde.',
                            conversationId: message.conversationId,
                            timestamp: new Date().toISOString()
                        }, true);
                    }
                    this.metrics.incrementCounter('HandoffsRejected');
                    break;
                case 'AGENT_MESSAGE':
                    await this.contextService.addMessage(message.conversationId, {
                        role: 'advisor',
                        content: message.content,
                        timestamp: Date.now()
                    });
                    for (const userConn of userConnections) {
                        await this.sendMessage(userConn.connectionId, {
                            messageId: message.messageId,
                            type: 'AGENT_MESSAGE',
                            content: message.content,
                            conversationId: message.conversationId,
                            timestamp: new Date().toISOString(),
                            metadata: message.metadata
                        }, true);
                    }
                    this.metrics.incrementCounter('AgentMessagesSent');
                    break;
                case 'HANDOFF_COMPLETED':
                    await this.contextService.updateStatus(message.conversationId, conversation_context_types_1.ConversationStatus.ACTIVE);
                    for (const userConn of userConnections) {
                        await this.connectionService.updateConnectionStatus(userConn.connectionId, 'CONNECTED');
                        await this.sendMessage(userConn.connectionId, {
                            messageId: message.messageId,
                            type: 'HANDOFF_COMPLETED',
                            content: message.content || 'El asesor ha terminado la conversación. Ahora estás hablando con el bot nuevamente.',
                            conversationId: message.conversationId,
                            timestamp: new Date().toISOString()
                        }, true);
                    }
                    this.metrics.incrementCounter('HandoffsCompleted');
                    break;
                default:
                    throw new errors_1.WebSocketError(`Unsupported message type: ${message.type}`, 400);
            }
            this.metrics.recordLatency('AgentResponseLatency', Date.now() - startTime);
        }
        catch (error) {
            this.logger.error('Failed to handle agent response', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId,
                conversationId: message.conversationId,
                messageType: message.type
            });
            this.metrics.incrementCounter('AgentResponseErrors');
            this.metrics.recordLatency('AgentResponseLatency', Date.now() - startTime);
            throw error;
        }
    }
    async initiateHandoff(connection, message) {
        try {
            await this.sendMessage(connection.connectionId, {
                messageId: message.messageId,
                type: 'HANDOFF_STATUS',
                conversationId: message.conversationId,
                content: 'Tu conversación será transferida a un asesor humano.',
                timestamp: new Date().toISOString()
            }, true);
            await this.notifyHumanAgent(connection, message);
        }
        catch (error) {
            this.logger.error('Failed to initiate handoff', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId: connection.userId,
                conversationId: message.conversationId
            });
            throw error;
        }
    }
    estimateTokenRequirement(message) {
        const content = typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
        return Math.max(50, Math.ceil(content.length / 4));
    }
    isHandoffRequest(message) {
        if (typeof message.content !== 'string') {
            return false;
        }
        const content = message.content.toLowerCase();
        return (content.includes('hablar con asesor') ||
            content.includes('hablar con humano') ||
            content.includes('hablar con agente') ||
            content.includes('speak to agent') ||
            content.includes('speak to human') ||
            content.includes('agente humano') ||
            content.includes('human agent') ||
            content.includes('chat with human') ||
            content.includes('support agent'));
    }
    async isInHandoffState(conversationId) {
        try {
            const context = await this.contextService.getContext(conversationId);
            if (!context) {
                return false;
            }
            return (context.status === 'PENDING_HANDOFF' ||
                context.status === 'WITH_ADVISOR');
        }
        catch (error) {
            this.logger.error('Error checking handoff state', {
                error: error instanceof Error ? error.message : 'Unknown error',
                conversationId
            });
            return false;
        }
    }
    calculateHandoffPriority(message) {
        const basePriority = config_1.HANDOFF_CONFIG.DEFAULT_PRIORITY;
        let priority = basePriority;
        if (message.metadata?.userInfo?.plan) {
            switch (message.metadata.userInfo.plan) {
                case 'enterprise':
                    priority += 3;
                    break;
                case 'business':
                    priority += 2;
                    break;
                case 'pro':
                    priority += 1;
                    break;
            }
        }
        if (this.isHandoffRequest(message)) {
            priority += 1;
        }
        return Math.max(1, Math.min(10, priority));
    }
    async getAvailableAdvisors() {
        return [
            { userId: 'advisor-001', specialties: ['general', 'technical'] },
            { userId: 'advisor-002', specialties: ['general', 'billing'] }
        ];
    }
    queueMessageForRetry(connectionId, message) {
        const queueKey = `${connectionId}:${message.messageId || (0, uuid_1.v4)()}`;
        this.messageQueue.set(queueKey, {
            userId: message.metadata?.userId || '',
            connectionId,
            message,
            attempts: 0,
            nextRetry: Date.now() + this.RETRY_DELAY_MS
        });
        this.metrics.incrementCounter('MessagesQueued');
        this.logger.info('Message queued for retry', {
            connectionId,
            messageType: message.type,
            queueSize: this.messageQueue.size
        });
    }
    startMessageQueueProcessor() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
        }
        this.retryInterval = setInterval(() => {
            this.processMessageQueue().catch(error => {
                this.logger.error('Error processing message queue', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            });
        }, 5000);
    }
    async processMessageQueue() {
        if (this.messageQueue.size === 0) {
            return;
        }
        const now = Date.now();
        const itemsToProcess = [];
        for (const [key, item] of this.messageQueue.entries()) {
            if (item.nextRetry && item.nextRetry <= now) {
                itemsToProcess.push([key, item]);
            }
        }
        if (itemsToProcess.length === 0) {
            return;
        }
        this.logger.info('Processing message queue', {
            readyCount: itemsToProcess.length,
            totalQueued: this.messageQueue.size
        });
        for (const [key, item] of itemsToProcess) {
            try {
                const success = await this.webSocketService.sendMessage(item.connectionId, item.message);
                if (success) {
                    this.messageQueue.delete(key);
                    this.metrics.incrementCounter('QueuedMessagesDelivered');
                    this.logger.info('Queued message delivered successfully', {
                        connectionId: item.connectionId,
                        messageType: item.message.type
                    });
                }
                else {
                    item.attempts++;
                    if (item.attempts >= this.MAX_RETRY_ATTEMPTS) {
                        this.messageQueue.delete(key);
                        this.metrics.incrementCounter('QueuedMessagesAbandoned');
                        this.logger.warn('Abandoned message after max retries', {
                            connectionId: item.connectionId,
                            messageType: item.message.type,
                            attempts: item.attempts
                        });
                    }
                    else {
                        const delay = this.RETRY_DELAY_MS * Math.pow(2, item.attempts);
                        item.nextRetry = now + delay;
                        this.logger.info('Scheduled message for retry', {
                            connectionId: item.connectionId,
                            messageType: item.message.type,
                            attempt: item.attempts,
                            nextRetryIn: Math.round(delay / 1000)
                        });
                    }
                }
            }
            catch (error) {
                item.attempts++;
                this.logger.error('Error retrying queued message', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    connectionId: item.connectionId,
                    messageType: item.message.type,
                    attempt: item.attempts
                });
                if (item.attempts >= this.MAX_RETRY_ATTEMPTS) {
                    this.messageQueue.delete(key);
                    this.metrics.incrementCounter('QueuedMessagesAbandoned');
                }
                else {
                    const delay = this.RETRY_DELAY_MS * Math.pow(2, item.attempts);
                    item.nextRetry = now + delay;
                }
            }
        }
    }
    cleanup() {
        if (this.retryInterval) {
            clearInterval(this.retryInterval);
            this.retryInterval = null;
        }
        this.messageQueue.clear();
        this.logger.info('MessageService resources cleaned up');
    }
}
exports.MessageService = MessageService;
//# sourceMappingURL=message.service.js.map