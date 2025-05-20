"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackConciergeMetrics = exports.ObservabilityService = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const logger_1 = require("@shared/utils/logger");
class ObservabilityService {
    static instance;
    cloudWatch;
    logger;
    defaultDimensions;
    namespace;
    constructor() {
        this.cloudWatch = new client_cloudwatch_1.CloudWatchClient({});
        this.logger = new logger_1.Logger('ObservabilityService');
        this.defaultDimensions = {
            Service: process.env.SERVICE_NAME || 'espectra-backend',
            Environment: process.env.STAGE || 'dev',
            Component: 'Concierge'
        };
        this.namespace = this.namespace = process.env.METRICS_NAMESPACE || `${process.env.SERVICE_NAME}/${process.env.STAGE}`;
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new ObservabilityService();
        }
        return this.instance;
    }
    async trackAuthEvent(eventName, metadata = {}) {
        try {
            await this.putMetricData(eventName, 1, {
                ...this.defaultDimensions,
                EventType: eventName
            });
            this.logger.info('Auth event tracked', { eventName, metadata });
        }
        catch (error) {
            this.logger.error('Error tracking auth event', { error, eventName });
        }
    }
    async trackSessionMetrics(sessionId, metricName, value) {
        try {
            await this.putMetricData(metricName, value, {
                ...this.defaultDimensions,
                SessionId: sessionId
            });
        }
        catch (error) {
            this.logger.error('Error tracking session metrics', { error, sessionId });
        }
    }
    async putMetricData(metricName, value, dimensions) {
        const command = new client_cloudwatch_1.PutMetricDataCommand({
            Namespace: this.namespace,
            MetricData: [{
                    MetricName: metricName,
                    Value: value,
                    Unit: 'Count',
                    Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
                        Name,
                        Value
                    })),
                    Timestamp: new Date()
                }]
        });
        await this.cloudWatch.send(command);
    }
}
exports.ObservabilityService = ObservabilityService;
exports.trackConciergeMetrics = {
    sessionCreated: (sessionId) => ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'SessionCreated', 1),
    sessionEnded: (sessionId) => ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'SessionEnded', 1),
    handoffRequested: (sessionId) => ObservabilityService.getInstance().trackSessionMetrics(sessionId, 'HandoffRequested', 1)
};
//# sourceMappingURL=observability.service.js.map