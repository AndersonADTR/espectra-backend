// services/auth/models/session.model.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from '@shared/utils/logger';

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED'
}

export interface SessionAttributes {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  status: SessionStatus;
  metadata?: Record<string, any>;
}

export class SessionModel {
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly tableName: string;

  constructor() {
    const client = new DynamoDBClient({});
    this.dynamodb = DynamoDBDocumentClient.from(client);
    this.logger = new Logger('SessionModel');
    this.tableName = `${process.env.METRICS_TABLE}`;
  }

  async create(session: SessionAttributes): Promise<SessionAttributes> {
    try {
      await this.dynamodb.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          ...session,
          GSI1PK: `USER#${session.userId}`,
          GSI1SK: session.createdAt,
          GSI2PK: `STATUS#${session.status}`,
          GSI2SK: session.lastActivity
        },
        ConditionExpression: 'attribute_not_exists(sessionId)'
      }));

      return session;
    } catch (error) {
      this.logger.error('Error creating session', { error, sessionId: session.sessionId });
      throw error;
    }
  }

  async get(sessionId: string): Promise<SessionAttributes | null> {
    try {
      const result = await this.dynamodb.send(new GetCommand({
        TableName: this.tableName,
        Key: { sessionId }
      }));

      return result.Item as SessionAttributes || null;
    } catch (error) {
      this.logger.error('Error getting session', { error, sessionId });
      throw error;
    }
  }

  async update(sessionId: string, updates: Partial<SessionAttributes>): Promise<SessionAttributes> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.entries(updates).forEach(([key, value]) => {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      });

      const result = await this.dynamodb.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      return result.Attributes as SessionAttributes;
    } catch (error) {
      this.logger.error('Error updating session', { error, sessionId });
      throw error;
    }
  }

  async queryByUser(userId: string, status?: SessionStatus): Promise<SessionAttributes[]> {
    try {
      const params: any = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`
        }
      };

      if (status) {
        params.FilterExpression = 'status = :status';
        params.ExpressionAttributeValues[':status'] = status;
      }

      const result = await this.dynamodb.send(new QueryCommand(params));
      return result.Items as SessionAttributes[];
    } catch (error) {
      this.logger.error('Error querying sessions by user', { error, userId });
      throw error;
    }
  }
}