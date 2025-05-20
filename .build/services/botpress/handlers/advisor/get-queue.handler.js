"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const advisor_queue_service_1 = require("../../services/handoff/advisor-queue.service");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('GetQueueHandler');
const getQueueHandler = async (event) => {
    try {
        const advisorId = event.requestContext.authorizer?.claims?.sub;
        if (!advisorId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }
        const queueService = advisor_queue_service_1.AdvisorQueueService.getInstance();
        const limit = event.queryStringParameters?.limit
            ? parseInt(event.queryStringParameters.limit)
            : 10;
        const pendingHandoffs = await queueService.getPendingHandoffs(limit);
        logger.info('Queue retrieved', {
            advisorId,
            count: pendingHandoffs.length
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                handoffs: pendingHandoffs,
                count: pendingHandoffs.length
            })
        };
    }
    catch (error) {
        logger.error('Error getting handoff queue', { error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to get handoff queue',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(getQueueHandler);
//# sourceMappingURL=get-queue.handler.js.map