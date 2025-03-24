// services/websocket/handlers/connect.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';
import { WSMessage } from '../types/websocket.types';
import { WebSocketService } from '../services/websocket.service';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('WebSocketConnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();
const websocketService = new WebSocketService();

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

    // Enviar mensaje de bienvenida/confirmación al cliente
    try {
      const welcomeMessage: WSMessage = {
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
      };
      
      await websocketService.sendMessage(connectionId, welcomeMessage);
    } catch (welcomeError) {
      // No interrumpimos la conexión si falla el mensaje de bienvenida
      logger.warn('Failed to send welcome message', {
        error: welcomeError instanceof Error ? welcomeError.message : 'Unknown error',
        connectionId
      });
    }

    metrics.incrementCounter('WebSocketConnections');
    metrics.incrementCounter('ActiveConnections', 1, { userId });
    
    logger.info('WebSocket connection successful', { 
      connectionId,
      userId,
      metadata: connectionMetadata
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Connected successfully',
        connectionId
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