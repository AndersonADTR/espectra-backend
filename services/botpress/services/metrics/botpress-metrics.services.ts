// services/botpress/services/metrics/botpress-metrics.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { CloudWatch, GetMetricDataCommandOutput, StandardUnit } from '@aws-sdk/client-cloudwatch';

interface MetricDimensions {
  Environment: string;
  BotId: string;
  [key: string]: string;
}

export class BotpressMetricsService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly cloudWatch: CloudWatch;
  private readonly namespace: string;
  private readonly defaultDimensions: MetricDimensions;

  constructor() {
    this.logger = new Logger('BotpressMetricsService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.cloudWatch = new CloudWatch({});
    this.namespace = 'Spectra/Botpress';
    this.defaultDimensions = {
      Environment: process.env.STAGE || 'development',
      BotId: process.env.BOTPRESS_BOT_ID || 'default'
    };
  }

  // Métricas de Mensajes
  async trackMessageMetrics(data: {
    userId: string;
    messageType: string;
    tokensUsed: number;
    processingTime: number;
    handoffRequested?: boolean;
  }): Promise<void> {
    try {
      const dimensions = {
        ...this.defaultDimensions,
        MessageType: data.messageType
      };

      await Promise.all([
        this.putMetric('MessagesProcessed', 1, 'Count', dimensions),
        this.putMetric('TokensUsed', data.tokensUsed, 'Count', dimensions),
        this.putMetric('MessageProcessingTime', data.processingTime, 'Milliseconds', dimensions),
        data.handoffRequested && this.putMetric('HandoffRequests', 1, 'Count', dimensions)
      ]);

      this.logger.debug('Message metrics recorded', { data });
    } catch (error) {
      this.logger.error('Failed to record message metrics', { error, data });
    }
  }

  // Métricas de Sesión
  async trackSessionMetrics(data: {
    userId: string;
    duration: number;
    messageCount: number;
    status: string;
  }): Promise<void> {
    try {
      const dimensions = {
        ...this.defaultDimensions,
        SessionStatus: data.status
      };

      await Promise.all([
        this.putMetric('SessionDuration', data.duration, 'Seconds', dimensions),
        this.putMetric('SessionMessageCount', data.messageCount, 'Count', dimensions),
        this.putMetric('ActiveSessions', 1, 'Count', dimensions)
      ]);
    } catch (error) {
      this.logger.error('Failed to record session metrics', { error, data });
    }
  }

  // Métricas de Handoff
  async trackHandoffMetrics(data: {
    userId: string;
    waitTime: number;
    resolutionTime?: number;
    status: string;
    advisorId?: string;
  }): Promise<void> {
    try {
      const dimensions = {
        ...this.defaultDimensions,
        HandoffStatus: data.status,
        AdvisorId: data.advisorId || 'unassigned'
      };

      await Promise.all([
        this.putMetric('HandoffWaitTime', data.waitTime, 'Seconds', dimensions),
        data.resolutionTime && this.putMetric('HandoffResolutionTime', data.resolutionTime, 'Seconds', dimensions),
        this.putMetric('HandoffCount', 1, 'Count', dimensions)
      ]);
    } catch (error) {
      this.logger.error('Failed to record handoff metrics', { error, data });
    }
  }

  // Métricas de Tokens
  async trackTokenMetrics(data: {
    userId: string;
    planType: string;
    tokensUsed: number;
    tokensRemaining: number;
  }): Promise<void> {
    try {
      const dimensions = {
        ...this.defaultDimensions,
        PlanType: data.planType
      };

      await Promise.all([
        this.putMetric('TokensConsumed', data.tokensUsed, 'Count', dimensions),
        this.putMetric('TokensRemaining', data.tokensRemaining, 'Count', dimensions),
        this.putMetric('TokenUtilizationRate', 
          (data.tokensUsed / (data.tokensUsed + data.tokensRemaining)) * 100,
          'Percent', 
          dimensions
        )
      ]);
    } catch (error) {
      this.logger.error('Failed to record token metrics', { error, data });
    }
  }

  // Métricas de Performance
  async trackPerformanceMetrics(data: {
    operation: string;
    duration: number;
    success: boolean;
    errorType?: string;
  }): Promise<void> {
    try {
      const dimensions = {
        ...this.defaultDimensions,
        Operation: data.operation
      };

      await Promise.all([
        this.putMetric('OperationDuration', data.duration, 'Milliseconds', dimensions),
        this.putMetric(data.success ? 'SuccessfulOperations' : 'FailedOperations', 1, 'Count', dimensions),
        data.errorType && this.putMetric(`Errors_${data.errorType}`, 1, 'Count', dimensions)
      ]);
    } catch (error) {
      this.logger.error('Failed to record performance metrics', { error, data });
    }
  }

  // Métricas Acumuladas
  async getAggregatedMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<Record<string, number>> {
    try {
      const metrics: Promise<GetMetricDataCommandOutput> = this.cloudWatch.getMetricData({
        StartTime: timeRange.startTime,
        EndTime: timeRange.endTime,
        MetricDataQueries: [
          {
            Id: 'totalMessages',
            MetricStat: {
              Metric: {
                Namespace: this.namespace,
                MetricName: 'MessagesProcessed',
                Dimensions: Object.entries(this.defaultDimensions).map(([Name, Value]) => ({ Name, Value }))
              },
              Period: 3600,
              Stat: 'Sum'
            }
          },
          {
            Id: 'avgProcessingTime',
            MetricStat: {
              Metric: {
                Namespace: this.namespace,
                MetricName: 'MessageProcessingTime',
                Dimensions: Object.entries(this.defaultDimensions).map(([Name, Value]) => ({ Name, Value }))
              },
              Period: 3600,
              Stat: 'Average'
            }
          }
          // Añadir más métricas según necesidad
        ]
      });

      return this.processMetricResults((await metrics).MetricDataResults || []);
    } catch (error) {
      this.logger.error('Failed to get aggregated metrics', { error, timeRange });
      throw error;
    }
  }

  private async putMetric(
    metricName: string,
    value: number,
    unit: string,
    dimensions: Record<string, string>
  ): Promise<void> {
    try {
      await this.cloudWatch.putMetricData({
        Namespace: this.namespace,
        MetricData: [{
          MetricName: metricName,
          Value: value,
          Unit: unit as StandardUnit,
          Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
            Name,
            Value
          })),
          Timestamp: new Date()
        }]
      });
    } catch (error) {
      this.logger.error('Failed to put metric', {
        error,
        metricName,
        value,
        dimensions
      });
    }
  }

  private processMetricResults(results: any[]): Record<string, number> {
    return results.reduce((acc, result) => {
      const values = result.Values || [];
      acc[result.Id] = values.length > 0 ? values[values.length - 1] : 0;
      return acc;
    }, {});
  }
}