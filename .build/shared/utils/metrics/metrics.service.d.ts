export declare class MetricsService {
    private readonly cloudWatch;
    private readonly logger;
    private readonly namespace;
    constructor(namespace: string);
    incrementCounter(metricName: string, value?: number, dimensions?: Record<string, string>): Promise<void>;
    recordLatency(metricName: string, latencyMs: number, dimensions?: Record<string, string>): Promise<void>;
    recordMetric(metricName: string, value: number, dimensions?: Record<string, string>): Promise<void>;
    private putMetricData;
}
//# sourceMappingURL=metrics.service.d.ts.map