import { MetricRecord, MetricFilter } from '../types/metrics.types';
export declare class MetricsModel {
    private readonly dynamodb;
    private readonly logger;
    private readonly tableName;
    constructor();
    recordMetric(metric: MetricRecord): Promise<void>;
    queryMetrics(filter: MetricFilter): Promise<MetricRecord[]>;
}
//# sourceMappingURL=metrics.model.d.ts.map