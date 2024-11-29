// services/websocket/handlers/disconnect.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { InternalServerError } from '@shared/utils/errors';
import { ConnectionService } from '../../websocket/services/connection.services';

const logger = new Logger('WebSocket-Disconnect');
const ddb = DynamoDBDocument.from(new DynamoDB({}));
const connectionService = new ConnectionService(ddb);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;

    logger.info('WebSocket disconnect request', {
      connectionId,
      requestId: event.requestContext.requestId
    });

    if (connectionId) {
      await connectionService.removeConnection(connectionId);
    } else {
      throw new InternalServerError('Connection ID is undefined');
    }

    return {
      statusCode: 200,
      body: 'Disconnected successfully'
    };
  } catch (error) {
    logger.error('Failed to handle WebSocket disconnect', {
      error: (error as Error).message,
      connectionId: event.requestContext.connectionId,
      requestId: event.requestContext.requestId
    });

    return {
      statusCode: 500,
      body: 'Failed to disconnect'
    };
  }
};