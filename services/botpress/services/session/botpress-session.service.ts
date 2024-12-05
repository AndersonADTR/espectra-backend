// services/botpress/services/session/botpress-session.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';
import { BotpressSession, SessionContext } from '../../types/botpress.types';

export class BotpressSessionService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly sessionTable: string;

  constructor() {
    this.logger = new Logger('BotpressSessionService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.sessionTable = process.env.BOTPRESS_SESSION_TABLE || '';

    if (!this.sessionTable) {
      throw new Error('BOTPRESS_SESSION_TABLE environment variable is not set');
    }
  }

  async createSession(userId: string, initialContext?: Partial<SessionContext>): Promise<BotpressSession> {
    try {
      const session: BotpressSession = {
        id: `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        botId: process.env.BOTPRESS_BOT_ID!,
        channel: 'web',
        lastEventAt: new Date().toISOString(),
        context: {
          variables: {},
          temp: {},
          ...initialContext
        },
        status: 'active'
      };

      await this.ddb.put({
        TableName: this.sessionTable,
        Item: {
          ...session,
          ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 horas TTL
        }
      });

      this.metrics.incrementCounter('SessionsCreated');

      return session;
    } catch (error) {
      this.logger.error('Failed to create session', { error, userId });
      throw new BotpressError('Failed to create session');
    }
  }

  async updateSession(
    sessionId: string,
    updates: Partial<BotpressSession>
  ): Promise<BotpressSession> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {
        ':lastEventAt': new Date().toISOString()
      };

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          updateExpressions.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = value;
        }
      });

      updateExpressions.push('#lastEventAt = :lastEventAt');
      expressionAttributeNames['#lastEventAt'] = 'lastEventAt';

      const result = await this.ddb.update({
        TableName: this.sessionTable,
        Key: { id: sessionId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      return result.Attributes as BotpressSession;
    } catch (error) {
      this.logger.error('Failed to update session', { error, sessionId });
      throw new BotpressError('Failed to update session');
    }
  }

  async getSession(sessionId: string): Promise<BotpressSession | null> {
    try {
      const result = await this.ddb.get({
        TableName: this.sessionTable,
        Key: { id: sessionId }
      });

      return (result.Item as BotpressSession) || null;
    } catch (error) {
      this.logger.error('Failed to get session', { error, sessionId });
      throw new BotpressError('Failed to get session');
    }
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      await this.updateSession(sessionId, {
        status: 'ended',
        context: {
          variables: {},
          temp: {}
        }
      });

      this.metrics.incrementCounter('SessionsEnded');
    } catch (error) {
      this.logger.error('Failed to end session', { error, sessionId });
      throw new BotpressError('Failed to end session');
    }
  }
}