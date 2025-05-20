"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsModel = void 0;
const logger_1 = require("@shared/utils/logger");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
class MetricsModel {
    dynamodb;
    logger;
    tableName;
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient({});
        this.dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
        this.logger = new logger_1.Logger('MetricsModel');
        this.tableName = `${process.env.RESOURCE_PREFIX}-metrics`;
    }
    async recordMetric(metric) {
        try {
            await this.dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: {
                    ...metric,
                    timestamp: new Date().toISOString(),
                    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60)
                }
            }));
        }
        catch (error) {
            this.logger.error('Error recording metric', { error, metric });
            throw error;
        }
    }
    async queryMetrics(filter) {
        try {
            const params = {
                TableName: this.tableName,
                IndexName: 'MetricTypeIndex',
                KeyConditionExpression: 'metricType = :type AND #ts BETWEEN :start AND :end',
                ExpressionAttributeNames: {
                    '#ts': 'timestamp'
                },
                ExpressionAttributeValues: {
                    ':type': filter.metricType,
                    ':start': filter.startTime,
                    ':end': filter.endTime
                }
            };
            const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand(params));
            return result.Items;
        }
        catch (error) {
            this.logger.error('Error querying metrics', { error, filter });
            throw error;
        }
    }
}
exports.MetricsModel = MetricsModel;
//# sourceMappingURL=metrics.model.js.map