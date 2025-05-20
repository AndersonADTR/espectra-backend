import { StandardUnit } from "@aws-sdk/client-cloudwatch";
export interface MetricDimensions {
    [key: string]: string;
}
export interface MetricData {
    metricName: string;
    value: number;
    unit?: StandardUnit;
    dimensions?: MetricDimensions;
    timestamp?: Date;
}
export interface MetricRecord {
    id: string;
    metricName: string;
    value: number;
    unit: string;
    timestamp: string;
    dimensions?: MetricDimensions;
    ttl?: number;
}
export declare class BusinessMetricsService {
    private static instance;
    private readonly cloudWatch;
    private readonly dynamoDB;
    private readonly logger;
    private readonly namespace;
    private readonly tableName;
    private readonly defaultDimensions;
    private constructor();
    static getInstance(): BusinessMetricsService;
    trackMetric(metric: MetricData): Promise<void>;
    incrementCounter(metricName: string, count?: number, dimensions?: MetricDimensions): Promise<void>;
    recordDuration(metricName: string, milliseconds: number, dimensions?: MetricDimensions): Promise<void>;
    trackTokenUsage(userId: string, tokens: number, plan: string, conversationId?: string): Promise<void>;
    trackHandoffMetric(metricName: string, value?: number, metadata?: Record<string, string>): Promise<void>;
    private publishToCloudWatch;
    private saveToDatabase;
    getMetricsHistory(metricName: string, startTime: string, endTime: string, dimensions?: MetricDimensions): Promise<MetricRecord[]>;
}
//# sourceMappingURL=business-metrics.service.d.ts.map