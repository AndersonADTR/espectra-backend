"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const conversation_context_service_1 = require("../../services/context/conversation-context.service");
const message_transformer_service_1 = require("../../services/botpress/transformers/message-transformer.service");
const token_management_service_1 = require("../../services/token/token-management.service");
const websocket_service_1 = require("@services/websocket/services/websocket.service");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const handler = async (event) => {
    const logger = new logger_1.Logger('ProcessWebhookHandler');
    const metrics = new metrics_1.MetricsService('ProcessWebhook');
    logger.info('Processing webhook messages from queue', {
        recordCount: event.Records.length
    });
    metrics.incrementCounter('QueueMessagesReceived', event.Records.length);
    const contextService = conversation_context_service_1.ConversationContextService.getInstance();
    const tokenService = token_management_service_1.TokenManagementService.getInstance();
    const transformer = new message_transformer_service_1.BotpressMessageTransformer();
    const websocketService = new websocket_service_1.WebSocketService();
    const results = await Promise.all(event.Records.map(async (record) => {
        const startTime = Date.now();
        try {
            const webhookData = JSON.parse(record.body);
            const { conversationId, messages, userId, tokens } = webhookData;
            logger.info('Processing webhook message', {
                conversationId,
                userId,
                messageCount: messages?.length || 0
            });
            const context = await contextService.getContext(conversationId);
            if (!context) {
                logger.error('Context not found for conversation', { conversationId });
                metrics.incrementCounter('ContextNotFound');
                return { success: false, error: 'Context not found', conversationId };
            }
            const transformedMessages = messages.map((message) => transformer.fromBotpressFormat(message));
            if (tokens && typeof tokens.total === 'number' && userId) {
                try {
                    await tokenService.consumeTokens(userId, tokens.total);
                    logger.info('Tokens consumed from webhook', {
                        userId,
                        tokenCount: tokens.total
                    });
                }
                catch (error) {
                    logger.warn('Error consuming tokens from webhook', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        userId,
                        tokenCount: tokens.total
                    });
                }
            }
            for (const message of transformedMessages) {
                await contextService.addMessage(conversationId, {
                    role: 'assistant',
                    content: typeof message.content === 'string'
                        ? message.content
                        : JSON.stringify(message.content),
                    timestamp: Date.now()
                });
            }
            if (webhookData.context) {
                await contextService.updateContext(conversationId, {
                    botpressContext: webhookData.context
                });
            }
            if (userId) {
                const wsMessage = {
                    type: 'BOT_RESPONSE',
                    conversationId,
                    content: transformedMessages.map((msg) => ({
                        type: msg.type,
                        content: msg.content,
                        metadata: msg.metadata
                    })),
                    timestamp: new Date().toISOString()
                };
                try {
                    const sentCount = await websocketService.sendMessageToUser(userId, wsMessage, true);
                    logger.info('WebSocket notification sent', {
                        userId,
                        connectionCount: sentCount
                    });
                }
                catch (wsError) {
                    logger.warn('Error sending WebSocket notification', {
                        error: wsError instanceof Error ? wsError.message : 'Unknown error',
                        userId
                    });
                }
            }
            metrics.recordLatency('WebhookMessageProcessingTime', Date.now() - startTime);
            metrics.incrementCounter('WebhookMessagesProcessed');
            return {
                success: true,
                conversationId,
                messageCount: messages.length
            };
        }
        catch (error) {
            logger.error('Error processing webhook message', {
                error: error instanceof Error ? error.message : 'Unknown error',
                recordId: record.messageId
            });
            metrics.incrementCounter('WebhookMessageErrors');
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                recordId: record.messageId
            };
        }
    }));
    const successCount = results.filter(r => r.success).length;
    logger.info('Webhook processing completed', {
        total: event.Records.length,
        success: successCount,
        failed: event.Records.length - successCount
    });
    metrics.incrementCounter('WebhookBatchesProcessed');
    return {
        processed: results,
        summary: {
            total: event.Records.length,
            success: successCount,
            failed: event.Records.length - successCount
        }
    };
};
exports.handler = handler;
//# sourceMappingURL=process-webhook.handler.js.map