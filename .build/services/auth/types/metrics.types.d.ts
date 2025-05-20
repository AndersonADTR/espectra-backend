export interface MetricRecord {
    metricId: string;
    metricType: string;
    value: number;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
    timestamp?: string;
}
export interface MetricFilter {
    metricType: string;
    startTime: string;
    endTime: string;
    userId?: string;
    sessionId?: string;
}
//# sourceMappingURL=metrics.types.d.ts.map