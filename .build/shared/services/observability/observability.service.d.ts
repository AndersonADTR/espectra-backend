export interface MetricDimensions {
    Service: string;
    Environment: string;
    [key: string]: string;
}
export declare class ObservabilityService {
    private static instance;
    private readonly cloudWatch;
    private readonly logger;
    private readonly defaultDimensions;
    private readonly namespace;
    private constructor();
    static getInstance(): ObservabilityService;
    trackAuthEvent(eventName: string, metadata?: Record<string, any>): Promise<void>;
    trackSessionMetrics(sessionId: string, metricName: string, value: number): Promise<void>;
    private putMetricData;
}
export declare const trackConciergeMetrics: {
    sessionCreated: (sessionId: string) => Promise<void>;
    sessionEnded: (sessionId: string) => Promise<void>;
    handoffRequested: (sessionId: string) => Promise<void>;
};
//# sourceMappingURL=observability.service.d.ts.map