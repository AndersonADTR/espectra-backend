// services/websocket/handlers/connect.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { ConversationsService } from '../services/conversations';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';
import { WSMessage } from '../types/websocket.types';
import { WebSocketService } from '../services/websocket.service';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('WebSocketConnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();
const websocketService = new WebSocketService();
const conversationsService = ConversationsService.getInstance();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const requestId = event.requestContext.requestId;

  try {
    logger.info('WebSocket connection attempt', {
      connectionId,
      requestId,
      routeKey: event.requestContext.routeKey
    });

    if (!connectionId) {
      const error = new WebSocketError(
        'Missing required connectionId',
        400,
        { connectionId }
      );
      logger.error(error.message, error.metadata);
      throw error;
    }

    // Extraer el ID de usuario del token de autorización
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) {
      logger.error('No user ID found in connection request', {
        connectionId,
        headers: event.headers,
        authorizer: event.requestContext.authorizer
      });

      metrics.incrementCounter('WebSocketConnectionAuthFailures');

      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Unauthorized: Missing userId in authorization context',
          connectionId
        })
      };
    }

    // Obtener metadatos de la conexión
    const connectionMetadata = {
      userAgent: event.headers['User-Agent'] || event.headers['user-agent'],
      platform: event.queryStringParameters?.platform || 'unknown',
      clientType: event.queryStringParameters?.clientType || 'unknown',
      clientVersion: event.queryStringParameters?.clientVersion || 'unknown'
    };

    // Guardar la conexión usando el ConnectionService
    await connectionService.createConnection(
      connectionId,
      userId,
      connectionMetadata
    );

    // Obtener o crear una conversación para el usuario
    let conversationId = '';
    let isNewConversation = false;
    try {
      // Obtener la conexión recién creada
      const connection = await connectionService.getConnection(connectionId);
      if (!connection) {
        throw new WebSocketError('Connection not found after creation', 500);
      }

      // Obtener o crear una conversación
      const { conversationId: convId, welcomeMessage, isNew } =
        await conversationsService.getOrCreateConversationFromConnection(connection);

      conversationId = convId;
      isNewConversation = isNew;

      // Enviar mensaje de bienvenida/confirmación al cliente
      await websocketService.sendMessage(connectionId, {
        messageId: uuidv4(),
        type: 'SESSION_STARTED',
        conversationId: 'system',
        content: 'Connected successfully to SPECTRUM',
        timestamp: new Date().toISOString(),
        metadata: {
          connectionId,
          conversationId,
          serverTime: new Date().toISOString(),
          serverEnvironment: process.env.STAGE || 'dev'
        }
      });

      // Enviar mensaje de conversación creada o reanudada
      await websocketService.sendMessage(connectionId, welcomeMessage);

      logger.info(isNew ? 'New conversation created for user' : 'Existing conversation resumed for user', {
        userId,
        connectionId,
        conversationId,
        isNew
      });
    } catch (conversationError) {
      // No interrumpimos la conexión si falla la obtención o creación de la conversación
      logger.warn('Failed to get or create conversation or send welcome message', {
        error: conversationError instanceof Error ? conversationError.message : 'Unknown error',
        connectionId,
        userId
      });

      // Enviar mensaje básico de bienvenida si falla la creación de conversación
      try {
        await websocketService.sendMessage(connectionId, {
          messageId: uuidv4(),
          type: 'SESSION_STARTED',
          conversationId: 'system',
          content: 'Connected successfully to SPECTRUM',
          timestamp: new Date().toISOString(),
          metadata: {
            connectionId,
            serverTime: new Date().toISOString(),
            serverEnvironment: process.env.STAGE || 'dev'
          }
        });
      } catch (welcomeError) {
        logger.warn('Failed to send fallback welcome message', {
          error: welcomeError instanceof Error ? welcomeError.message : 'Unknown error',
          connectionId
        });
      }
    }

    metrics.incrementCounter('WebSocketConnections');
    metrics.incrementCounter('ActiveConnections', 1, { userId });

    logger.info('WebSocket connection successful', {
      connectionId,
      userId,
      conversationId: conversationId || 'not_created',
      isNewConversation,
      metadata: connectionMetadata
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Connected successfully',
        connectionId,
        conversationId: conversationId || undefined,
        isNewConversation
      })
    };
  } catch (error) {
    logger.error('WebSocket connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      connectionId,
      requestId
    });

    metrics.incrementCounter('WebSocketConnectionFailures');

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