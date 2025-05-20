"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessMetricsService = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const logger_1 = require("@shared/utils/logger");
class BusinessMetricsService {
    static instance;
    cloudWatch;
    dynamoDB;
    logger;
    namespace;
    tableName;
    defaultDimensions;
    constructor() {
        this.cloudWatch = new client_cloudwatch_1.CloudWatchClient({});
        const ddbClient = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDB = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
        this.logger = new logger_1.Logger('BusinessMetricsService');
        this.namespace = process.env.METRICS_NAMESPACE ||
            `${process.env.SERVICE_NAME}/${process.env.STAGE}`;
        this.tableName = process.env.METRICS_TABLE ||
            `${process.env.RESOURCE_PREFIX}-metrics`;
        this.defaultDimensions = {
            Service: process.env.SERVICE_NAME || 'spectrum',
            Stage: process.env.STAGE || 'dev',
            Component: 'Concierge'
        };
    }
    static getInstance() {
        if (!BusinessMetricsService.instance) {
            BusinessMetricsService.instance = new BusinessMetricsService();
        }
        return BusinessMetricsService.instance;
    }
    async trackMetric(metric) {
        try {
            await this.publishToCloudWatch(metric);
            await this.saveToDatabase(metric);
        }
        catch (error) {
            this.logger.error('Error tracking business metric', {
                error,
                metric
            });
        }
    }
    async incrementCounter(metricName, count = 1, dimensions) {
        await this.trackMetric({
            metricName,
            value: count,
            unit: 'Count',
            dimensions
        });
    }
    async recordDuration(metricName, milliseconds, dimensions) {
        await this.trackMetric({
            metricName,
            value: milliseconds,
            unit: 'Milliseconds',
            dimensions
        });
    }
    async trackTokenUsage(userId, tokens, plan, conversationId) {
        await this.trackMetric({
            metricName: 'TokensUsed',
            value: tokens,
            unit: 'Count',
            dimensions: {
                UserId: userId,
                Plan: plan,
                ...(conversationId && { ConversationId: conversationId })
            }
        });
    }
    async trackHandoffMetric(metricName, value = 1, metadata = {}) {
        await this.trackMetric({
            metricName,
            value,
            unit: 'Count',
            dimensions: {
                Category: 'Handoff',
                ...metadata
            }
        });
    }
    async publishToCloudWatch(metric) {
        try {
            const dimensions = Object.entries({
                ...this.defaultDimensions,
                ...metric.dimensions
            }).map(([Name, Value]) => ({ Name, Value }));
            const command = new client_cloudwatch_1.PutMetricDataCommand({
                Namespace: this.namespace,
                MetricData: [
                    {
                        MetricName: metric.metricName,
                        Value: metric.value,
                        Unit: metric.unit || client_cloudwatch_1.StandardUnit.None,
                        Dimensions: dimensions,
                        Timestamp: metric.timestamp || new Date()
                    }
                ]
            });
            await this.cloudWatch.send(command);
        }
        catch (error) {
            this.logger.error('Error publishing metric to CloudWatch', {
                error,
                metric
            });
        }
    }
    async saveToDatabase(metric) {
        try {
            const timestamp = (metric.timestamp || new Date()).toISOString();
            const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
            const record = {
                id: (0, uuid_1.v4)(),
                metricName: metric.metricName,
                value: metric.value,
                unit: metric.unit || 'None',
                timestamp,
                dimensions: metric.dimensions,
                ttl
            };
            await this.dynamoDB.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: record
            }));
        }
        catch (error) {
            this.logger.error('Error saving metric to database', {
                error,
                metric
            });
        }
    }
    async getMetricsHistory(metricName, startTime, endTime, dimensions) {
        try {
            const queryParams = {
                TableName: this.tableName,
                IndexName: 'MetricNameTimestampIndex',
                KeyConditionExpression: 'metricName = :metricName AND timestamp BETWEEN :startTime AND :endTime',
                ExpressionAttributeValues: {
                    ':metricName': metricName,
                    ':startTime': startTime,
                    ':endTime': endTime
                }
            };
            if (dimensions && Object.keys(dimensions).length > 0) {
                const filterExpressions = [];
                const expressionValues = { ...queryParams.ExpressionAttributeValues };
                Object.entries(dimensions).forEach(([key, value], index) => {
                    const dimKey = `:dim${index}`;
                    filterExpressions.push(`dimensions.${key} = ${dimKey}`);
                    expressionValues[dimKey] = value;
                });
                queryParams.FilterExpression = filterExpressions.join(' AND ');
                queryParams.ExpressionAttributeValues = expressionValues;
            }
            const result = await this.dynamoDB.send(new lib_dynamodb_1.QueryCommand(queryParams));
            return result.Items || [];
        }
        catch (error) {
            this.logger.error('Error retrieving metrics history', {
                error,
                metricName,
                startTime,
                endTime,
                dimensions
            });
            throw error;
        }
    }
}
exports.BusinessMetricsService = BusinessMetricsService;
//# sourceMappingURL=business-metrics.service.js.map