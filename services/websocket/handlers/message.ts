import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MessageService } from '../services/message.service';
import { BotpressService } from '../../botpress/services/botpress.service';
import { WebSocketError } from '../utils/errors';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('WebSocketMessageHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const messageService = new MessageService();
const botpressService = new BotpressService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const requestId = event.requestContext.requestId;

  try {
    logger.info('Processing WebSocket message', {
      connectionId,
      requestId,
      body: event.body
    });

    if (!connectionId || !event.body) {
      const error = new WebSocketError(
        'Missing required connectionId or message body',
        400,
        { connectionId, body: event.body }
      );
      logger.error(error.message, error.metadata);
      throw error;
    }

    // Parsear y validar el mensaje
    const messageData = JSON.parse(event.body);
    if (!messageData.content || !messageData.conversationId) {
      throw new WebSocketError(
        'Invalid message format. Required: content and conversationId',
        400
      );
    }

    // Obtener conexión y verificar que existe
    const connection = await messageService.getConnectionById(connectionId);
    if (!connection) {
      throw new WebSocketError('Connection not found', 404);
    }

    // Enviar mensaje a Botpress
    const botResponse = await botpressService.sendMessage({
      conversationId: messageData.conversationId,
      text: messageData.content,
      message: messageData.content,
      userId: connection.userId,
      metadata: {
        source: 'websocket',
        timestamp: new Date().toISOString(),
        connectionId,
        ...messageData.metadata
      }
    });

    // Procesar respuesta de Botpress
    const requiresHumanIntervention = botResponse.responses.some(
      (response) => response.metadata?.handoff?.requested
    );

    if (requiresHumanIntervention) {
      logger.info('Human intervention required', {
        connectionId,
        conversationId: messageData.conversationId
      });
      
      await messageService.notifyHumanAgent(connection, messageData);
      await messageService.updateConnectionStatus(connectionId, 'WAITING_FOR_AGENT');

      metrics.incrementCounter('WebSocketHumanHandoffRequested');
    }

    // Enviar respuestas al cliente
    for (const response of botResponse.responses) {
      await messageService.sendMessage(connectionId, {
        type: response.type === 'handoff' ? 'HANDOFF_STATUS' : 'BOT_RESPONSE',
        content: response.message,
        conversationId: messageData.conversationId,
        timestamp: new Date().toISOString(),
        metadata: response.metadata
      });
    }

    metrics.incrementCounter('WebSocketMessagesProcessed');
    logger.info('Message processed successfully', {
      connectionId,
      conversationId: messageData.conversationId
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Message processed successfully',
        connectionId,
        conversationId: messageData.conversationId
      })
    };
  } catch (error) {
    logger.error('Failed to process WebSocket message', {
      error,
      connectionId,
      requestId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    metrics.incrementCounter('WebSocketMessageProcessingFailures');

    return {
      statusCode: error instanceof WebSocketError ? error.statusCode : 500,
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