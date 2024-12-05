// services/websocket/services/websocket.service.ts

import { 
    ApiGatewayManagementApi,
    PostToConnectionCommand 
  } from '@aws-sdk/client-apigatewaymanagementapi';
  import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
  import { DynamoDB } from '@aws-sdk/client-dynamodb';
  import { Logger } from '@shared/utils/logger';
  import { MetricsService } from '@shared/utils/metrics';
  import { WSConnection, WSMessage } from '../types/websocket.types';
  import { WebSocketError } from '../utils/errors';
  import { MONITORING_CONFIG } from '../../botpress/config/config';
  
  export class WebSocketService {
    private readonly logger: Logger;
    private readonly metrics: MetricsService;
    private readonly apiGateway: ApiGatewayManagementApi;
    private readonly ddb: DynamoDBDocument;
    private readonly connectionsTable: string;
  
    constructor() {
      this.logger = new Logger('WebSocketService');
      this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
      this.ddb = DynamoDBDocument.from(new DynamoDB({}));
      
      if (!process.env.WEBSOCKET_API_ENDPOINT || !process.env.CONNECTIONS_TABLE_NAME) {
        throw new Error('Missing required environment variables');
      }
  
      this.apiGateway = new ApiGatewayManagementApi({
        endpoint: process.env.WEBSOCKET_API_ENDPOINT,
        region: process.env.AWS_REGION
      });
  
      this.connectionsTable = process.env.CONNECTIONS_TABLE_NAME;
    }
  
    async saveConnection(connection: WSConnection): Promise<void> {
      try {
        await this.ddb.put({
          TableName: this.connectionsTable,
          Item: {
            ...connection,
            ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas TTL
          }
        });
  
        this.metrics.incrementCounter('WebSocketConnections');
        
        this.logger.info('Connection saved successfully', {
          connectionId: connection.connectionId,
          userId: connection.userId
        });
      } catch (error) {
        this.logger.error('Failed to save connection', {
          error,
          connectionId: connection.connectionId
        });
        throw new WebSocketError('Failed to save connection');
      }
    }
  
    async removeConnection(connectionId: string): Promise<void> {
      try {
        await this.ddb.delete({
          TableName: this.connectionsTable,
          Key: { connectionId }
        });
  
        this.metrics.incrementCounter('WebSocketDisconnections');
        
        this.logger.info('Connection removed successfully', { connectionId });
      } catch (error) {
        this.logger.error('Failed to remove connection', {
          error,
          connectionId
        });
        throw new WebSocketError('Failed to remove connection');
      }
    }
  
    async sendMessage(connectionId: string, message: WSMessage): Promise<void> {
      try {
        await this.apiGateway.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: Buffer.from(JSON.stringify(message))
          })
        );
  
        this.metrics.incrementCounter('WebSocketMessagesSent');
        
        this.logger.info('Message sent successfully', {
          connectionId,
          messageType: message.type
        });
      } catch (error: any) {
        // GoneException - conexión ya no está disponible
        if (error.statusCode === 410) {
          this.logger.warn('Connection stale, removing...', { connectionId });
          await this.removeConnection(connectionId);
          throw new WebSocketError('Connection no longer available', 410);
        }
  
        this.metrics.incrementCounter('WebSocketSendErrors');
        
        this.logger.error('Failed to send message', {
          error,
          connectionId,
          messageType: message.type
        });
        throw new WebSocketError('Failed to send message');
      }
    }

    async sendToUser(userId: string, message: WSMessage): Promise<void> {
      try {
        // Obtener todas las conexiones activas del usuario
        const connections = await this.getConnectionsByUserId(userId);
        
        if (connections.length === 0) {
          this.logger.warn('No active connections found for user', { userId });
          return;
        }
    
        // Enviar el mensaje a todas las conexiones activas del usuario
        const sendPromises = connections.map(connection =>
          this.sendMessage(connection.connectionId, message)
            .catch(error => {
              this.logger.error('Failed to send message to user connection', {
                error,
                userId,
                connectionId: connection.connectionId
              });
              return null;
            })
        );
    
        await Promise.all(sendPromises);
    
        this.metrics.incrementCounter('WebSocketMessagesToUser');
        
        this.logger.info('Message sent to user', {
          userId,
          connectionCount: connections.length,
          messageType: message.type
        });
      } catch (error) {
        this.logger.error('Failed to send message to user', {
          error,
          userId,
          messageType: message.type
        });
        throw new WebSocketError('Failed to send message to user');
      }
    }
  
    async broadcastMessage(message: WSMessage, userIds?: string[]): Promise<void> {
      try {
        // Obtener conexiones activas
        const connections = await this.getActiveConnections(userIds);
        
        if (connections.length === 0) {
          this.logger.info('No active connections for broadcast');
          return;
        }
  
        // Enviar mensaje a todas las conexiones activas
        const sendPromises = connections.map(conn =>
          this.sendMessage(conn.connectionId, message)
            .catch(error => {
              this.logger.error('Failed to broadcast to connection', {
                error,
                connectionId: conn.connectionId
              });
              return null;
            })
        );
  
        await Promise.all(sendPromises);
  
        this.metrics.recordMetric('WebSocketBroadcastSize', connections.length);
        
        this.logger.info('Broadcast completed', {
          recipientCount: connections.length,
          messageType: message.type
        });
      } catch (error) {
        this.logger.error('Failed to broadcast message', {
          error,
          userIds,
          messageType: message.type
        });
        throw new WebSocketError('Failed to broadcast message');
      }
    }
  
    private async getActiveConnections(userIds?: string[]): Promise<WSConnection[]> {
      try {
        if (userIds && userIds.length > 0) {
          // Consultar conexiones para usuarios específicos
          const queryPromises = userIds.map(userId =>
            this.ddb.query({
              TableName: this.connectionsTable,
              IndexName: 'UserIdIndex',
              KeyConditionExpression: 'userId = :userId',
              ExpressionAttributeValues: { ':userId': userId }
            })
          );
  
          const results = await Promise.all(queryPromises);
          return results.flatMap(result => result.Items as WSConnection[]);
        } else {
          // Obtener todas las conexiones activas
          const result = await this.ddb.scan({
            TableName: this.connectionsTable
          });
  
          return (result.Items || []) as WSConnection[];
        }
      } catch (error) {
        this.logger.error('Failed to get active connections', {
          error,
          userIds
        });
        throw new WebSocketError('Failed to get active connections');
      }
    }
  
    async getConnectionsByUserId(userId: string): Promise<WSConnection[]> {
      try {
        const result = await this.ddb.query({
          TableName: this.connectionsTable,
          IndexName: 'UserIdIndex',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: { ':userId': userId }
        });
  
        return (result.Items || []) as WSConnection[];
      } catch (error) {
        this.logger.error('Failed to get connections by userId', {
          error,
          userId
        });
        throw new WebSocketError('Failed to get user connections');
      }
    }
  }