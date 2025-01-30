// service/botpress/types/metrics.types.ts

export interface MetricDimensions {
    Environment: string;
    BotId: string;
    [key: string]: string;
}
  
export interface MetricData {
    name: string;
    value: number;
    unit: string;
    dimensions?: MetricDimensions;
}

export interface BotpressMetric {
    type: string;
    value: number;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
  }