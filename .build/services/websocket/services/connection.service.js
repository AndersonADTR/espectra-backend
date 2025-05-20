"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionService = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const connection_1 = require("../models/connection");
const errors_1 = require("../utils/errors");
const config_1 = require("../../botpress/config/config");
class ConnectionService {
    logger;
    metrics;
    ddb;
    tableName;
    constructor() {
        this.logger = new logger_1.Logger('ConnectionService');
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.ddb = lib_dynamodb_1.DynamoDBDocument.from(new client_dynamodb_1.DynamoDB({}));
        const tableName = process.env.CONNECTION_TABLE;
        if (!tableName) {
            throw new Error('CONNECTION_TABLE environment variable is not defined');
        }
        this.tableName = tableName;
    }
    async createConnection(connectionId, userId, metadata) {
        try {
            this.logger.info('Creating new connection', { connectionId, userId });
            const connection = connection_1.Connection.createFromRequest(connectionId, userId, {
                ...metadata,
                createdAt: new Date().toISOString(),
                status: 'CONNECTED'
            });
            await this.saveConnection(connection);
            this.metrics.incrementCounter('WebSocketConnectionsCreated');
            return connection;
        }
        catch (error) {
            this.logger.error('Failed to create connection', { error, connectionId, userId });
            throw new errors_1.WebSocketError('Failed to create connection', 500);
        }
    }
    async getConnection(connectionId) {
        try {
            const result = await this.ddb.get({
                TableName: this.tableName,
                Key: { connectionId }
            });
            if (!result.Item) {
                this.logger.info('Connection not found', { connectionId });
                return null;
            }
            return connection_1.Connection.create(result.Item);
        }
        catch (error) {
            this.logger.error('Failed to get connection', { error, connectionId });
            throw new errors_1.WebSocketError('Failed to get connection', 500);
        }
    }
    async saveConnection(connection) {
        try {
            this.logger.info('Saving connection', { connection });
            await this.ddb.put({
                TableName: this.tableName,
                Item: {
                    ...connection,
                    ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
                }
            });
            this.metrics.incrementCounter('WebSocketConnectionsSaved');
            this.logger.info('Connection saved', {
                connectionId: connection.connectionId,
                userId: connection.userId
            });
        }
        catch (error) {
            this.logger.error('Failed to save connection', { error, connection });
            throw new errors_1.WebSocketError('Failed to save connection', 500);
        }
    }
    async updateConnectionStatus(connectionId, status) {
        try {
            await this.ddb.update({
                TableName: this.tableName,
                Key: { connectionId },
                UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#status': 'status',
                    '#updatedAt': 'updatedAt'
                },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':updatedAt': new Date().toISOString()
                }
            });
            this.metrics.incrementCounter('WebSocketStatusUpdates');
            this.logger.info('Connection status updated', { connectionId, status });
        }
        catch (error) {
            this.logger.error('Failed to update connection status', { error, connectionId, status });
            throw new errors_1.WebSocketError('Failed to update connection status', 500);
        }
    }
    async deleteConnection(connectionId) {
        try {
            await this.ddb.delete({
                TableName: this.tableName,
                Key: { connectionId }
            });
            this.metrics.incrementCounter('WebSocketConnectionsDeleted');
            this.logger.info('Connection deleted', { connectionId });
        }
        catch (error) {
            this.logger.error('Failed to delete connection', { error, connectionId });
            throw new errors_1.WebSocketError('Failed to delete connection', 500);
        }
    }
    async getConnectionsByUserId(userId) {
        try {
            const result = await this.ddb.query({
                TableName: this.tableName,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId }
            });
            return (result.Items || []).map(item => connection_1.Connection.create(item));
        }
        catch (error) {
            this.logger.error('Failed to get connections by userId', { error, userId });
            throw new errors_1.WebSocketError('Failed to get connections by userId', 500);
        }
    }
}
exports.ConnectionService = ConnectionService;
//# sourceMappingURL=connection.service.js.map