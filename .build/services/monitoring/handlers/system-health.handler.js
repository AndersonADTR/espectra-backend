"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_sns_1 = require("@aws-sdk/client-sns");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("@shared/utils/logger");
const handler = async () => {
    const logger = new logger_1.Logger('SystemHealthHandler');
    logger.info('Starting system health check');
    const cloudWatch = new client_cloudwatch_1.CloudWatchClient({});
    const eventBridge = new client_eventbridge_1.EventBridgeClient({});
    const sns = new client_sns_1.SNSClient({});
    const dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
    try {
        const healthChecks = await Promise.all([
            checkApiGatewayHealth(cloudWatch),
            checkLambdaHealth(cloudWatch),
            checkDynamoDBHealth(cloudWatch),
            checkWebSocketHealth(cloudWatch, dynamoDbClient),
            checkBotpressIntegrationHealth(cloudWatch, dynamoDbClient)
        ]);
        const systemStatus = determineSystemStatus(healthChecks);
        await saveHealthCheckResults(dynamoDbClient, healthChecks);
        if (systemStatus !== 'HEALTHY') {
            await sendAlerts(sns, eventBridge, systemStatus, healthChecks);
        }
        logger.info('System health check completed', {
            status: systemStatus,
            componentsChecked: healthChecks.length
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                status: systemStatus,
                components: healthChecks
            })
        };
    }
    catch (error) {
        logger.error('Error performing system health check', { error });
        try {
            await sns.send(new client_sns_1.PublishCommand({
                TopicArn: process.env.CRITICAL_ALERTS_TOPIC_ARN,
                Subject: `[CRITICAL] System Health Check Failed`,
                Message: `System health check failed at ${new Date().toISOString()}: ${error instanceof Error ? error.message : 'Unknown error'}`
            }));
        }
        catch (snsError) {
            logger.error('Failed to send critical alert', { error: snsError });
        }
        throw error;
    }
};
exports.handler = handler;
async function checkApiGatewayHealth(cloudWatch) {
    const metrics = [
        { name: 'Count', id: 'requests' },
        { name: '4XXError', id: 'errors4xx' },
        { name: '5XXError', id: 'errors5xx' },
        { name: 'Latency', id: 'latency' }
    ];
    const metricDataQueries = metrics.map((metric, index) => ({
        Id: `m${index}`,
        MetricStat: {
            Metric: {
                Namespace: 'AWS/ApiGateway',
                MetricName: metric.name,
                Dimensions: [
                    {
                        Name: 'ApiName',
                        Value: process.env.API_GATEWAY_NAME || 'spectrum-api'
                    }
                ]
            },
            Period: 300,
            Stat: metric.name === 'Latency' ? 'Average' : 'Sum'
        }
    }));
    const result = await cloudWatch.send(new client_cloudwatch_1.GetMetricDataCommand({
        StartTime: new Date(Date.now() - 15 * 60 * 1000),
        EndTime: new Date(),
        MetricDataQueries: metricDataQueries
    }));
    const metricValues = {};
    result.MetricDataResults?.forEach((metricData, index) => {
        const metricName = metrics[index].id;
        const lastValue = metricData.Values?.length ?
            metricData.Values[metricData.Values.length - 1] : 0;
        metricValues[metricName] = lastValue || 0;
    });
    let status = 'HEALTHY';
    if (metricValues.errors5xx > 0) {
        status = 'UNHEALTHY';
    }
    else if (metricValues.errors4xx / (metricValues.requests || 1) > 0.1) {
        status = 'DEGRADED';
    }
    else if (metricValues.latency > 1000) {
    }
    else if (metricValues.latency > 1000) {
        status = 'DEGRADED';
    }
    return {
        service: 'ApiGateway',
        status,
        metrics: metricValues,
        timestamp: new Date().toISOString()
    };
}
async function checkLambdaHealth(cloudWatch) {
    const metrics = [
        { name: 'Invocations', id: 'invocations' },
        { name: 'Errors', id: 'errors' },
        { name: 'Throttles', id: 'throttles' },
        { name: 'Duration', id: 'duration' }
    ];
    const metricDataQueries = metrics.map((metric, index) => ({
        Id: `m${index}`,
        MetricStat: {
            Metric: {
                Namespace: 'AWS/Lambda',
                MetricName: metric.name,
                Dimensions: [
                    {
                        Name: 'FunctionName',
                        Value: '*'
                    }
                ]
            },
            Period: 300,
            Stat: metric.name === 'Duration' ? 'Average' : 'Sum'
        }
    }));
    const result = await cloudWatch.send(new client_cloudwatch_1.GetMetricDataCommand({
        StartTime: new Date(Date.now() - 15 * 60 * 1000),
        EndTime: new Date(),
        MetricDataQueries: metricDataQueries
    }));
    const metricValues = {};
    result.MetricDataResults?.forEach((metricData, index) => {
        const metricName = metrics[index].id;
        const lastValue = metricData.Values?.length ?
            metricData.Values[metricData.Values.length - 1] : 0;
        metricValues[metricName] = lastValue || 0;
    });
    let status = 'HEALTHY';
    if (metricValues.errors / (metricValues.invocations || 1) > 0.1) {
        status = 'UNHEALTHY';
    }
    else if (metricValues.throttles > 0) {
        status = 'DEGRADED';
    }
    else if (metricValues.duration > 5000) {
        status = 'DEGRADED';
    }
    return {
        service: 'Lambda',
        status,
        metrics: metricValues,
        timestamp: new Date().toISOString()
    };
}
async function checkDynamoDBHealth(cloudWatch) {
    const metrics = [
        { name: 'SuccessfulRequestLatency', id: 'latency' },
        { name: 'ThrottledRequests', id: 'throttles' },
        { name: 'SystemErrors', id: 'systemErrors' },
        { name: 'UserErrors', id: 'userErrors' },
        { name: 'ConsumedReadCapacityUnits', id: 'readCapacity' },
        { name: 'ConsumedWriteCapacityUnits', id: 'writeCapacity' }
    ];
    const metricDataQueries = metrics.map((metric, index) => ({
        Id: `m${index}`,
        MetricStat: {
            Metric: {
                Namespace: 'AWS/DynamoDB',
                MetricName: metric.name,
                Dimensions: []
            },
            Period: 300,
            Stat: metric.name === 'SuccessfulRequestLatency' ? 'Average' : 'Sum'
        }
    }));
    const result = await cloudWatch.send(new client_cloudwatch_1.GetMetricDataCommand({
        StartTime: new Date(Date.now() - 15 * 60 * 1000),
        EndTime: new Date(),
        MetricDataQueries: metricDataQueries
    }));
    const metricValues = {};
    result.MetricDataResults?.forEach((metricData, index) => {
        const metricName = metrics[index].id;
        const lastValue = metricData.Values?.length ?
            metricData.Values[metricData.Values.length - 1] : 0;
        metricValues[metricName] = lastValue || 0;
    });
    let status = 'HEALTHY';
    if (metricValues.systemErrors > 0) {
        status = 'UNHEALTHY';
    }
    else if (metricValues.throttles > 0) {
        status = 'DEGRADED';
    }
    else if (metricValues.latency > 100) {
        status = 'DEGRADED';
    }
    return {
        service: 'DynamoDB',
        status,
        metrics: metricValues,
        timestamp: new Date().toISOString()
    };
}
async function checkWebSocketHealth(cloudWatch, dynamoDb) {
    const connectionsTableName = process.env.CONNECTIONS_TABLE ||
        `${process.env.RESOURCE_PREFIX}-websocket-connections`;
    const activeConnectionsResult = await dynamoDb.send(new lib_dynamodb_1.ScanCommand({
        TableName: connectionsTableName,
        Select: 'COUNT'
    }));
    const activeConnections = activeConnectionsResult.Count || 0;
    const metrics = [
        { name: 'ConnectCount', id: 'connects' },
        { name: 'MessageCount', id: 'messages' },
        { name: 'ClientError', id: 'clientErrors' },
        { name: 'ExecutionError', id: 'executionErrors' },
        { name: 'IntegrationLatency', id: 'latency' }
    ];
    const metricDataQueries = metrics.map((metric, index) => ({
        Id: `m${index}`,
        MetricStat: {
            Metric: {
                Namespace: 'AWS/ApiGateway',
                MetricName: metric.name,
                Dimensions: [
                    {
                        Name: 'ApiId',
                        Value: process.env.WEBSOCKET_API_ID || 'spectrum-ws'
                    }
                ]
            },
            Period: 300,
            Stat: metric.name === 'IntegrationLatency' ? 'Average' : 'Sum'
        }
    }));
    const result = await cloudWatch.send(new client_cloudwatch_1.GetMetricDataCommand({
        StartTime: new Date(Date.now() - 15 * 60 * 1000),
        EndTime: new Date(),
        MetricDataQueries: metricDataQueries
    }));
    const metricValues = {
        activeConnections
    };
    result.MetricDataResults?.forEach((metricData, index) => {
        const metricName = metrics[index].id;
        const lastValue = metricData.Values?.length ?
            metricData.Values[metricData.Values.length - 1] : 0;
        metricValues[metricName] = lastValue || 0;
    });
    let status = 'HEALTHY';
    if (metricValues.executionErrors > 0) {
        status = 'UNHEALTHY';
    }
    else if (metricValues.clientErrors / (metricValues.messages || 1) > 0.1) {
        status = 'DEGRADED';
    }
    else if (metricValues.latency > 300) {
        status = 'DEGRADED';
    }
    return {
        service: 'WebSocket',
        status,
        metrics: metricValues,
        timestamp: new Date().toISOString()
    };
}
async function checkBotpressIntegrationHealth(cloudWatch, dynamoDb) {
    const metricDataQueries = [
        {
            Id: 'm1',
            MetricStat: {
                Metric: {
                    Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
                    MetricName: 'BotpressRequestSuccess',
                    Dimensions: []
                },
                Period: 300,
                Stat: 'Sum'
            }
        },
        {
            Id: 'm2',
            MetricStat: {
                Metric: {
                    Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
                    MetricName: 'BotpressRequestFailure',
                    Dimensions: []
                },
                Period: 300,
                Stat: 'Sum'
            }
        },
        {
            Id: 'm3',
            MetricStat: {
                Metric: {
                    Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
                    MetricName: 'BotpressResponseLatency',
                    Dimensions: []
                },
                Period: 300,
                Stat: 'Average'
            }
        },
        {
            Id: 'm4',
            MetricStat: {
                Metric: {
                    Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
                    MetricName: 'WebhookProcessingSuccess',
                    Dimensions: []
                },
                Period: 300,
                Stat: 'Sum'
            }
        },
        {
            Id: 'm5',
            MetricStat: {
                Metric: {
                    Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
                    MetricName: 'WebhookProcessingFailure',
                    Dimensions: []
                },
                Period: 300,
                Stat: 'Sum'
            }
        }
    ];
    const result = await cloudWatch.send(new client_cloudwatch_1.GetMetricDataCommand({
        StartTime: new Date(Date.now() - 15 * 60 * 1000),
        EndTime: new Date(),
        MetricDataQueries: metricDataQueries
    }));
    const metricValues = {
        requestSuccess: 0,
        requestFailure: 0,
        responseLatency: 0,
        webhookSuccess: 0,
        webhookFailure: 0
    };
    const metricNames = [
        'requestSuccess',
        'requestFailure',
        'responseLatency',
        'webhookSuccess',
        'webhookFailure'
    ];
    result.MetricDataResults?.forEach((metricData, index) => {
        const metricName = metricNames[index];
        const lastValue = metricData.Values?.length ?
            metricData.Values[metricData.Values.length - 1] : 0;
        metricValues[metricName] = lastValue || 0;
    });
    const totalRequests = metricValues.requestSuccess + metricValues.requestFailure;
    const errorRate = totalRequests > 0 ?
        metricValues.requestFailure / totalRequests : 0;
    let status = 'HEALTHY';
    if (errorRate > 0.1) {
        status = 'UNHEALTHY';
    }
    else if (metricValues.responseLatency > 2000) {
        status = 'DEGRADED';
    }
    else if (metricValues.webhookFailure > 0) {
        status = 'DEGRADED';
    }
    return {
        service: 'BotpressIntegration',
        status,
        metrics: {
            ...metricValues,
            errorRate,
            totalRequests
        },
        timestamp: new Date().toISOString()
    };
}
function determineSystemStatus(healthChecks) {
    if (healthChecks.some(check => check.status === 'UNHEALTHY')) {
        return 'UNHEALTHY';
    }
    if (healthChecks.some(check => check.status === 'DEGRADED')) {
        return 'DEGRADED';
    }
    return 'HEALTHY';
}
async function saveHealthCheckResults(dynamoDb, healthChecks) {
    const healthHistoryTable = process.env.HEALTH_HISTORY_TABLE ||
        `${process.env.RESOURCE_PREFIX}-health-history`;
    const timestamp = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
    const item = {
        id: `health-${timestamp}`,
        timestamp,
        results: healthChecks,
        overallStatus: determineSystemStatus(healthChecks),
        ttl
    };
    await dynamoDb.send(new lib_dynamodb_1.PutCommand({
        TableName: healthHistoryTable,
        Item: item
    }));
}
async function sendAlerts(sns, eventBridge, systemStatus, healthChecks) {
    const problematicComponents = healthChecks.filter(check => check.status !== 'HEALTHY');
    const subject = `[${systemStatus}] System Health Alert`;
    let message = `System health status: ${systemStatus} at ${new Date().toISOString()}\n\n`;
    message += 'Components with issues:\n\n';
    problematicComponents.forEach(component => {
        message += `* ${component.service}: ${component.status}\n`;
        message += `  Metrics: ${JSON.stringify(component.metrics, null, 2)}\n\n`;
    });
    const topicArn = systemStatus === 'UNHEALTHY'
        ? process.env.CRITICAL_ALERTS_TOPIC_ARN
        : process.env.WARNING_ALERTS_TOPIC_ARN;
    if (topicArn) {
        await sns.send(new client_sns_1.PublishCommand({
            TopicArn: topicArn,
            Subject: subject,
            Message: message
        }));
    }
    await eventBridge.send(new client_eventbridge_1.PutEventsCommand({
        Entries: [
            {
                Source: 'spectrum.system-health',
                DetailType: `system-health-${systemStatus.toLowerCase()}`,
                Detail: JSON.stringify({
                    status: systemStatus,
                    timestamp: new Date().toISOString(),
                    components: problematicComponents
                }),
                EventBusName: process.env.EVENT_BUS_NAME ||
                    `${process.env.RESOURCE_PREFIX}-event-bus`
            }
        ]
    }));
}
//# sourceMappingURL=system-health.handler.js.map