// services/websocket/connection-manager.service.ts
import { BaseService } from '../../botpress/services/base/base.service';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { WebSocketError } from '../utils/errors';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { WebSocketConnectionState } from '../types/connection.types';
import { Connection } from '../models/connection';

export class WebSocketConnectionManager extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly connectionTableName: string;
    handoffTopicArn: any;
    sns: any;

  constructor() {
    super('WebSocketConnectionManager');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.connectionTableName = process.env.WEBSOCKET_CONNECTION_TABLE || '';
  }

  async handleDisconnection(connectionId: string): Promise<void> {
    try {
      // 1. Obtener estado actual
      const connection = await this.getConnectionState(connectionId);
      if (!connection) {
        throw new WebSocketError('Connection not found');
      }

      // 2. Guardar último estado conocido
      await this.saveConnectionState({
        ...connection,
        status: 'disconnected',
        lastUpdated: new Date().toISOString(),
        metadata: {
          ...connection.metadata,
          lastDisconnection: new Date().toISOString()
        }
      });

      // 3. Notificar a otros servicios
      await this.notifyDisconnection(connection);

      this.metrics.incrementCounter('WebSocketDisconnections');
    } catch (error) {
      this.logger.error('Failed to handle disconnection', { error, connectionId });
      throw error;
    }
  }

  async handleReconnection(connectionId: string, userId: string): Promise<void> {
    try {
      // 1. Buscar conexiones previas
      const previousConnections = await this.getPreviousConnections(userId);
      
      // 2. Recuperar último estado
      const lastState = this.getLastValidState(previousConnections);

      // 3. Iniciar nueva conexión con contexto recuperado
      await this.initializeConnection(connectionId, userId, lastState);

      this.metrics.incrementCounter('WebSocketReconnections');
    } catch (error) {
      this.logger.error('Failed to handle reconnection', { error, connectionId, userId });
      throw error;
    }
  }

  private async getConnectionState(connectionId: string): Promise<WebSocketConnectionState | null> {
    const result = await this.ddb.get({
      TableName: this.connectionTableName,
      Key: { connectionId }
    });
    return result.Item as WebSocketConnectionState || null;
  }

  private async saveConnectionState(state: WebSocketConnectionState): Promise<void> {
    await this.ddb.put({
      TableName: this.connectionTableName,
      Item: state
    });
  }

  private async notifyDisconnection(connection: WebSocketConnectionState): Promise<void> {
    // Notificar a servicios relevantes
    const connectionId = connection.connectionId;
    if (connection.metadata?.inHandoff) {
      await this.notifyHandoffService({ connectionId, status: 'DISCONNECTED' }, 'DISCONNECTED');
    }
  }

  private async notifyHandoffService(connection: Partial<Connection>, eventType: string): Promise<void> {
    try {
      const message = {
        connectionId: connection.connectionId,
        userId: connection.userId,
        eventType,
        timestamp: new Date().toISOString(),
      };

      const params = {
        Message: JSON.stringify(message),
        TopicArn: this.handoffTopicArn,
      };

      await this.sns.publish(params);
      this.logger.info('Handoff service notified successfully', { message });
    } catch (error) {
      this.logger.error('Failed to notify handoff service', { error: (error as Error).message });
      throw new Error('Failed to notify handoff service');
    }
  }

  private async getPreviousConnections(userId: string): Promise<WebSocketConnectionState[]> {
    const result = await this.ddb.query({
      TableName: this.connectionTableName,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });
    return result.Items as WebSocketConnectionState[];
  }

  private getLastValidState(connections: WebSocketConnectionState[]): Partial<WebSocketConnectionState> {
    if (!connections.length) return {};
    
    // Ordenar por timestamp y obtener el más reciente
    const lastConnection = connections
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())[0];

    return {
      userId: lastConnection.userId,
      metadata: lastConnection.metadata,
      context: lastConnection.context
    };
  }

  private async initializeConnection(
    connectionId: string, 
    userId: string, 
    previousState: Partial<WebSocketConnectionState>
  ): Promise<void> {
    const newState: WebSocketConnectionState = {
      connectionId,
      userId,
      status: 'connected',
      lastUpdated: new Date().toISOString(),
      metadata: {
        ...previousState.metadata,
        reconnected: true,
        previousStates: [
          ...(previousState.metadata?.previousStates || []),
          {
            timestamp: new Date().toISOString(),
            event: 'reconnection'
          }
        ]
      },
      context: previousState.context || {}
    };

    await this.saveConnectionState(newState);
  }
}