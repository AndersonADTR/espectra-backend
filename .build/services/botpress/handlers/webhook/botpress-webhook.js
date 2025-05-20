"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const websocket_service_1 = require("../../../websocket/services/websocket.service");
const handler = async (event) => {
    const logger = new logger_1.Logger('BotpressWebhookHandler');
    const metrics = new metrics_1.MetricsService('BotpressWebhook');
    const websocketService = new websocket_service_1.WebSocketService();
    logger.info('Processing Botpress webhook', { routeKey: event.requestContext.httpMethod });
    metrics.incrementCounter('WebhooksReceived');
    const startTime = Date.now();
    try {
        if (!event.body) {
            logger.error('Missing request body');
            metrics.incrementCounter('WebhookErrors', 1, { reason: 'missing_body' });
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing request body' })
            };
        }
        if (!verifyWebhookSecretKey(event)) {
            logger.error('Invalid webhook secret key');
            metrics.incrementCounter('WebhookErrors', 1, { reason: 'invalid_secret_key' });
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid webhook secret key' })
            };
        }
        const webhookData = JSON.parse(event.body).data;
        if (!webhookData?.conversationId || !webhookData?.payload?.message) {
            logger.error('Invalid webhook format', { webhookData });
            metrics.incrementCounter('WebhookErrors', 1, { reason: 'invalid_format' });
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid webhook format' })
            };
        }
        await websocketService.sendMessageToConversation(webhookData.conversationId, webhookData.payload.message);
        metrics.recordLatency('WebhookProcessingTime', Date.now() - startTime);
        metrics.incrementCounter('WebhooksProcessed');
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Webhook received successfully' })
        };
    }
    catch (error) {
        logger.error('Error processing Botpress webhook', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        metrics.incrementCounter('WebhookErrors', 1, { reason: 'internal_error' });
        metrics.recordLatency('WebhookProcessingTime', Date.now() - startTime);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error processing webhook',
                error: process.env.STAGE === 'dev' ? (error instanceof Error ? error.message : 'Unknown error') : 'Internal server error'
            })
        };
    }
};
exports.handler = handler;
function verifyWebhookSecretKey(event) {
    const logger = new logger_1.Logger('WebhookSecretKeyVerifier');
    try {
        const requestSecretKey = event.headers['X-Secret-Key'];
        if (!requestSecretKey) {
            logger.error('Missing secret key headers', { headers: event.headers });
            return false;
        }
        const webhookSecret = process.env.BOTPRESS_API_KEY;
        if (!webhookSecret) {
            logger.error('Webhook secret not configured');
            return false;
        }
        if (requestSecretKey !== webhookSecret) {
            logger.error('Invalid secret key', { receivedKey: requestSecretKey });
            return false;
        }
        else {
            logger.info('Webhook secret key verified successfully');
            return true;
        }
    }
    catch (error) {
        logger.error('Error verifying webhook key', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}
async function sendToProcessingQueue(webhookData) {
    const logger = new logger_1.Logger('WebhookQueueSender');
    const sqsClient = new client_sqs_1.SQSClient({});
    const queueUrl = process.env.BOTPRESS_WEBHOOK_QUEUE_URL ||
        `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${process.env.RESOURCE_PREFIX}-botpress-webhook-queue`;
    try {
        await sqsClient.send(new client_sqs_1.SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(webhookData),
            MessageAttributes: {
                'ConversationId': {
                    DataType: 'String',
                    StringValue: webhookData.conversationId
                },
                'MessageCount': {
                    DataType: 'Number',
                    StringValue: webhookData.messages.length.toString()
                }
            }
        }));
        logger.info('Webhook sent to processing queue', {
            conversationId: webhookData.conversationId,
            messageCount: webhookData.messages.length
        });
    }
    catch (error) {
        logger.error('Error sending webhook to queue', {
            error: error instanceof Error ? error.message : 'Unknown error',
            conversationId: webhookData.conversationId
        });
        throw error;
    }
}
//# sourceMappingURL=botpress-webhook.js.map