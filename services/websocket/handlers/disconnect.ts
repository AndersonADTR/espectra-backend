import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';
import { WebSocketError } from '../utils/errors';

const logger = new Logger('WebSocketDisconnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const requestId = event.requestContext.requestId;

  try {
    logger.info('WebSocket disconnect attempt', {
      connectionId,
      requestId
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

    await connectionService.deleteConnection(connectionId);

    metrics.incrementCounter('WebSocketDisconnections');
    logger.info('WebSocket disconnection successful', { connectionId });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Disconnected successfully',
        connectionId
      })
    };
  } catch (error) {
    logger.error('WebSocket disconnection failed', {
      error,
      connectionId,
      requestId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    metrics.incrementCounter('WebSocketDisconnectionFailures');

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