// services/websocket/handlers/message.handler.ts

import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { WebSocketService } from '../services/websocket.service';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { Logger } from '@shared/utils/logger';

/**
 * Handler Lambda para procesar mensajes WebSocket
 * Este Lambda maneja los mensajes entrantes de los clientes WebSocket
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {
  const logger = new Logger('WebSocketMessageHandler');
  logger.info('Processing WebSocket message', { routeKey: event.requestContext.routeKey });
  
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;
  
  // Inicializar servicios
  const websocketService = new WebSocketService();
  const botpressService = BotpressService.getInstance();
  
  try {
    if (connectionId == undefined) {
      console.log('No connectionId found');
      throw new Error('No connectionId found');
    }
    // Obtener el ID de usuario asociado a esta conexión
    const userId = await websocketService.getUserIdFromConnection(connectionId);
    
    if (!userId) {
      logger.error('No user ID found for connection', { connectionId });
      return {
        statusCode: 401,
        body: 'Unauthorized'
      };
    }
    
    // Procesar según el tipo de mensaje
    switch (routeKey) {
      case 'sendMessage':
        if (!event.body) {
          logger.error('Empty message body', { connectionId });
          return {
            statusCode: 400,
            body: 'Empty message body'
          };
        }
        
        const messageData = JSON.parse(event.body);
        
        // Validar estructura del mensaje
        if (!messageData.message || !messageData.conversationId) {
          logger.error('Invalid message format', { messageData });
          return {
            statusCode: 400,
            body: 'Invalid message format'
          };
        }
        
        // Enviar mensaje a Botpress
        const response = await botpressService.sendMessage(
          userId,
          messageData.message,
          messageData.conversationId
        );
        
        // Enviar acuse de recibo al cliente
        await websocketService.sendMessageToConnection(connectionId, {
          type: 'message_received',
          messageId: messageData.messageId || Date.now().toString(),
          conversationId: messageData.conversationId,
          status: 'processing'
        });
        
        logger.info('Message sent to Botpress', { 
          userId, 
          conversationId: messageData.conversationId 
        });
        break;
        
      case 'ping':
        // Responder con pong para mantener la conexión activa
        await websocketService.sendMessageToConnection(connectionId, {
          type: 'pong',
          timestamp: Date.now()
        });
        break;
        
      default:
        logger.warn('Unknown route key', { routeKey });
        return {
          statusCode: 400,
          body: 'Unknown route'
        };
    }
    
    return {
      statusCode: 200,
      body: 'Success'
    };
  } catch (error) {
    logger.error('Error handling WebSocket message', { error, routeKey, connectionId });
    
    // Intentar notificar al cliente sobre el error
    try {
      if (connectionId == undefined) {
        console.log('No connectionId found');
        throw new Error('No connectionId found');
      }
      await new WebSocketService().sendMessageToConnection(connectionId, {
        type: 'error',
        message: 'Error processing your request',
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('Failed to send error message to client', { error: e });
    }
    
    return {
      statusCode: 500,
      body: 'Internal server error'
    };
  }
};