"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const handoff_service_1 = require("../../services/handoff/handoff.service");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('CompleteHandoffHandler');
const completeHandoffHandler = async (event) => {
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing request body' })
            };
        }
        const advisorId = event.requestContext.authorizer?.claims?.sub;
        if (!advisorId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }
        const request = JSON.parse(event.body);
        const { handoffId, resolution } = request;
        if (!handoffId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'handoffId is required' })
            };
        }
        if (!resolution) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'resolution is required' })
            };
        }
        const handoffService = handoff_service_1.HandoffService.getInstance();
        await handoffService.completeHandoff(handoffId, resolution);
        logger.info('Handoff completed', { handoffId, advisorId, resolution });
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Handoff completed successfully'
            })
        };
    }
    catch (error) {
        logger.error('Error completing handoff', { error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to complete handoff',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(completeHandoffHandler);
//# sourceMappingURL=complete-handoff.handler.js.map