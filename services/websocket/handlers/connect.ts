// services/websocket/handlers/connect.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('WebSocketConnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  const userId = event.requestContext.authorizer?.principalId;

  try {
    logger.info('WebSocket connect', { connectionId, userId });

    if (!connectionId || !userId) {
      throw new Error('Missing required connectionId or userId');
    }

    await connectionService.createConnection(connectionId, userId, {
      'User-Agent': event.headers['User-Agent'],
      platform: event.queryStringParameters?.platform,
    });

    metrics.incrementCounter('WebSocketConnections');

    return {
      statusCode: 200,
      body: 'Connected',
    };
  } catch (error) {
    logger.error('Error handling WebSocket connect', { error, connectionId, userId });

    metrics.incrementCounter('WebSocketConnectionFailures');

    return {
      statusCode: 500,
      body: 'Failed to connect',
    };
  }
};