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