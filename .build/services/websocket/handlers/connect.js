"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const connection_service_1 = require("../services/connection.service");
const conversations_1 = require("../services/conversations");
const config_1 = require("../../botpress/config/config");
const errors_1 = require("../utils/errors");
const websocket_service_1 = require("../services/websocket.service");
const uuid_1 = require("uuid");
const logger = new logger_1.Logger('WebSocketConnectHandler');
const metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new connection_service_1.ConnectionService();
const websocketService = new websocket_service_1.WebSocketService();
const conversationsService = conversations_1.ConversationsService.getInstance();
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const requestId = event.requestContext.requestId;
    try {
        logger.info('WebSocket connection attempt', {
            connectionId,
            requestId,
            routeKey: event.requestContext.routeKey
        });
        if (!connectionId) {
            const error = new errors_1.WebSocketError('Missing required connectionId', 400, { connectionId });
            logger.error(error.message, error.metadata);
            throw error;
        }
        const userId = event.requestContext.authorizer?.userId;
        if (!userId) {
            logger.error('No user ID found in connection request', {
                connectionId,
                headers: event.headers,
                authorizer: event.requestContext.authorizer
            });
            metrics.incrementCounter('WebSocketConnectionAuthFailures');
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Unauthorized: Missing userId in authorization context',
                    connectionId
                })
            };
        }
        const connectionMetadata = {
            userAgent: event.headers['User-Agent'] || event.headers['user-agent'],
            platform: event.queryStringParameters?.platform || 'unknown',
            clientType: event.queryStringParameters?.clientType || 'unknown',
            clientVersion: event.queryStringParameters?.clientVersion || 'unknown'
        };
        await connectionService.createConnection(connectionId, userId, connectionMetadata);
        let conversationId = '';
        let isNewConversation = false;
        try {
            const connection = await connectionService.getConnection(connectionId);
            if (!connection) {
                throw new errors_1.WebSocketError('Connection not found after creation', 500);
            }
            const { conversationId: convId, welcomeMessage, isNew } = await conversationsService.getOrCreateConversationFromConnection(connection);
            conversationId = convId;
            isNewConversation = isNew;
            await websocketService.sendMessage(connectionId, {
                messageId: (0, uuid_1.v4)(),
                type: 'SESSION_STARTED',
                conversationId: 'system',
                content: 'Connected successfully to SPECTRUM',
                timestamp: new Date().toISOString(),
                metadata: {
                    connectionId,
                    conversationId,
                    serverTime: new Date().toISOString(),
                    serverEnvironment: process.env.STAGE || 'dev'
                }
            });
            await websocketService.sendMessage(connectionId, welcomeMessage);
            logger.info(isNew ? 'New conversation created for user' : 'Existing conversation resumed for user', {
                userId,
                connectionId,
                conversationId,
                isNew
            });
        }
        catch (conversationError) {
            logger.warn('Failed to get or create conversation or send welcome message', {
                error: conversationError instanceof Error ? conversationError.message : 'Unknown error',
                connectionId,
                userId
            });
            try {
                await websocketService.sendMessage(connectionId, {
                    messageId: (0, uuid_1.v4)(),
                    type: 'SESSION_STARTED',
                    conversationId: 'system',
                    content: 'Connected successfully to SPECTRUM',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        connectionId,
                        serverTime: new Date().toISOString(),
                        serverEnvironment: process.env.STAGE || 'dev'
                    }
                });
            }
            catch (welcomeError) {
                logger.warn('Failed to send fallback welcome message', {
                    error: welcomeError instanceof Error ? welcomeError.message : 'Unknown error',
                    connectionId
                });
            }
        }
        metrics.incrementCounter('WebSocketConnections');
        metrics.incrementCounter('ActiveConnections', 1, { userId });
        logger.info('WebSocket connection successful', {
            connectionId,
            userId,
            conversationId: conversationId || 'not_created',
            isNewConversation,
            metadata: connectionMetadata
        });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Connected successfully',
                connectionId,
                conversationId: conversationId || undefined,
                isNewConversation
            })
        };
    }
    catch (error) {
        logger.error('WebSocket connection failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            connectionId,
            requestId
        });
        metrics.incrementCounter('WebSocketConnectionFailures');
        return {
            statusCode: error instanceof errors_1.WebSocketError ? error.statusCode : 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: error instanceof Error ? error.message : 'Internal server error',
                connectionId,
                error: process.env.STAGE === 'dev' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=connect.js.map