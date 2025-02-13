// services/auth/models/metrics.model.ts

import { MetricRecord, MetricFilter } from '../types/metrics.types';
import { Logger } from '@shared/utils/logger';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export class MetricsModel {
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly tableName: string;

  constructor() {
    const client = new DynamoDBClient({});
    this.dynamodb = DynamoDBDocumentClient.from(client);
    this.logger = new Logger('MetricsModel');
    this.tableName = `${process.env.SERVICE_NAME}-${process.env.STAGE}-metrics`;
  }

  async recordMetric(metric: MetricRecord): Promise<void> {
    try {
      await this.dynamodb.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          ...metric,
          timestamp: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 días
        }
      }));
    } catch (error) {
      this.logger.error('Error recording metric', { error, metric });
      throw error;
    }
  }

  async queryMetrics(filter: MetricFilter): Promise<MetricRecord[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'MetricTypeIndex',
        KeyConditionExpression: 'metricType = :type AND #ts BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#ts': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':type': filter.metricType,
          ':start': filter.startTime,
          ':end': filter.endTime
        }
      };

      const result = await this.dynamodb.send(new QueryCommand(params));
      return result.Items as MetricRecord[];
    } catch (error) {
      this.logger.error('Error querying metrics', { error, filter });
      throw error;
    }
  }
}