// services/websocket/handlers/connect.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { InternalServerError } from '@shared/utils/errors';
import { ConnectionService } from '../../websocket/services/connection.services';

const logger = new Logger('WebSocket-Connect');
const ddb = DynamoDBDocument.from(new DynamoDB({}));
const connectionService = new ConnectionService(ddb);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;
    if (!connectionId) {
      throw new InternalServerError('Connection ID is missing');
    }
    const userId = event.requestContext.authorizer?.userId;

    logger.info('New WebSocket connection request', {
      connectionId,
      userId,
      requestId: event.requestContext.requestId
    });

    await connectionService.saveConnection({
      connectionId,
      userId,
      timestamp: new Date().toISOString(),
      status: 'CONNECTED'
    });

    return {
      statusCode: 200,
      body: 'Connected successfully'
    };
  } catch (error) {
    logger.error('Failed to handle WebSocket connect', {
      error: (error as Error).message,
      connectionId: event.requestContext.connectionId,
      requestId: event.requestContext.requestId
    });

    return {
      statusCode: 500,
      body: 'Failed to establish connection'
    };
  }
};