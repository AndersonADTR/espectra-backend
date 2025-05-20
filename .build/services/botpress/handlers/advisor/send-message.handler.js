"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const advisor_queue_service_1 = require("../../services/handoff/advisor-queue.service");
const websocket_service_1 = require("@services/websocket/services/websocket.service");
const conversation_context_service_1 = require("../../services/context/conversation-context.service");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('AdvisorSendMessageHandler');
const sendMessageHandler = async (event) => {
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
        const { conversationId, message, handoffId } = request;
        if (!conversationId || !message || !handoffId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'conversationId, message, and handoffId are required' })
            };
        }
        const queueService = advisor_queue_service_1.AdvisorQueueService.getInstance();
        const contextService = conversation_context_service_1.ConversationContextService.getInstance();
        const websocketService = new websocket_service_1.WebSocketService();
        const handoff = await queueService.getHandoffRequest(handoffId);
        if (!handoff || handoff.assignedAdvisorId !== advisorId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: 'Unauthorized to send messages to this conversation' })
            };
        }
        const advisor = await queueService.getAdvisorInfo(advisorId);
        const context = await contextService.getContext(conversationId);
        if (!context) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Conversation not found' })
            };
        }
        const timestamp = Date.now();
        await contextService.updateContext(conversationId, {
            messages: [
                ...context.messages,
                {
                    role: 'advisor',
                    content: message,
                    timestamp,
                    metadata: {
                        advisorId,
                        advisorName: advisor?.name || 'Asesor',
                        handoffId
                    }
                }
            ],
            updatedAt: timestamp
        });
        await websocketService.sendMessageToUser(context.userId, {
            type: 'AGENT_MESSAGE',
            content: message,
            conversationId,
            timestamp: new Date().toISOString(),
            metadata: {
                handoffId,
                advisorId,
                advisorName: advisor?.name || 'Asesor'
            }
        });
        logger.info('Advisor message sent', {
            handoffId,
            conversationId,
            advisorId
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Message sent successfully',
                timestamp: new Date().toISOString()
            })
        };
    }
    catch (error) {
        logger.error('Error sending advisor message', { error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to send message',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(sendMessageHandler);
//# sourceMappingURL=send-message.handler.js.map