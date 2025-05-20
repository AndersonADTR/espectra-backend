"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('UsageReportHandler');
const usageReportHandler = async (event) => {
    try {
        const userId = event.pathParameters?.userId;
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'User ID is required' })
            };
        }
        const startDate = event.queryStringParameters?.startDate ||
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = event.queryStringParameters?.endDate ||
            new Date().toISOString().split('T')[0];
        const ddbClient = new client_dynamodb_1.DynamoDBClient({});
        const documentClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
        const tokenTableName = process.env.TOKEN_TABLE ||
            `${process.env.SERVICE_NAME}-${process.env.STAGE}-token-usage-table`;
        const tokenUsageResult = await documentClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: tokenTableName,
            KeyConditionExpression: 'userId = :userId AND #date BETWEEN :startDate AND :endDate',
            ExpressionAttributeNames: {
                '#date': 'date'
            },
            ExpressionAttributeValues: {
                ':userId': userId,
                ':startDate': startDate,
                ':endDate': endDate
            }
        }));
        const tokenUsage = tokenUsageResult.Items || [];
        const totalTokensUsed = tokenUsage.reduce((sum, item) => sum + (item.totalTokens || 0), 0);
        const dailyAverage = tokenUsage.length > 0 ? totalTokensUsed / tokenUsage.length : 0;
        const maxDailyUsage = tokenUsage.reduce((max, item) => Math.max(max, item.totalTokens || 0), 0);
        const currentPlan = tokenUsage.length > 0 ?
            tokenUsage[tokenUsage.length - 1].plan : 'unknown';
        const handoffTableName = process.env.HANDOFF_TABLE ||
            `${process.env.SERVICE_NAME}-${process.env.STAGE}-handoff-requests`;
        const handoffResult = await documentClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: handoffTableName,
            IndexName: 'UserIdCreatedAtIndex',
            KeyConditionExpression: 'userId = :userId AND createdAt BETWEEN :startDate AND :endDate',
            ExpressionAttributeValues: {
                ':userId': userId,
                ':startDate': startDate + 'T00:00:00.000Z',
                ':endDate': endDate + 'T23:59:59.999Z'
            }
        }));
        const handoffs = handoffResult.Items || [];
        const totalHandoffs = handoffs.length;
        const handoffsByStatus = handoffs.reduce((acc, item) => {
            const status = item.status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        const report = {
            userId,
            timeRange: {
                startDate,
                endDate
            },
            tokenUsage: {
                totalTokensUsed,
                dailyAverage,
                maxDailyUsage,
                currentPlan,
                dailyData: tokenUsage.map(item => ({
                    date: item.date,
                    totalTokens: item.totalTokens,
                    remainingTokens: item.remainingTokens,
                    limit: item.limit
                }))
            },
            handoffs: {
                totalHandoffs,
                byStatus: handoffsByStatus,
                details: handoffs.map(item => ({
                    handoffId: item.handoffId,
                    conversationId: item.conversationId,
                    status: item.status,
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    reason: item.reason
                }))
            }
        };
        logger.info('Usage report generated', { userId, startDate, endDate });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(report)
        };
    }
    catch (error) {
        logger.error('Error generating usage report', { error });
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Error generating usage report',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(usageReportHandler);
//# sourceMappingURL=usage-report.handler.js.map