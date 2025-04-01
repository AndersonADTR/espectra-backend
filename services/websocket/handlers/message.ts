// services/websocket/handlers/message.handler.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MessageService } from '../services/message.service';
import { WebSocketService } from '../services/websocket.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('WebSocketMessageHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();
const messageService = MessageService.getInstance();
const websocketService = new WebSocketService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const requestId = event.requestContext.requestId;
  const routeKey = event.requestContext.routeKey;

  logger.info('WebSocket message received', {
    connectionId,
    requestId,
    routeKey
  });

  metrics.incrementCounter('WebSocketMessagesReceived');

  try {
    // Validar conexión
    if (!connectionId) {
      throw new WebSocketError('Missing required connectionId', 400);
    }

    // Obtener la conexión y verificar que existe
    const connection = await connectionService.getConnection(connectionId);
    if (!connection) {
      logger.error('Connection not found', { connectionId });
      metrics.incrementCounter('WebSocketConnectionNotFound');
      
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Connection not found' })
      };
    }

    // Actualizar actividad de la conexión
    await connectionService.updateConnectionStatus(connectionId, 'CONNECTED');

    if (!event.body) {
      throw new WebSocketError('Missing message body', 400);
    }
    const body = JSON.parse(event.body);
    const action = body.action || 'sendMessage';

    // Procesar según el tipo de ruta
    switch (action) {
      case 'sendMessage': {

        // Validar campos requeridos
        if (!body.message || !body.conversationId) {
          throw new WebSocketError(
            'Invalid message format. Required fields: message, conversationId',
            400
          );
        }

        // Generar ID de mensaje si no se proporciona
        const messageId = body.messageId || uuidv4();

        logger.info('Processing user message', {
          connectionId,
          userId: connection.userId,
          conversationId: body.conversationId,
          messageId
        });

        // Crear objeto de mensaje para procesamiento
        const wsMessage = {
          messageId,
          type: body.type || 'USER_MESSAGE',
          content: body.message,
          conversationId: body.conversationId,
          timestamp: new Date().toISOString(),
          metadata: {
            ...body.metadata,
            userId: connection.userId,
            connectionId
          }
        };

        // Enviar confirmación inmediata de recepción
        await websocketService.sendMessage(connectionId, {
          type: 'MESSAGE_RECEIVED',
          messageId,
          conversationId: body.conversationId,
          content: '',
          timestamp: new Date().toISOString()
        });

        // Enviar indicador de escritura
        await websocketService.sendMessage(connectionId, {
          type: 'TYPING_INDICATOR',
          messageId: uuidv4(),
          conversationId: body.conversationId,
          content: 'true',
          timestamp: new Date().toISOString()
        });

        try {
          // Procesar mensaje con entrega garantizada
          const processedMessageId = await messageService.processUserMessage(connection, wsMessage);
          
          metrics.incrementCounter('WebSocketMessagesProcessed');
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              messageId,
              status: 'processed',
              processedMessageId
            })
          };
        } catch (processingError) {
          // Detener indicador de escritura en caso de error
          try {
            await websocketService.sendMessage(connectionId, {
              type: 'TYPING_INDICATOR',
              messageId: uuidv4(),
              conversationId: body.conversationId,
              content: 'false',
              timestamp: new Date().toISOString()
            });
          } catch (typingError) {
            // Solo log, no bloquear el flujo
            logger.warn('Error stopping typing indicator', { 
              error: typingError, 
              connectionId 
            });
          }

          logger.error('Error processing user message', {
            error: processingError,
            connectionId,
            userId: connection.userId,
            conversationId: body.conversationId
          });

          metrics.incrementCounter('MessageProcessingErrors');
          
          throw processingError;
        }
      }

      case 'ping': {
        // Responder con pong para mantener conexión activa
        await websocketService.sendMessage(connectionId, {
          type: 'PONG',
          messageId: uuidv4(),
          conversationId: 'system',
          content: '',
          timestamp: new Date().toISOString()
        });

        metrics.incrementCounter('WebSocketPingsReceived');
        
        return {
          statusCode: 200,
          body: JSON.stringify({ timestamp: Date.now() })
        };
      }

      default:
        logger.warn('Unknown route key', { routeKey, connectionId });
        metrics.incrementCounter('WebSocketUnknownRoutes');
        
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Unsupported route' })
        };
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      connectionId,
      requestId
    });

    metrics.incrementCounter('WebSocketMessageErrors');

    // Intentar notificar al cliente sobre el error
    try {
      if (connectionId) {
        await websocketService.sendMessage(connectionId, {
          type: 'ERROR',
          messageId: uuidv4(),
          conversationId: 'system',
          content: error instanceof WebSocketError 
            ? error.message 
            : 'Error processing your message',
          timestamp: new Date().toISOString()
        });
      }
    } catch (notificationError) {
      logger.error('Failed to send error notification', {
        error: notificationError,
        connectionId
      });
    }

    return {
      statusCode: error instanceof WebSocketError ? error.statusCode : 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : 'Internal server error',
        connectionId,
        error: process.env.STAGE === 'dev' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      })
    };
  }
};