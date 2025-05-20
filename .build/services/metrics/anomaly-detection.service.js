"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnomalyDetectionService = void 0;
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_sns_1 = require("@aws-sdk/client-sns");
const logger_1 = require("@shared/utils/logger");
const business_metrics_service_1 = require("./business-metrics.service");
class AnomalyDetectionService {
    static instance;
    logger;
    dynamoDb;
    eventBridge;
    sns;
    metricsService;
    rulesTableName;
    anomaliesTableName;
    eventBusName;
    constructor() {
        this.logger = new logger_1.Logger('AnomalyDetectionService');
        const dbClient = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDb = lib_dynamodb_1.DynamoDBDocumentClient.from(dbClient);
        this.eventBridge = new client_eventbridge_1.EventBridgeClient({});
        this.sns = new client_sns_1.SNSClient({});
        this.metricsService = business_metrics_service_1.BusinessMetricsService.getInstance();
        this.rulesTableName = process.env.ANOMALY_RULES_TABLE ||
            `${process.env.RESOURCE_PREFIX}-anomaly-rules`;
        this.anomaliesTableName = process.env.ANOMALIES_TABLE ||
            `${process.env.RESOURCE_PREFIX}-anomalies`;
        this.eventBusName = process.env.EVENT_BUS_NAME ||
            `${process.env.RESOURCE_PREFIX}-event-bus`;
    }
    static getInstance() {
        if (!AnomalyDetectionService.instance) {
            AnomalyDetectionService.instance = new AnomalyDetectionService();
        }
        return AnomalyDetectionService.instance;
    }
    async evaluateMetric(metricName, currentValue, dimensions) {
        try {
            const rules = await this.getRulesForMetric(metricName);
            if (rules.length === 0) {
                return false;
            }
            let anomalyDetected = false;
            for (const rule of rules) {
                const baseline = await this.getMetricBaseline(metricName, rule.evaluationPeriod, dimensions);
                if (!baseline) {
                    continue;
                }
                const deviation = Math.abs((currentValue - baseline) / baseline * 100);
                if (deviation >= rule.anomalyThreshold) {
                    let conditionMet = false;
                    switch (rule.comparisonOperator) {
                        case 'GreaterThan':
                            conditionMet = currentValue > baseline;
                            break;
                        case 'LessThan':
                            conditionMet = currentValue < baseline;
                            break;
                        case 'GreaterThanOrEqualTo':
                            conditionMet = currentValue >= baseline;
                            break;
                        case 'LessThanOrEqualTo':
                            conditionMet = currentValue <= baseline;
                            break;
                    }
                    if (conditionMet) {
                        await this.createAnomalyEvent({
                            ruleId: rule.id,
                            metricName,
                            currentValue,
                            baselineValue: baseline,
                            deviation,
                            metadata: { dimensions }
                        });
                        await this.sendNotifications(rule, {
                            metricName,
                            currentValue,
                            baselineValue: baseline,
                            deviation,
                            dimensions
                        });
                        anomalyDetected = true;
                    }
                }
            }
            return anomalyDetected;
        }
        catch (error) {
            this.logger.error('Error evaluating metric for anomalies', {
                error,
                metricName,
                currentValue
            });
            return false;
        }
    }
    async getRulesForMetric(metricName) {
        try {
            const defaultRules = [
                {
                    id: 'rule1',
                    metricName: 'TokensUsed',
                    evaluationPeriod: '1d',
                    threshold: 0,
                    comparisonOperator: 'GreaterThan',
                    anomalyThreshold: 50,
                    severity: 3,
                    notificationChannels: ['email']
                },
                {
                    id: 'rule2',
                    metricName: 'HandoffsRequested',
                    evaluationPeriod: '1h',
                    threshold: 0,
                    comparisonOperator: 'GreaterThan',
                    anomalyThreshold: 100,
                    severity: 4,
                    notificationChannels: ['email', 'slack']
                },
                {
                    id: 'rule3',
                    metricName: 'APILatency',
                    evaluationPeriod: '15m',
                    threshold: 0,
                    comparisonOperator: 'GreaterThan',
                    anomalyThreshold: 50,
                    severity: 5,
                    notificationChannels: ['email', 'slack', 'sms']
                }
            ];
            return defaultRules.filter(rule => rule.metricName === metricName);
        }
        catch (error) {
            this.logger.error('Error getting anomaly rules', { error, metricName });
            return [];
        }
    }
    async getMetricBaseline(metricName, period, dimensions) {
        try {
            const endTime = new Date().toISOString();
            let startTime;
            switch (period) {
                case '15m':
                    startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
                    break;
                case '1h':
                    startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                    break;
                case '1d':
                    startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                    break;
                default:
                    startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            }
            const metrics = await this.metricsService.getMetricsHistory(metricName, startTime, endTime, dimensions);
            if (metrics.length < 3) {
                return null;
            }
            const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
            return sum / metrics.length;
        }
        catch (error) {
            this.logger.error('Error getting metric baseline', {
                error,
                metricName,
                period
            });
            return null;
        }
    }
    async createAnomalyEvent(params) {
        try {
            const timestamp = new Date().toISOString();
            const anomalyId = `anomaly-${params.metricName}-${timestamp}`;
            const anomalyEvent = {
                id: anomalyId,
                ruleId: params.ruleId,
                metricName: params.metricName,
                currentValue: params.currentValue,
                baselineValue: params.baselineValue,
                deviation: params.deviation,
                timestamp,
                status: 'Open',
                metadata: params.metadata
            };
            await this.dynamoDb.send(new lib_dynamodb_1.PutCommand({
                TableName: this.anomaliesTableName,
                Item: anomalyEvent
            }));
            await this.eventBridge.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [
                    {
                        Source: 'spectrum.anomaly',
                        DetailType: 'anomaly-detected',
                        Detail: JSON.stringify(anomalyEvent),
                        EventBusName: this.eventBusName
                    }
                ]
            }));
            this.logger.info('Anomaly event created', {
                anomalyId,
                metricName: params.metricName,
                deviation: params.deviation
            });
        }
        catch (error) {
            this.logger.error('Error creating anomaly event', {
                error,
                metricName: params.metricName
            });
        }
    }
    async sendNotifications(rule, anomalyData) {
        try {
            const message = this.formatNotificationMessage(rule, anomalyData);
            for (const channel of rule.notificationChannels) {
                switch (channel) {
                    case 'email':
                        await this.sendEmailNotification(rule.severity, message);
                        break;
                    case 'sms':
                        await this.sendSmsNotification(rule.severity, message);
                        break;
                    case 'slack':
                        await this.sendSlackNotification(rule.severity, message);
                        break;
                }
            }
        }
        catch (error) {
            this.logger.error('Error sending anomaly notifications', {
                error,
                ruleId: rule.id,
                metricName: anomalyData.metricName
            });
        }
    }
    formatNotificationMessage(rule, anomalyData) {
        const severityText = ['', 'Info', 'Low', 'Medium', 'High', 'Critical'][rule.severity] || 'Unknown';
        let dimensionsText = '';
        if (anomalyData.dimensions && Object.keys(anomalyData.dimensions).length > 0) {
            dimensionsText = '\nDimensions: ' +
                Object.entries(anomalyData.dimensions)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(', ');
        }
        return `[${severityText}] Anomaly Detected in ${anomalyData.metricName}
      
Current Value: ${anomalyData.currentValue}
Baseline Value: ${anomalyData.baselineValue.toFixed(2)}
Deviation: ${anomalyData.deviation.toFixed(2)}%${dimensionsText}

Time: ${new Date().toISOString()}
Environment: ${process.env.STAGE || 'dev'}
Service: ${process.env.SERVICE_NAME || 'spectrum'}`;
    }
    async sendEmailNotification(severity, message) {
        try {
            const topicArn = process.env[`SNS_TOPIC_SEV${severity}`] ||
                process.env.SNS_TOPIC_DEFAULT;
            if (!topicArn) {
                this.logger.warn('No SNS topic configured for email notifications');
                return;
            }
            await this.sns.send(new client_sns_1.PublishCommand({
                TopicArn: topicArn,
                Subject: `[${severity}] Anomaly Detected`,
                Message: message
            }));
            this.logger.info('Email notification sent', { severity });
        }
        catch (error) {
            this.logger.error('Error sending email notification', { error, severity });
        }
    }
    async sendSmsNotification(severity, message) {
        try {
            if (severity < 4) {
                return;
            }
            const phoneNumber = process.env.ALERT_PHONE_NUMBER;
            if (!phoneNumber) {
                this.logger.warn('No phone number configured for SMS notifications');
                return;
            }
            await this.sns.send(new client_sns_1.PublishCommand({
                PhoneNumber: phoneNumber,
                Message: message
            }));
            this.logger.info('SMS notification sent', { severity });
        }
        catch (error) {
            this.logger.error('Error sending SMS notification', { error, severity });
        }
    }
    async sendSlackNotification(severity, message) {
        this.logger.info('Slack notification would be sent here', { severity, message });
    }
}
exports.AnomalyDetectionService = AnomalyDetectionService;
//# sourceMappingURL=anomaly-detection.service.js.map