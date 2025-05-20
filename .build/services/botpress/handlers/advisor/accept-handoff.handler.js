"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const advisor_queue_service_1 = require("../../services/handoff/advisor-queue.service");
const handoff_service_1 = require("../../services/handoff/handoff.service");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('AcceptHandoffHandler');
const acceptHandoffHandler = async (event) => {
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
        const handoffId = request.handoffId;
        if (!handoffId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'handoffId is required' })
            };
        }
        const queueService = advisor_queue_service_1.AdvisorQueueService.getInstance();
        const handoffService = handoff_service_1.HandoffService.getInstance();
        const advisor = await queueService.getAdvisorInfo(advisorId);
        if (!advisor) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Advisor not found' })
            };
        }
        const handoff = await queueService.updateHandoffStatus(handoffId, advisor_queue_service_1.HandoffStatus.IN_PROGRESS, advisorId);
        await handoffService.notifyHandoffAccepted(handoffId, advisorId, advisor.name);
        logger.info('Handoff accepted', { handoffId, advisorId });
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Handoff accepted successfully',
                handoff
            })
        };
    }
    catch (error) {
        logger.error('Error accepting handoff', { error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to accept handoff',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(acceptHandoffHandler);
//# sourceMappingURL=accept-handoff.handler.js.map