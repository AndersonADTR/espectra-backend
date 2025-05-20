"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const connection_service_1 = require("../services/connection.service");
const config_1 = require("../../botpress/config/config");
const errors_1 = require("../utils/errors");
const logger = new logger_1.Logger('WebSocketDisconnectHandler');
const metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new connection_service_1.ConnectionService();
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    const requestId = event.requestContext.requestId;
    try {
        logger.info('WebSocket disconnect attempt', {
            connectionId,
            requestId
        });
        if (!connectionId) {
            const error = new errors_1.WebSocketError('Missing required connectionId', 400, { connectionId });
            logger.error(error.message, error.metadata);
            throw error;
        }
        await connectionService.deleteConnection(connectionId);
        metrics.incrementCounter('WebSocketDisconnections');
        logger.info('WebSocket disconnection successful', { connectionId });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Disconnected successfully',
                connectionId
            })
        };
    }
    catch (error) {
        logger.error('WebSocket disconnection failed', {
            error,
            connectionId,
            requestId,
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
        });
        metrics.incrementCounter('WebSocketDisconnectionFailures');
        return {
            statusCode: error instanceof errors_1.WebSocketError ? error.statusCode : 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: error instanceof Error ? error.message : 'Internal server error',
                connectionId,
                error: process.env.STAGE === 'dev' ? error : undefined
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=disconnect.js.map