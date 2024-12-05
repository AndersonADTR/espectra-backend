// services/botpress/services/advisor.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { WebSocketService } from '../../websocket/services/websocket.service';
import { MONITORING_CONFIG } from '../config/config';

interface AdvisorStatus {
  advisorId: string;
  status: 'available' | 'busy' | 'offline';
  lastUpdated: string;
  activeConversations: number;
  metadata?: {
    name?: string;
    email?: string;
    specialties?: string[];
  };
}

export class AdvisorService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly wsService: WebSocketService;
  private readonly advisorTableName: string;

  constructor() {
    this.logger = new Logger('AdvisorService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.wsService = new WebSocketService();
    
    this.advisorTableName = process.env.ADVISOR_TABLE_NAME || '';
    
    if (!this.advisorTableName) {
      throw new Error('ADVISOR_TABLE_NAME environment variable is not set');
    }
  }

  async updateStatus(advisorId: string, status: AdvisorStatus['status']): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.advisorTableName,
        Key: { advisorId },
        UpdateExpression: 'SET #status = :status, lastUpdated = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':timestamp': new Date().toISOString()
        }
      });

      this.metrics.incrementCounter('AdvisorStatusUpdates');
      
      this.logger.info('Advisor status updated', {
        advisorId,
        status
      });
    } catch (error) {
      this.logger.error('Failed to update advisor status', {
        error,
        advisorId,
        status
      });
      throw error;
    }
  }

  async getAvailableAdvisors(): Promise<AdvisorStatus[]> {
    try {
      const result = await this.ddb.query({
        TableName: this.advisorTableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'available'
        }
      });

      this.metrics.recordMetric('AvailableAdvisorsCount', result.Items?.length || 0);

      return (result.Items || []) as AdvisorStatus[];
    } catch (error) {
      this.logger.error('Failed to get available advisors', { error });
      throw error;
    }
  }

  async incrementActiveConversations(advisorId: string): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.advisorTableName,
        Key: { advisorId },
        UpdateExpression: 'SET activeConversations = activeConversations + :inc',
        ExpressionAttributeValues: {
          ':inc': 1
        }
      });

      this.logger.info('Incremented active conversations', { advisorId });
    } catch (error) {
      this.logger.error('Failed to increment active conversations', {
        error,
        advisorId
      });
      throw error;
    }
  }

  async decrementActiveConversations(advisorId: string): Promise<void> {
    try {
      await this.ddb.update({
        TableName: this.advisorTableName,
        Key: { advisorId },
        UpdateExpression: 'SET activeConversations = activeConversations - :dec',
        ExpressionAttributeValues: {
          ':dec': 1
        },
        ConditionExpression: 'activeConversations > :zero'
      });

      this.logger.info('Decremented active conversations', { advisorId });
    } catch (error) {
      this.logger.error('Failed to decrement active conversations', {
        error,
        advisorId
      });
      throw error;
    }
  }
}