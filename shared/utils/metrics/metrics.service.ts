// shared/utils/metrics/metrics.service.ts

import { CloudWatch, Dimension, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { Logger } from '../logger';

export class MetricsService {
  private readonly cloudWatch: CloudWatch;
  private readonly logger: Logger;
  private readonly namespace: string;

  constructor(namespace: string) {
    this.cloudWatch = new CloudWatch({});
    this.logger = new Logger('MetricsService');
    this.namespace = namespace;
  }

  async incrementCounter(metricName: string, value: number = 1, dimensions?: Record<string, string>): Promise<void> {
    try {
      await this.putMetricData(metricName, value, 'Count', dimensions);
    } catch (error) {
      this.logger.error('Failed to increment counter', { error, metricName });
    }
  }

  async recordLatency(metricName: string, latencyMs: number, dimensions?: Record<string, string>): Promise<void> {
    try {
      await this.putMetricData(metricName, latencyMs, 'Milliseconds', dimensions);
    } catch (error) {
      this.logger.error('Failed to record latency', { error, metricName });
    }
  }

  async recordMetric(metricName: string, value: number, dimensions?: Record<string, string>): Promise<void> {
    try {
      await this.putMetricData(metricName, value, 'None', dimensions);
    } catch (error) {
      this.logger.error('Failed to record metric', { error, metricName });
    }
  }

  private async putMetricData(
    metricName: string,
    value: number,
    unit: StandardUnit,
    dimensions?: Record<string, string>
  ): Promise<void> {
    try {
      const metricDimensions: Dimension[] = dimensions 
        ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
        : [];

      await this.cloudWatch.putMetricData({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Dimensions: metricDimensions,
            Timestamp: new Date()
          }
        ]
      });

      this.logger.debug('Metric recorded successfully', {
        namespace: this.namespace,
        metricName,
        value,
        unit,
        dimensions
      });
    } catch (error) {
      this.logger.error('Failed to put metric data', {
        error,
        namespace: this.namespace,
        metricName,
        value,
        unit,
        dimensions
      });
      // No relanzamos el error para evitar que las métricas interrumpan el flujo principal
    }
  }
}