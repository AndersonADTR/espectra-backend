import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { Connection } from '../models/connection';
import { WSConnectionStatus } from '../types/websocket.types';
import { WebSocketError } from '../utils/errors';
import { MONITORING_CONFIG } from '../../botpress/config/config';

export class ConnectionService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    this.logger = new Logger('ConnectionService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    
    const tableName = process.env.CONNECTIONS_TABLE_NAME;
    if (!tableName) {
      throw new Error('CONNECTIONS_TABLE_NAME environment variable is not defined');
    }
    this.tableName = tableName;
  }

  async createConnection(connectionId: string, userId: string, metadata?: Record<string, any>): Promise<Connection> {
    try {
      this.logger.info('Creating new connection', { connectionId, userId });
      
      const connection = Connection.createFromRequest(connectionId, userId, {
        ...metadata,
        createdAt: new Date().toISOString(),
        status: 'CONNECTED'
      });

      await this.saveConnection(connection);
      
      this.metrics.incrementCounter('WebSocketConnectionsCreated');
      return connection;
    } catch (error) {
      this.logger.error('Failed to create connection', { error, connectionId, userId });
      throw new WebSocketError('Failed to create connection', 500);
    }
  }

  async getConnection(connectionId: string): Promise<Connection | null> {
    try {
      const result = await this.ddb.get({
        TableName: this.tableName,
        Key: { connectionId }
      });

      if (!result.Item) {
        this.logger.info('Connection not found', { connectionId });
        return null;
      }

      return Connection.create(result.Item as Connection);
    } catch (error) {
      this.logger.error('Failed to get connection', { error, connectionId });
      throw new WebSocketError('Failed to get connection', 500);
    }
  }

  async saveConnection(connection: Connection): Promise<void> {
    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: {
          ...connection,
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24h TTL
        }
      });

      this.metrics.incrementCounter('WebSocketConnectionsSaved');
      this.logger.info('Connection saved', { 
        connectionId: connection.connectionId, 
        userId: connection.userId 
      });
    } catch (error) {
      this.logger.error('Failed to save connection', { error, connection });
      throw new WebSocketError('Failed to save connection', 500);
    }
  }

  async updateConnectionStatus(connectionId: string, status: WSConnectionStatus): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updatedAt': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter('WebSocketStatusUpdates');
      this.logger.info('Connection status updated', { connectionId, status });
    } catch (error) {
      this.logger.error('Failed to update connection status', { error, connectionId, status });
      throw new WebSocketError('Failed to update connection status', 500);
    }
  }

  async deleteConnection(connectionId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { connectionId }
      });

      this.metrics.incrementCounter('WebSocketConnectionsDeleted');
      this.logger.info('Connection deleted', { connectionId });
    } catch (error) {
      this.logger.error('Failed to delete connection', { error, connectionId });
      throw new WebSocketError('Failed to delete connection', 500);
    }
  }

  async getConnectionsByUserId(userId: string): Promise<Connection[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
      });

      return (result.Items || []).map(item => Connection.create(item as Connection));
    } catch (error) {
      this.logger.error('Failed to get connections by userId', { error, userId });
      throw new WebSocketError('Failed to get connections by userId', 500);
    }
  }
}