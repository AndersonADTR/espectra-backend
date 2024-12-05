// services/botpress/services/metrics/handoff-metrics.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { HandoffQueue, HandoffStatus, HandoffPriority } from 'services/botpress/types/handoff.types';
import { MONITORING_CONFIG } from 'services/botpress/config/config';

interface HandoffMetrics {
  totalHandoffs: number;
  activeHandoffs: number;
  avgWaitTime: number;
  avgResolutionTime: number;
  handoffsByStatus: Record<HandoffStatus, number>;
  handoffsByPriority: Record<HandoffPriority, number>;
}

export class HandoffMetricsService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly handoffQueueTable: string;

  constructor() {
    this.logger = new Logger('HandoffMetricsService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.handoffQueueTable = process.env.HANDOFF_QUEUE_TABLE || '';

    if (!this.handoffQueueTable) {
      throw new Error('HANDOFF_QUEUE_TABLE environment variable is not set');
    }
  }

  async recordHandoffCreated(handoff: HandoffQueue): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffCreated');
      this.metrics.incrementCounter(`HandoffCreated_${handoff.priority}`);

      await this.updateRealTimeMetrics();

      this.logger.info('Recorded handoff creation', {
        queueId: handoff.queueId,
        priority: handoff.priority
      });
    } catch (error) {
      this.logger.error('Failed to record handoff metrics', {
        error,
        queueId: handoff.queueId
      });
    }
  }

  async recordHandoffAssigned(
    queueId: string,
    advisorId: string,
    waitTime: number
  ): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffAssigned');
      this.metrics.recordLatency('HandoffWaitTime', waitTime);

      await this.updateAdvisorMetrics(advisorId);

      this.logger.info('Recorded handoff assignment', {
        queueId,
        advisorId,
        waitTime
      });
    } catch (error) {
      this.logger.error('Failed to record handoff assignment metrics', {
        error,
        queueId,
        advisorId
      });
    }
  }

  async recordHandoffCompleted(
    queueId: string,
    advisorId: string,
    resolutionTime: number
  ): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffCompleted');
      this.metrics.recordLatency('HandoffResolutionTime', resolutionTime);

      await this.updateAdvisorMetrics(advisorId);

      this.logger.info('Recorded handoff completion', {
        queueId,
        advisorId,
        resolutionTime
      });
    } catch (error) {
      this.logger.error('Failed to record handoff completion metrics', {
        error,
        queueId,
        advisorId
      });
    }
  }

  async getHandoffMetrics(timeRange?: { start: string; end: string }): Promise<HandoffMetrics> {
    try {
      const queryParams = {
        TableName: this.handoffQueueTable,
        ...(timeRange && {
          FilterExpression: 'createdAt BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':start': timeRange.start,
            ':end': timeRange.end
          }
        })
      };

      const result = await this.ddb.scan(queryParams);
      const handoffs = result.Items as HandoffQueue[];

      const metrics = this.calculateMetrics(handoffs);

      this.logger.info('Retrieved handoff metrics', { 
        timeRange,
        metricsSnapshot: metrics 
      });

      return metrics;
    } catch (error) {
      this.logger.error('Failed to get handoff metrics', {
        error,
        timeRange
      });
      throw error;
    }
  }

  private calculateMetrics(handoffs: HandoffQueue[]): HandoffMetrics {
    const metrics: HandoffMetrics = {
      totalHandoffs: handoffs.length,
      activeHandoffs: 0,
      avgWaitTime: 0,
      avgResolutionTime: 0,
      handoffsByStatus: {
        pending: 0,
        assigned: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
        timeout: 0
      },
      handoffsByPriority: {
        low: 0,
        medium: 0,
        high: 0
      }
    };

    let totalWaitTime = 0;
    let totalResolutionTime = 0;
    let waitTimeCount = 0;
    let resolutionTimeCount = 0;

    handoffs.forEach(handoff => {
      // Contar por estado
      metrics.handoffsByStatus[handoff.status]++;

      // Contar por prioridad
      metrics.handoffsByPriority[handoff.priority]++;

      // Contar handoffs activos
      if (['assigned', 'active'].includes(handoff.status)) {
        metrics.activeHandoffs++;
      }

      // Calcular tiempos si están disponibles en metadata
      if (handoff.metadata?.metrics) {
        if (handoff.metadata.metrics.waitTime) {
          totalWaitTime += handoff.metadata.metrics.waitTime;
          waitTimeCount++;
        }
        if (handoff.metadata.metrics.resolutionTime) {
          totalResolutionTime += handoff.metadata.metrics.resolutionTime;
          resolutionTimeCount++;
        }
      }
    });

    // Calcular promedios
    metrics.avgWaitTime = waitTimeCount > 0 ? totalWaitTime / waitTimeCount : 0;
    metrics.avgResolutionTime = resolutionTimeCount > 0 ? totalResolutionTime / resolutionTimeCount : 0;

    return metrics;
  }

  private async updateRealTimeMetrics(): Promise<void> {
    try {
      const metrics = await this.getHandoffMetrics();
      
      // Publicar métricas en tiempo real
      this.metrics.recordMetric('ActiveHandoffs', metrics.activeHandoffs);
      this.metrics.recordMetric('AverageWaitTime', metrics.avgWaitTime);
      this.metrics.recordMetric('AverageResolutionTime', metrics.avgResolutionTime);

      // Publicar métricas por estado
      Object.entries(metrics.handoffsByStatus).forEach(([status, count]) => {
        this.metrics.recordMetric(`HandoffsByStatus_${status}`, count);
      });

      // Publicar métricas por prioridad
      Object.entries(metrics.handoffsByPriority).forEach(([priority, count]) => {
        this.metrics.recordMetric(`HandoffsByPriority_${priority}`, count);
      });
    } catch (error) {
      this.logger.error('Failed to update real-time metrics', { error });
    }
  }

  private async updateAdvisorMetrics(advisorId: string): Promise<void> {
    try {
      const handoffs = await this.getAdvisorHandoffs(advisorId);
      const activeHandoffs = handoffs.filter(h => 
        ['assigned', 'active'].includes(h.status)
      ).length;

      this.metrics.recordMetric(`AdvisorActiveHandoffs_${advisorId}`, activeHandoffs);
    } catch (error) {
      this.logger.error('Failed to update advisor metrics', {
        error,
        advisorId
      });
    }
  }

  private async getAdvisorHandoffs(advisorId: string): Promise<HandoffQueue[]> {
    const result = await this.ddb.query({
      TableName: this.handoffQueueTable,
      IndexName: 'AdvisorIndex',
      KeyConditionExpression: 'advisorId = :advisorId',
      ExpressionAttributeValues: {
        ':advisorId': advisorId
      }
    });

    return (result.Items || []) as HandoffQueue[];
  }
}