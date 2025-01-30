import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';

const logger = new Logger('WebSocketConnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.requestContext.authorizer?.userId;
  const requestId = event.requestContext.requestId;

  try {
    logger.info('WebSocket connect attempt', {
      connectionId,
      userId,
      requestId,
      headers: event.headers,
      queryParams: event.queryStringParameters
    });

    if (!connectionId || !userId) {
      const error = new WebSocketError(
        'Missing required connection data',
        400,
        { connectionId, userId }
      );
      logger.error(error.message, error.metadata);
      throw error;
    }

    await connectionService.createConnection(connectionId, userId, {
      userAgent: event.headers['User-Agent'],
      platform: event.queryStringParameters?.platform,
      requestId,
      timestamp: new Date().toISOString()
    });

    metrics.incrementCounter('WebSocketConnections');
    logger.info('WebSocket connection successful', { connectionId, userId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Connected successfully',
        connectionId,
        userId
      })
    };
  } catch (error) {
    logger.error('WebSocket connection failed', {
      error,
      connectionId,
      userId,
      requestId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
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
        error: process.env.STAGE === 'dev' ? error : undefined
      })
    };
  }
};