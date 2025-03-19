// services/websocket/services/websocket.service.ts

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConnectionService } from './connection.service';
import { WSMessage } from '../types/websocket.types';

export class WebSocketService {
  private readonly apiGatewayClient: ApiGatewayManagementApiClient;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly connectionService: ConnectionService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly connectionsTableName: string;
  private readonly apiGatewayEndpoint: string;

  constructor() {
    this.logger = new Logger('WebSocketService');
    this.metrics = new MetricsService('WebSocket');
    this.connectionService = new ConnectionService();
    
    // Initialize DynamoDB client
    const ddbClient = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(ddbClient);
    
    // Get API Gateway endpoint from environment variables
    this.apiGatewayEndpoint = process.env.WEBSOCKET_API_ENDPOINT || '';
    if (!this.apiGatewayEndpoint) {
      this.logger.error('WebSocket API endpoint not configured');
      throw new Error('WebSocket API endpoint not configured in environment variables');
    }
    
    // Initialize API Gateway Management API client
    this.apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: this.apiGatewayEndpoint
    });
    
    // Get connections table name from environment variables
    this.connectionsTableName = process.env.CONNECTIONS_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-websocket-connections`;
  }

  /**
   * Envía un mensaje a una conexión WebSocket específica
   * @param connectionId ID de la conexión WebSocket
   * @param message Mensaje a enviar
   * @returns Promise<boolean> True si se envió correctamente
   */
  public async sendMessage(connectionId: string, message: WSMessage | any): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      
      await this.apiGatewayClient.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(data)
      }));
      
      this.metrics.incrementCounter('WebSocketMessagesSent');
      this.metrics.recordLatency('WebSocketSendLatency', Date.now() - startTime);
      
      return true;
    } catch (error: any) {
      // Check if connection is gone (410 Gone)
      if (error.$metadata?.httpStatusCode === 410 || error.name === 'GoneException') {
        this.logger.info('WebSocket connection no longer available, cleaning up', { connectionId });
        
        // Eliminar la conexión de la base de datos
        try {
          await this.connectionService.deleteConnection(connectionId);
        } catch (cleanupError) {
          this.logger.error('Error cleaning up stale connection', { 
            error: cleanupError, 
            connectionId 
          });
        }
        
        this.metrics.incrementCounter('WebSocketStaleConnections');
        return false;
      }
      
      this.logger.error('Error sending message to WebSocket connection', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId,
        errorName: error.name,
        errorCode: error.$metadata?.httpStatusCode
      });
      
      this.metrics.incrementCounter('WebSocketSendErrors');
      this.metrics.recordLatency('WebSocketSendLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Envía un mensaje a todas las conexiones activas de un usuario
   * @param userId ID del usuario
   * @param message Mensaje a enviar
   * @returns Number of connections that received the message
   */
  public async sendMessageToUser(userId: string, message: WSMessage | any): Promise<number> {
    const startTime = Date.now();
    
    try {
      // Obtener todas las conexiones activas para este usuario
      const connections = await this.connectionService.getConnectionsByUserId(userId);
      
      this.logger.info(`Found ${connections.length} active connections for user`, { userId });
      
      if (connections.length === 0) {
        return 0;
      }
      
      // Enviar mensaje a cada conexión activa
      const sendPromises = connections
        .filter(conn => conn.isActive())
        .map(conn => 
          this.sendMessage(conn.connectionId, message)
            .catch(() => false) // Catch errors but continue with other connections
        );
      
      const results = await Promise.all(sendPromises);
      const successCount = results.filter(Boolean).length;
      
      this.logger.info(`Successfully sent message to ${successCount}/${connections.length} connections`, { userId });
      
      this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
      
      return successCount;
    } catch (error) {
      this.logger.error('Error sending message to user connections', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        userId 
      });
      
      this.metrics.incrementCounter('WebSocketBroadcastErrors');
      this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Envía un mensaje a todos los usuarios o a un grupo específico
   * @param message Mensaje a enviar
   * @param userIds IDs de usuarios a los que enviar (opcional, si no se especifica se envía a todos)
   * @returns Número de conexiones a las que se envió el mensaje
   */
  public async broadcastMessage(message: WSMessage | any, userIds?: string[]): Promise<number> {
    const startTime = Date.now();
    
    try {
      let connections = [];
      
      if (userIds && userIds.length > 0) {
        // Obtener conexiones para los usuarios especificados
        const connectionsPromises = userIds.map(userId => 
          this.connectionService.getConnectionsByUserId(userId)
        );
        
        const connectionsArrays = await Promise.all(connectionsPromises);
        connections = connectionsArrays.flat();
      } else {
        // Obtener todas las conexiones activas
        const result = await this.dynamoDbClient.send(new QueryCommand({
          TableName: this.connectionsTableName,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: {
            '#status': 'status'
          },
          ExpressionAttributeValues: {
            ':status': 'CONNECTED'
          }
        }));
        
        connections = result.Items || [];
      }
      
      if (connections.length === 0) {
        this.logger.info('No active connections found for broadcast');
        return 0;
      }
      
      this.logger.info(`Broadcasting message to ${connections.length} connections`);
      
      // Enviar mensaje a cada conexión
      const sendPromises = connections.map(conn => 
        this.sendMessage(conn.connectionId, message)
          .catch(() => false) // Catch errors but continue with other connections
      );
      
      const results = await Promise.all(sendPromises);
      const successCount = results.filter(Boolean).length;
      
      this.logger.info(`Successfully broadcast message to ${successCount}/${connections.length} connections`);
      
      this.metrics.incrementCounter('WebSocketBroadcasts');
      this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
      
      return successCount;
    } catch (error) {
      this.logger.error('Error broadcasting message', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      this.metrics.incrementCounter('WebSocketBroadcastErrors');
      this.metrics.recordLatency('WebSocketBroadcastLatency', Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Obtiene el ID de usuario asociado a una conexión
   * @param connectionId ID de la conexión WebSocket
   * @returns ID del usuario o null si no se encuentra
   */
  public async getUserIdFromConnection(connectionId: string): Promise<string | null> {
    try {
      const connection = await this.connectionService.getConnection(connectionId);
      return connection?.userId || null;
    } catch (error) {
      this.logger.error('Error getting user ID from connection', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        connectionId 
      });
      
      this.metrics.incrementCounter('WebSocketConnectionLookupErrors');
      throw error;
    }
  }
}