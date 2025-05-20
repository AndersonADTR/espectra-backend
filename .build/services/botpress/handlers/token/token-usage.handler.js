"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const token_management_service_1 = require("../../services/token/token-management.service");
const handler = async (event) => {
    console.info('Processing token usage request', {
        path: event.path,
        method: event.httpMethod
    });
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) {
        console.error('No user ID found in request');
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }
    const tokenService = token_management_service_1.TokenManagementService.getInstance();
    try {
        const tokenUsage = await tokenService.getUserTokenUsage(userId);
        const usagePercentage = ((tokenUsage.dailyLimit - tokenUsage.remainingTokens) / tokenUsage.dailyLimit) * 100;
        const response = {
            userId: tokenUsage.userId,
            plan: tokenUsage.planType,
            dailyLimit: tokenUsage.dailyLimit,
            tokensUsed: tokenUsage.totalTokens,
            tokensRemaining: tokenUsage.remainingTokens,
            usagePercentage: parseFloat(usagePercentage.toFixed(1)),
            date: tokenUsage.date
        };
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
        };
    }
    catch (error) {
        console.error('Error getting token usage', { error, userId });
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Error retrieving token usage',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=token-usage.handler.js.map