"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const token_management_service_1 = require("../../services/token/token-management.service");
const handler = async (event) => {
    console.info('Starting daily token reset process', { event });
    const tokenService = token_management_service_1.TokenManagementService.getInstance();
    const client = new client_dynamodb_1.DynamoDBClient({});
    const ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
    const usersTable = process.env.USERS_TABLE ||
        `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`;
    try {
        const result = await ddbDocClient.send(new lib_dynamodb_1.ScanCommand({
            TableName: usersTable,
            FilterExpression: 'attribute_exists(status) AND status = :active',
            ExpressionAttributeValues: {
                ':active': 'active'
            }
        }));
        const users = result.Items || [];
        console.info(`Found ${users.length} active users for token reset`);
        const resetPromises = users.map(user => tokenService.resetDailyTokens(user.userId)
            .catch(error => {
            console.error('Error resetting tokens for user', {
                error,
                userId: user.userId
            });
            return null;
        }));
        const results = await Promise.all(resetPromises);
        const successCount = results.filter(result => result !== null).length;
        console.info('Daily token reset completed', {
            totalUsers: users.length,
            successCount,
            failureCount: users.length - successCount
        });
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Daily token reset completed',
                totalUsers: users.length,
                successCount,
                failureCount: users.length - successCount
            })
        };
    }
    catch (error) {
        console.error('Error in daily token reset process', { error });
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Error in daily token reset process',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=reset-daily-tokens.handler.js.map