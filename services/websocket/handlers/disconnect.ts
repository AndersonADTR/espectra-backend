// services/websocket/handlers/disconnect.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from '../services/connection.service';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('WebSocketDisconnectHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const connectionService = new ConnectionService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;

  try {
    logger.info('WebSocket disconnect', { connectionId });

    if (!connectionId) {
      throw new Error('Missing required connectionId');
    }

    await connectionService.deleteConnection(connectionId);

    metrics.incrementCounter('WebSocketDisconnections');

    return {
      statusCode: 200,
      body: 'Disconnected',
    };
  } catch (error) {
    logger.error('Error handling WebSocket disconnect', { error, connectionId });

    metrics.incrementCounter('WebSocketDisconnectionFailures');

    return {
      statusCode: 500,
      body: 'Failed to disconnect',
    };
  }
};