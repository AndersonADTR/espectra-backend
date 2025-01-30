// services/botpress/services/chat/chat-session.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { BaseService } from '../base/base.service';
import { ChatMessage } from '../../types/chat.types';
import { CacheService } from '../cache/cache.service';

interface ChatSession {
  sessionId: string;
  userId: string;
  conversationId: string;
  startedAt: string;
  lastActivity: string;
  messageCount: number;
  status: 'active' | 'handoff' | 'ended';
  metadata?: Record<string, any>;
}

export class ChatSessionService extends BaseService {
  private readonly ddb: DynamoDBDocument;
  private readonly cache: CacheService;
  private readonly tableName: string;

  constructor() {
    super('ChatSessionService');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.cache = new CacheService();
    this.tableName = process.env.CHAT_SESSIONS_TABLE || '';

    if (!this.tableName) {
      throw new Error('CHAT_SESSIONS_TABLE environment variable is not set');
    }
  }

  async createSession(userId: string, conversationId: string): Promise<ChatSession> {
    const session: ChatSession = {
      sessionId: `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      conversationId,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      status: 'active'
    };

    await this.ddb.put({
      TableName: this.tableName,
      Item: {
        ...session,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 días TTL
      }
    });

    await this.cache.set(`session:${session.sessionId}`, session, 3600);
    this.metrics.incrementCounter('SessionsCreated');

    return session;
  }

  async updateSession(sessionId: string, message: ChatMessage): Promise<void> {
    await this.ddb.update({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: 'SET messageCount = messageCount + :inc, lastActivity = :timestamp',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':timestamp': new Date().toISOString()
      }
    });

    await this.cache.delete(`session:${sessionId}`);
    this.metrics.incrementCounter('SessionUpdates');
  }

  async markSessionHandoff(sessionId: string): Promise<void> {
    await this.ddb.update({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: 'SET #status = :status, lastActivity = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'handoff',
        ':timestamp': new Date().toISOString()
      }
    });

    await this.cache.delete(`session:${sessionId}`);
    this.metrics.incrementCounter('SessionHandoffs');
  }

  async endSession(sessionId: string): Promise<void> {
    await this.ddb.update({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: 'SET #status = :status, lastActivity = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'ended',
        ':timestamp': new Date().toISOString()
      }
    });

    await this.cache.delete(`session:${sessionId}`);
    this.metrics.incrementCounter('SessionsEnded');
  }

  async getActiveSessions(userId: string): Promise<ChatSession[]> {
    const result = await this.ddb.query({
      TableName: this.tableName,
      IndexName: 'UserIdStatusIndex',
      KeyConditionExpression: 'userId = :userId AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':status': 'active'
      }
    });

    return result.Items as ChatSession[];
  }
}