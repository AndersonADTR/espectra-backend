// services/botpress/services/connections/connection-manager.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { BaseService } from '../base/base.service';
import { WebSocketService } from '../../../websocket/services/websocket.service';

interface ConnectionState {
  connectionId: string;
  userId: string;
  status: 'connected' | 'handoff' | 'disconnected';
  lastActivity: string;
  metadata?: Record<string, any>;
}

export class ConnectionManagerService extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly wsService: WebSocketService;
  private readonly tableName: string;

  constructor() {
    super('ConnectionManagerService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.wsService = new WebSocketService();
    this.tableName = process.env.CONNECTIONS_TABLE || '';

    if (!this.tableName) {
      throw new Error('CONNECTIONS_TABLE environment variable is not set');
    }
  }

  async registerConnection(connectionId: string, userId: string): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          connectionId,
          userId,
          status: 'connected',
          lastActivity: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h TTL
        }
      });

      this.metrics.incrementCounter('NewConnections');
    } catch (error) {
      this.handleError(error, 'Failed to register connection', {
        connectionId,
        userId
      });
    }
  }

  async handleDisconnection(connectionId: string): Promise<void> {
    try {
      const connection = await this.getConnection(connectionId);
      if (!connection) return;

      await this.ddb.update({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'SET #status = :status, lastActivity = :lastActivity',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'disconnected',
          ':lastActivity': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter('Disconnections');
    } catch (error) {
      this.handleError(error, 'Failed to handle disconnection', {
        connectionId
      });
    }
  }

  async updateConnectionState(connectionId: string, status: ConnectionState['status']): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'SET #status = :status, lastActivity = :lastActivity',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':lastActivity': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter(`ConnectionStatus_${status}`);
    } catch (error) {
      this.handleError(error, 'Failed to update connection state', {
        connectionId,
        status
      });
    }
  }

  private async getConnection(connectionId: string): Promise<ConnectionState | null> {
    const result = await this.ddb.get({
      TableName: this.tableName,
      Key: { connectionId }
    });

    return result.Item as ConnectionState || null;
  }

  async cleanupStaleConnections(maxAgeMinutes: number = 60): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
      
      const result = await this.ddb.scan({
        TableName: this.tableName,
        FilterExpression: 'lastActivity < :cutoff',
        ExpressionAttributeValues: {
          ':cutoff': cutoffTime
        }
      });

      const staleConnections = result.Items as ConnectionState[];
      
      for (const connection of staleConnections) {
        await this.handleDisconnection(connection.connectionId);
      }

      this.metrics.recordMetric('StaleConnectionsCleanup', staleConnections.length);
    } catch (error) {
      this.handleError(error, 'Failed to cleanup stale connections');
    }
  }
}