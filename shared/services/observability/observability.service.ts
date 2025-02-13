// shared/services/observability/observability.service.ts

import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { Logger } from '@shared/utils/logger';

export interface MetricDimensions {
  Service: string;
  Environment: string;
  [key: string]: string;
}

export class ObservabilityService {
  private static instance: ObservabilityService;
  private readonly cloudWatch: CloudWatchClient;
  private readonly logger: Logger;
  private readonly defaultDimensions: MetricDimensions;
  private readonly namespace: string;

  private constructor() {
    this.cloudWatch = new CloudWatchClient({});
    this.logger = new Logger('ObservabilityService');
    this.defaultDimensions = {
      Service: process.env.SERVICE_NAME || 'espectra-backend',
      Environment: process.env.STAGE || 'dev',
      Component: 'Concierge'  // Alineado con el módulo Concierge
    };
    this.namespace = this.namespace = process.env.METRICS_NAMESPACE || `${process.env.SERVICE_NAME}/${process.env.STAGE}`;
  }

  static getInstance(): ObservabilityService {
    if (!this.instance) {
      this.instance = new ObservabilityService();
    }
    return this.instance;
  }

  async trackAuthEvent(eventName: string, metadata: Record<string, any> = {}) {
    try {
      await this.putMetricData(eventName, 1, {
        ...this.defaultDimensions,
        EventType: eventName
      });

      this.logger.info('Auth event tracked', { eventName, metadata });
    } catch (error) {
      this.logger.error('Error tracking auth event', { error, eventName });
    }
  }

  async trackSessionMetrics(sessionId: string, metricName: string, value: number) {
    try {
      await this.putMetricData(metricName, value, {
        ...this.defaultDimensions,
        SessionId: sessionId
      });
    } catch (error) {
      this.logger.error('Error tracking session metrics', { error, sessionId });
    }
  }

  private async putMetricData(
    metricName: string,
    value: number,
    dimensions: MetricDimensions
  ) {
    const command = new PutMetricDataCommand({
      Namespace: this.namespace,
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: 'Count',
        Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
          Name,
          Value
        })),
        Timestamp: new Date()
      }]
    });

    await this.cloudWatch.send(command);
  }
}

// Implementación de métricas personalizadas para Concierge
export const trackConciergeMetrics = {
  sessionCreated: (sessionId: string) => 
    ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'SessionCreated', 1),
  
  sessionEnded: (sessionId: string) =>
    ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'SessionEnded', 1),
  
  handoffRequested: (sessionId: string) =>
    ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'HandoffRequested', 1)
};