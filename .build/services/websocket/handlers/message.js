"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const connection_service_1 = require("../services/connection.service");
const message_service_1 = require("../services/message.service");
const websocket_service_1 = require("../services/websocket.service");
const config_1 = require("../../botpress/config/config");
const errors_1 = require("../utils/errors");
const uuid_1 = require("uuid");
const logger = new logger_1.Logger('WebSocketMessageHandler');
const metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new connection_service_1.ConnectionService();
const messageService = message_service_1.MessageService.getInstance();
const websocketService = new websocket_service_1.WebSocketService();
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const requestId = event.requestContext.requestId;
    const routeKey = event.requestContext.routeKey;
    logger.info('WebSocket message received', {
        connectionId,
        requestId,
        routeKey
    });
    metrics.incrementCounter('WebSocketMessagesReceived');
    try {
        if (!connectionId) {
            throw new errors_1.WebSocketError('Missing required connectionId', 400);
        }
        const connection = await connectionService.getConnection(connectionId);
        if (!connection) {
            logger.error('Connection not found', { connectionId });
            metrics.incrementCounter('WebSocketConnectionNotFound');
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Connection not found' })
            };
        }
        await connectionService.updateConnectionStatus(connectionId, 'CONNECTED');
        if (!event.body) {
            throw new errors_1.WebSocketError('Missing message body', 400);
        }
        const body = JSON.parse(event.body);
        const action = body.action || 'sendMessage';
        switch (action) {
            case 'sendMessage': {
                if (!body.message || !body.conversationId) {
                    throw new errors_1.WebSocketError('Invalid message format. Required fields: message, conversationId', 400);
                }
                const messageId = body.messageId || (0, uuid_1.v4)();
                logger.info('Processing user message', {
                    connectionId,
                    userId: connection.userId,
                    conversationId: body.conversationId,
                    messageId
                });
                const wsMessage = {
                    messageId,
                    type: body.type || 'USER_MESSAGE',
                    content: body.message,
                    conversationId: body.conversationId,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        ...body.metadata,
                        userId: connection.userId,
                        connectionId
                    }
                };
                await websocketService.sendMessage(connectionId, {
                    type: 'MESSAGE_RECEIVED',
                    messageId,
                    conversationId: body.conversationId,
                    content: '',
                    timestamp: new Date().toISOString()
                });
                await websocketService.sendMessage(connectionId, {
                    type: 'TYPING_INDICATOR',
                    messageId: (0, uuid_1.v4)(),
                    conversationId: body.conversationId,
                    content: 'true',
                    timestamp: new Date().toISOString()
                });
                try {
                    const processedMessageId = await messageService.processUserMessage(connection, wsMessage);
                    metrics.incrementCounter('WebSocketMessagesProcessed');
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            messageId,
                            status: 'processed',
                            processedMessageId
                        })
                    };
                }
                catch (processingError) {
                    try {
                        await websocketService.sendMessage(connectionId, {
                            type: 'TYPING_INDICATOR',
                            messageId: (0, uuid_1.v4)(),
                            conversationId: body.conversationId,
                            content: 'false',
                            timestamp: new Date().toISOString()
                        });
                    }
                    catch (typingError) {
                        logger.warn('Error stopping typing indicator', {
                            error: typingError,
                            connectionId
                        });
                    }
                    logger.error('Error processing user message', {
                        error: processingError,
                        connectionId,
                        userId: connection.userId,
                        conversationId: body.conversationId
                    });
                    metrics.incrementCounter('MessageProcessingErrors');
                    throw processingError;
                }
            }
            case 'ping': {
                await websocketService.sendMessage(connectionId, {
                    type: 'PONG',
                    messageId: (0, uuid_1.v4)(),
                    conversationId: 'system',
                    content: '',
                    timestamp: new Date().toISOString()
                });
                metrics.incrementCounter('WebSocketPingsReceived');
                return {
                    statusCode: 200,
                    body: JSON.stringify({ timestamp: Date.now() })
                };
            }
            default:
                logger.warn('Unknown route key', { routeKey, connectionId });
                metrics.incrementCounter('WebSocketUnknownRoutes');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Unsupported route' })
                };
        }
    }
    catch (error) {
        logger.error('Error handling WebSocket message', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            connectionId,
            requestId
        });
        metrics.incrementCounter('WebSocketMessageErrors');
        try {
            if (connectionId) {
                await websocketService.sendMessage(connectionId, {
                    type: 'ERROR',
                    messageId: (0, uuid_1.v4)(),
                    conversationId: 'system',
                    content: error instanceof errors_1.WebSocketError
                        ? error.message
                        : 'Error processing your message',
                    timestamp: new Date().toISOString()
                });
            }
        }
        catch (notificationError) {
            logger.error('Failed to send error notification', {
                error: notificationError,
                connectionId
            });
        }
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
//# sourceMappingURL=message.js.map