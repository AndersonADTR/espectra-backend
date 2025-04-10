// services/botpress/handlers/webhook/botpress-webhook.ts

import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import * as crypto from 'crypto';
import { WebSocketService } from '../../../websocket/services/websocket.service';

/**
 * Handler Lambda para procesar webhooks de Botpress
 * Este Lambda recibe las respuestas asíncronas de Botpress y las procesa
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {
  const logger = new Logger('BotpressWebhookHandler');
  const metrics = new MetricsService('BotpressWebhook');
  const websocketService = new WebSocketService();
  
  logger.info('Processing Botpress webhook', { routeKey: event.requestContext.httpMethod });
  metrics.incrementCounter('WebhooksReceived');
  
  const startTime = Date.now();
  
  try {
    // Verificar que el evento tenga un cuerpo
    if (!event.body) {
      logger.error('Missing request body');
      metrics.incrementCounter('WebhookErrors', 1, { reason: 'missing_body' });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }
    
    // Verificar la autenticidad del webhook usando firma HMAC
    if (!verifyWebhookSecretKey(event)) {
      logger.error('Invalid webhook secret key');
      metrics.incrementCounter('WebhookErrors', 1, { reason: 'invalid_secret_key' });
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid webhook secret key' })
      };
    }
    
    // Parsear el cuerpo del webhook y extraer la data
    const webhookData = JSON.parse(event.body).data;
    
    // Validar estructura básica del webhook
    if (!webhookData?.conversationId || !webhookData?.payload?.message) {
      logger.error('Invalid webhook format', { webhookData });
      metrics.incrementCounter('WebhookErrors', 1, { reason: 'invalid_format' });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid webhook format' })
      };
    }

    // Enviar a SQS para procesamiento asíncrono (implementacion futura)
    // await sendToProcessingQueue(webhookData);

    // Enviar respuesta al websocket para actualizar el chat
    await websocketService.sendMessage(webhookData.conversationId, webhookData.payload.message);
    
    metrics.recordLatency('WebhookProcessingTime', Date.now() - startTime);
    metrics.incrementCounter('WebhooksProcessed');
    
    // Responder inmediatamente para no bloquear a Botpress
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook received successfully' })
    };
  } catch (error) {
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

/**
 * Verifica la firma del webhook usando HMAC
 * @param event Evento API Gateway
 * @returns True si la firma es válida
 */
function verifyWebhookSecretKey(event: APIGatewayProxyEvent): boolean {
  const logger = new Logger('WebhookSecretKeyVerifier');

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
    
    // Verificar que la llave secreta sea correcta
    if (requestSecretKey !== webhookSecret) {
      logger.error('Invalid secret key', { receivedKey: requestSecretKey });
      return false;
    }
    else {
      logger.info('Webhook secret key verified successfully');
      return true;
    }

  } catch (error) {
    logger.error('Error verifying webhook key', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Envía el webhook a una cola SQS para procesamiento asíncrono
 * @param webhookData Datos del webhook
 */
async function sendToProcessingQueue(webhookData: any): Promise<void> {
  const logger = new Logger('WebhookQueueSender');
  const sqsClient = new SQSClient({});
  const queueUrl = process.env.BOTPRESS_WEBHOOK_QUEUE_URL || 
    `https://sqs.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${process.env.SERVICE_NAME}-${process.env.STAGE}-botpress-webhook-queue`;
  
  try {
    await sqsClient.send(new SendMessageCommand({
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
  } catch (error) {
    logger.error('Error sending webhook to queue', { 
      error: error instanceof Error ? error.message : 'Unknown error', 
      conversationId: webhookData.conversationId 
    });
    throw error;
  }
}