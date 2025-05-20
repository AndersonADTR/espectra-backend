export interface AnomalyRule {
    id: string;
    metricName: string;
    evaluationPeriod: string;
    threshold: number;
    comparisonOperator: 'GreaterThan' | 'LessThan' | 'GreaterThanOrEqualTo' | 'LessThanOrEqualTo';
    anomalyThreshold: number;
    severity: number;
    notificationChannels: ('email' | 'sms' | 'slack')[];
}
export interface AnomalyEvent {
    id: string;
    ruleId: string;
    metricName: string;
    currentValue: number;
    baselineValue: number;
    deviation: number;
    timestamp: string;
    status: 'Open' | 'Acknowledged' | 'Resolved';
    metadata?: Record<string, any>;
}
export declare class AnomalyDetectionService {
    private static instance;
    private readonly logger;
    private readonly dynamoDb;
    private readonly eventBridge;
    private readonly sns;
    private readonly metricsService;
    private readonly rulesTableName;
    private readonly anomaliesTableName;
    private readonly eventBusName;
    private constructor();
    static getInstance(): AnomalyDetectionService;
    evaluateMetric(metricName: string, currentValue: number, dimensions?: Record<string, string>): Promise<boolean>;
    private getRulesForMetric;
    private getMetricBaseline;
    private createAnomalyEvent;
    private sendNotifications;
    private formatNotificationMessage;
    private sendEmailNotification;
    private sendSmsNotification;
    private sendSlackNotification;
}
//# sourceMappingURL=anomaly-detection.service.d.ts.map