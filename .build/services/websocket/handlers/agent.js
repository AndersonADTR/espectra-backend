"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const logger_1 = require("@shared/utils/logger");
const message_service_1 = require("../services/message.service");
const metrics_1 = require("@shared/utils/metrics");
const config_1 = require("../../botpress/config/config");
const logger = new logger_1.Logger('AgentHandler');
const metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
const messageService = new message_service_1.MessageService();
const handler = async (event) => {
    const connectionId = event.requestContext.connectionId;
    try {
        logger.info('Agent message received', { connectionId });
        if (!connectionId || !event.body) {
            metrics.incrementCounter('AgentMessageValidationFailed');
            return {
                statusCode: 400,
                body: 'Missing required fields'
            };
        }
        const messageData = JSON.parse(event.body);
        await messageService.handleAgentResponse(connectionId, messageData);
        metrics.incrementCounter('AgentMessagesProcessed');
        return {
            statusCode: 200,
            body: 'Agent message processed'
        };
    }
    catch (error) {
        logger.error('Error handling agent message', { error, connectionId });
        metrics.incrementCounter('AgentMessageProcessingFailed');
        return {
            statusCode: 500,
            body: 'Failed to handle agent message'
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=agent.js.map