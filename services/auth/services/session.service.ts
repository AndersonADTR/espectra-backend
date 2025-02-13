// services/auth/services/session.service.ts

import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '@shared/services/cache/cache.service';
import { Logger } from '@shared/utils/logger';
import { SessionNotFoundError } from '@shared/utils/errors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Cached } from '@shared/services/cache/cache.decorator';
import { MetricsService } from '@shared/utils/metrics';
import { ObservabilityService } from '@shared/services/observability/observability.service';

export interface Session {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  metadata: Record<string, any>;
  status: SessionStatus;
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED'
}

export class SessionService {
  private readonly logger: Logger;
  private readonly cache: CacheService;
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly metrics: MetricsService;
  private readonly tableName: string;
  private readonly observability: ObservabilityService;

  constructor() {
    this.logger = new Logger('SessionService');
    this.cache = CacheService.getInstance();
    this.dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.metrics = new MetricsService('Sessions');
    this.tableName = process.env.SESSION_TABLE || `${process.env.SERVICE_NAME}-${process.env.STAGE}-chat-sessions`;
    this.observability = ObservabilityService.getInstance();
  }

  @Cached({
    keyPrefix: 'createSession:',
    keyGenerator: ([sessionId]) => sessionId
  })
  async createSession(userId: string, metadata: Record<string, any> = {}): Promise<Session> {
    const session: Session = {
      sessionId: uuidv4(),
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
      lastActivity: new Date().toISOString(),
      metadata: {
        ...metadata,
        userType: metadata.userType || 'basic'
      },
      status: SessionStatus.ACTIVE
    };

    try {
      await this.dynamodb.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          ...session,
          GSI1PK: `USER#${userId}`,
          GSI1SK: session.createdAt,
          entityType: 'SESSION'
        },
        ConditionExpression: 'attribute_not_exists(sessionId)'
      }));

      this.metrics.incrementCounter('SessionCreated');
      return session;

    } catch (error) {
      this.logger.error('Error creating session', { error, userId });
      throw error;
    }
  }

  async getUserActiveSessions(userId: string): Promise<Session[]> {
    try {
      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserStatusIndex',
        KeyConditionExpression: 'userId = :userId AND status = :status',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':status': SessionStatus.ACTIVE
        }
      }));

      return result.Items as Session[];

    } catch (error) {
      this.logger.error('Error getting user sessions', { error, userId });
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<Session> {
    // Intentar obtener de caché primero
    const cachedSession = await this.cache.get<Session>(`session:${sessionId}`);
    if (cachedSession) {
        return cachedSession;
    }

    // Si no está en caché, buscar en DynamoDB
    const result = await this.dynamodb.send(new GetCommand({
        TableName: this.tableName,
        Key: { sessionId }
    }));

    if (!result.Item) {
        this.logger.error(`Session ${sessionId} not found`);
        throw new SessionNotFoundError(`Session ${sessionId} not found`);
    }

    const session = result.Item as Session;

    // Verificar expiración
    if (new Date(session.expiresAt) < new Date()) {
        await this.terminateSession(sessionId);
        this.logger.error(`Session ${sessionId} has expired`);
        throw new SessionNotFoundError(`Session ${sessionId} has expired`);
    }

    // Actualizar caché
    await this.cache.set(
      `session:${sessionId}`,
      session,
      { ttl: 3600 }
    );

    return session;
  }

  async updateSession(sessionId: string, metadata: Record<string, any>): Promise<Session> {
    const session = await this.getSession(sessionId);
    
    const updatedSession: Session = {
      ...session,
      lastActivity: new Date().toISOString(),
      metadata: { ...session.metadata, ...metadata }
    };

    await this.dynamodb.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: 'SET lastActivity = :la, metadata = :md',
      ExpressionAttributeValues: {
        ':la': updatedSession.lastActivity,
        ':md': updatedSession.metadata
      }
    }));

    await this.cache.set(
      `session:${sessionId}`,
      updatedSession,
      { ttl: 3600 }
    );

    return updatedSession;
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.dynamodb.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { sessionId },
      UpdateExpression: 'SET status = :status',
      ExpressionAttributeValues: {
        ':status': SessionStatus.TERMINATED
      }
    }));

    await this.cache.delete(`session:${sessionId}`);
  }



  async extendSession(sessionId: string): Promise<Session> {
    try {
      const session = await this.getSession(sessionId);

      await this.observability.trackSessionMetrics(sessionId, 'SessionExtended', 1);
      
      const extendedSession: Session = {
        ...session,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        lastActivity: new Date().toISOString()
      };

      await this.updateSession(sessionId, extendedSession);
      this.metrics.incrementCounter('SessionExtended');

      return extendedSession;
   } catch (error) {
      await this.observability.trackAuthEvent('SessionExtensionFailure', { sessionId });
      this.logger.error('Error extending session', { error, sessionId });
      throw error;
   }
  }

  async terminateAllUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserActiveSessions(userId);
    
      await Promise.all(
        sessions.map(session => this.terminateSession(session.sessionId))
      );

      this.metrics.incrementCounter('UserSessionsTerminated');
    } catch (error) {
      this.logger.error('Error terminating user sessions', { error, userId });
      throw error;
    }
  }

  async cleanupExpiredSessions(): Promise<void> {
    const result = await this.dynamodb.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'StatusExpiresIndex',
      KeyConditionExpression: 'status = :status AND expiresAt < :now',
      ExpressionAttributeValues: {
        ':status': SessionStatus.ACTIVE,
        ':now': new Date().toISOString()
      }
    }));

    const expiredSessions = result.Items as Session[];

    await Promise.all(
      expiredSessions.map(session => this.terminateSession(session.sessionId))
    );

    this.metrics.incrementCounter('ExpiredSessionsCleaned');
  }
}