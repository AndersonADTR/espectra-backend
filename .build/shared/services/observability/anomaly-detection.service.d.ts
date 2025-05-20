export interface AnomalyRule {
    metricName: string;
    threshold: number;
    timeWindowSeconds: number;
    action: (violation: AnomalyViolation) => Promise<void>;
}
export interface AnomalyViolation {
    userId: string;
    sessionId?: string;
    metricName: string;
    currentValue: number;
    threshold: number;
    timestamp: string;
}
export declare class AnomalyDetectionService {
    private static instance;
    private readonly logger;
    private readonly redis;
    private readonly metrics;
    private rules;
    private constructor();
    static getInstance(): AnomalyDetectionService;
    private initializeRules;
    addRule(rule: AnomalyRule): void;
    trackMetric(userId: string, metricName: string, value?: number, sessionId?: string): Promise<void>;
    private incrementMetric;
    private handleFailedLogins;
    private handleExcessiveSessions;
    private enforceRateLimit;
}
//# sourceMappingURL=anomaly-detection.service.d.ts.map