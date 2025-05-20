"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const logger_1 = require("../logger");
class MetricsService {
    cloudWatch;
    logger;
    namespace;
    constructor(namespace) {
        this.cloudWatch = new client_cloudwatch_1.CloudWatch({});
        this.logger = new logger_1.Logger('MetricsService');
        this.namespace = namespace;
    }
    async incrementCounter(metricName, value = 1, dimensions) {
        try {
            await this.putMetricData(metricName, value, 'Count', dimensions);
        }
        catch (error) {
            this.logger.error('Failed to increment counter', { error, metricName });
        }
    }
    async recordLatency(metricName, latencyMs, dimensions) {
        try {
            await this.putMetricData(metricName, latencyMs, 'Milliseconds', dimensions);
        }
        catch (error) {
            this.logger.error('Failed to record latency', { error, metricName });
        }
    }
    async recordMetric(metricName, value, dimensions) {
        try {
            await this.putMetricData(metricName, value, 'None', dimensions);
        }
        catch (error) {
            this.logger.error('Failed to record metric', { error, metricName });
        }
    }
    async putMetricData(metricName, value, unit, dimensions) {
        try {
            const metricDimensions = dimensions
                ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
                : [];
            await this.cloudWatch.putMetricData({
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: metricName,
                        Value: value,
                        Unit: unit,
                        Dimensions: metricDimensions,
                        Timestamp: new Date()
                    }
                ]
            });
            this.logger.debug('Metric recorded successfully', {
                namespace: this.namespace,
                metricName,
                value,
                unit,
                dimensions
            });
        }
        catch (error) {
            this.logger.error('Failed to put metric data', {
                error,
                namespace: this.namespace,
                metricName,
                value,
                unit,
                dimensions
            });
        }
    }
}
exports.MetricsService = MetricsService;
//# sourceMappingURL=metrics.service.js.map