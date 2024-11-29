// services/websocket/services/connection.services.ts
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { InternalServerError } from '@shared/utils/errors';

export interface Connection {
  connectionId: string;
  userId: string;
  timestamp: string;
  status: 'CONNECTED' | 'DISCONNECTED';
}

export class ConnectionService {
  private readonly tableName: string;
  private readonly logger: Logger;

  constructor(private readonly ddb: DynamoDBDocument) {
    const tableName = process.env.CONNECTION_TABLE;
    if (!tableName) {
      throw new Error('CONNECTION_TABLE environment variable is not defined');
    }
    this.tableName = tableName;
    this.logger = new Logger('ConnectionService');
  }

  async saveConnection(connection: Connection): Promise<void> {
    try {
      this.logger.info('Saving connection', { 
        connectionId: connection.connectionId,
        tableName: this.tableName 
      });

      await this.ddb.put({
        TableName: this.tableName,
        Item: connection
      });

      this.logger.info('Connection saved successfully', { 
        connectionId: connection.connectionId 
      });
    } catch (error) {
      this.logger.error('Failed to save connection', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId: connection.connectionId,
        tableName: this.tableName
      });
      throw new InternalServerError('Failed to save connection');
    }
  }

  async removeConnection(connectionId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { connectionId }
      });

      this.logger.info('Connection removed successfully', { connectionId });
    } catch (error) {
      this.logger.error('Failed to remove connection', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionId 
      });
      throw new InternalServerError('Failed to remove connection');
    }
  }
}