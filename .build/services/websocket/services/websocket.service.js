"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const client_apigatewaymanagementapi_1 = require("@aws-sdk/client-apigatewaymanagementapi");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const connection_service_1 = require("./connection.service");
class WebSocketService {
    apiGatewayClient;
    dynamoDbClient;
    connectionService;
    logger;
    metrics;
    connectionsTableName;
    apiGatewayEndpoint;
    constructor() {
        this.logger = new logger_1.Logger('WebSocketService');
        this.metrics = new metrics_1.MetricsService('WebSocket');
        this.connectionService = new connection_service_1.ConnectionService();
        const ddbClient = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
        this.apiGatewayEndpoint = process.env.WEBSOCKET_API_ENDPOINT || '';
        if (!this.apiGatewayEndpoint) {
            this.logger.error('WebSocket API endpoint not configured');
            throw new Error('WebSocket API endpoint not configured in environment variables');
        }
        this.apiGatewayClient = new client_apigatewaymanagementapi_1.ApiGatewayManagementApiClient({
            endpoint: this.apiGatewayEndpoint
        });
        this.connectionsTableName = process.env.CONNECTIONS_TABLE ||
            `${process.env.RESOURCE_PREFIX}-websocket-connections`;
    }
    async getUserIdFromConversation(conversationId) {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: process.env.CONTEXT_TABLE || `${process.env.RESOURCE_PREFIX}-conversation-context-table`,
                Key: { conversationId }
            }));
            if (!result.Item) {
                this.logger.warn('Conversation context not found', { conversationId });
                return null;
            }
            const userId = result.Item.userId;
            if (!userId) {
                this.logger.warn('User ID not found in conversation context', { conversationId });
                return null;
            }
            return userId;
        }
        catch (error) {
            this.logger.error('Error getting user ID from conversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                conversationId
            });
            this.metrics.incrementCounter('ConversationLookupErrors');
            return null;
        }
    }
    async getConnectionIdFromUserId(userId) {
        try {
            const connections = await this.connectionService.getConnectionsByUserId(userId);
            if (!connections || connections.length === 0) {
                this.logger.warn('No active connections found for user', { userId });
                return null;
            }
            const activeConnections = connections.filter(conn => conn.status === 'CONNECTED');
            if (activeConnections.length === 0) {
                this.logger.warn('No active connections found for user', { userId });
                return null;
            }
            const latestConnection = activeConnections.sort((a, b) => {
                const aTime = a.metadata?.lastActivity || a.metadata?.createdAt || '';
                const bTime = b.metadata?.lastActivity || b.metadata?.createdAt || '';
                return bTime.localeCompare(aTime);
            })[0];
            return latestConnection.connectionId;
        }
        catch (error) {
            this.logger.error('Error getting connection ID from user ID', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            this.metrics.incrementCounter('ConnectionLookupErrors');
            return null;
        }
    }
    async sendMessage(connectionId, message) {
        const startTime = Date.now();
        try {
            const data = typeof message === 'string' ? message : JSON.stringify(message);
            await this.apiGatewayClient.send(new client_apigatewaymanagementapi_1.PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: Buffer.from(data)
            }));
            this.metrics.incrementCounter('WebSocketMessagesSent');
            this.metrics.recordLatency('WebSocketSendLatency', Date.now() - startTime);
            return true;
        }
        catch (error) {
            if (error.$metadata?.httpStatusCode === 410 || error.name === 'GoneException') {
                this.logger.info('WebSocket connection no longer available, cleaning up', { connectionId });
                try {
                    await this.connectionService.deleteConnection(connectionId);
                }
                catch (cleanupError) {
                    this.logger.error('Error cleaning up stale connection', {
                        error: cleanupError,
                        connectionId
                    });
                }
                this.metrics.incrementCounter('WebSocketStaleConnections');
                return false;
            }
            this.logger.error('Error sending message to WebSocket connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId,
                errorName: error.name,
                errorCode: error.$metadata?.httpStatusCode
            });
            this.metrics.incrementCounter('WebSocketSendErrors');
            this.metrics.recordLatency('WebSocketSendLatency', Date.now() - startTime);
            throw error;
        }
    }
    async sendMessageToConversation(conversationId, message) {
        try {
            const userId = await this.getUserIdFromConversation(conversationId);
            if (!userId) {
                this.logger.error('Failed to send message to conversation: User ID not found', { conversationId });
                this.metrics.incrementCounter('ConversationMessageErrors');
                return false;
            }
            const connectionId = await this.getConnectionIdFromUserId(userId);
            if (!connectionId) {
                this.logger.error('Failed to send message to conversation: No active connection found', {
                    conversationId,
                    userId
                });
                this.metrics.incrementCounter('ConversationMessageErrors');
                return false;
            }
            return await this.sendMessage(connectionId, message);
        }
        catch (error) {
            this.logger.error('Error sending message to conversation', {
                error: error instanceof Error ? error.message : 'Unknown error',
                conversationId
            });
            this.metrics.incrementCounter('ConversationMessageErrors');
            return false;
        }
    }
    async sendMessageToUser(userId, message, guaranteedDelivery = false) {
        const startTime = Date.now();
        try {
            const connections = await this.connectionService.getConnectionsByUserId(userId);
            this.logger.info(`Found ${connections.length} active connections for user`, { userId });
            if (connections.length === 0) {
                if (guaranteedDelivery) {
                    this.logger.info('No active connections, queueing message for future delivery', { userId });
                }
                return 0;
            }
            const sendPromises = connections
                .filter(conn => conn.isActive())
                .map(conn => this.sendMessage(conn.connectionId, message)
                .catch(() => false));
            const results = await Promise.all(sendPromises);
            const successCount = results.filter(Boolean).length;
            this.logger.info(`Successfully sent message to ${successCount}/${connections.length} connections`, { userId });
            if (successCount < connections.filter(conn => conn.isActive()).length && guaranteedDelivery) {
                this.logger.info('Delivery incomplete, queueing for retry', { userId, successCount, totalConnections: connections.length });
            }
            this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
            return successCount;
        }
        catch (error) {
            this.logger.error('Error sending message to user connections', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            this.metrics.incrementCounter('WebSocketBroadcastErrors');
            this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
            if (guaranteedDelivery) {
                this.logger.info('Error in delivery, queueing for future retry', { userId });
            }
            throw error;
        }
    }
    async broadcastMessage(message, userIds) {
        const startTime = Date.now();
        try {
            let connections = [];
            if (userIds && userIds.length > 0) {
                const connectionsPromises = userIds.map(userId => this.connectionService.getConnectionsByUserId(userId));
                const connectionsArrays = await Promise.all(connectionsPromises);
                connections = connectionsArrays.flat();
            }
            else {
                const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand({
                    TableName: this.connectionsTableName,
                    IndexName: 'StatusIndex',
                    KeyConditionExpression: '#status = :status',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':status': 'CONNECTED'
                    }
                }));
                connections = result.Items || [];
            }
            if (connections.length === 0) {
                this.logger.info('No active connections found for broadcast');
                return 0;
            }
            this.logger.info(`Broadcasting message to ${connections.length} connections`);
            const sendPromises = connections.map(conn => this.sendMessage(conn.connectionId, message)
                .catch(() => false));
            const results = await Promise.all(sendPromises);
            const successCount = results.filter(Boolean).length;
            this.logger.info(`Successfully broadcast message to ${successCount}/${connections.length} connections`);
            this.metrics.incrementCounter('WebSocketBroadcasts');
            this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
            return successCount;
        }
        catch (error) {
            this.logger.error('Error broadcasting message', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            this.metrics.incrementCounter('WebSocketBroadcastErrors');
            this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
            throw error;
        }
    }
    async getUserIdFromConnection(connectionId) {
        try {
            const connection = await this.connectionService.getConnection(connectionId);
            return connection?.userId || null;
        }
        catch (error) {
            this.logger.error('Error getting user ID from connection', {
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionId
            });
            this.metrics.incrementCounter('WebSocketConnectionLookupErrors');
            throw error;
        }
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=websocket.service.js.map