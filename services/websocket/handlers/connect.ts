// services/websocket/handlers/connect.handler.ts

import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';

/**
 * Handler Lambda para gestionar conexiones WebSocket
 * Este Lambda maneja los eventos de conexión y desconexión de WebSocket
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {
  const logger = new Logger('WebSocketConnectionHandler');
  logger.info('Processing WebSocket connection event', { 
    routeKey: event.requestContext.routeKey 
  });
  
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;
  
  // Inicializar cliente DynamoDB
  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.CONNECTIONS_TABLE || 
    `${process.env.SERVICE_NAME}-${process.env.STAGE}-websocket-connections`;
  
  try {
    switch (routeKey) {
      case '$connect':
        // Extraer el ID de usuario del token de autorización
        // Asumimos que el authorizer ya validó el token y añadió el userId al context
        const userId = event.requestContext.authorizer?.userId;
        
        if (!userId) {
          logger.error('No user ID found in connection request');
          return {
            statusCode: 401,
            body: 'Unauthorized'
          };
        }
        
        // Guardar la conexión en DynamoDB
        await ddbDocClient.send(new PutCommand({
          TableName: tableName,
          Item: {
            connectionId,
            userId,
            connectedAt: Date.now(),
            ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas TTL
          }
        }));
        
        logger.info('WebSocket connection established', { connectionId, userId });
        break;
        
      case '$disconnect':
        // Eliminar la conexión de DynamoDB
        await ddbDocClient.send(new DeleteCommand({
          TableName: tableName,
          Key: { connectionId }
        }));
        
        logger.info('WebSocket connection closed', { connectionId });
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
    logger.error('Error handling WebSocket connection', { error, routeKey, connectionId });
    
    return {
      statusCode: 500,
      body: 'Internal server error'
    };
  }
};