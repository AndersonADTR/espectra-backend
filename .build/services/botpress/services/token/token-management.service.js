"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenManagementService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const cache_service_1 = require("@shared/services/cache/cache.service");
const token_management_types_1 = require("../../types/token-management.types");
const business_metrics_service_1 = require("@services/metrics/business-metrics.service");
const anomaly_detection_service_1 = require("@services/metrics/anomaly-detection.service");
class TokenManagementService {
    static instance;
    dynamoDbClient;
    eventBridgeClient;
    cacheService;
    logger;
    metrics;
    tableName;
    usersTableName;
    eventBusName;
    tokenLimits;
    cacheKeyPrefix = 'token-usage:';
    cacheTtl = 300;
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, {
            marshallOptions: {
                removeUndefinedValues: true,
                convertEmptyValues: true
            }
        });
        this.eventBridgeClient = new client_eventbridge_1.EventBridgeClient({});
        this.cacheService = cache_service_1.CacheService.getInstance();
        this.logger = new logger_1.Logger('TokenManagementService');
        this.metrics = new metrics_1.MetricsService('TokenManagement');
        this.tableName = process.env.TOKEN_TABLE || `${process.env.RESOURCE_PREFIX}-token-usage-table`;
        this.usersTableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
        this.eventBusName = process.env.EVENT_BUS_NAME || `${process.env.RESOURCE_PREFIX}-event-bus`;
        this.tokenLimits = {
            [token_management_types_1.UserPlan.BASIC]: parseInt(process.env.TOKEN_LIMIT_BASIC || '1000'),
            [token_management_types_1.UserPlan.PRO]: parseInt(process.env.TOKEN_LIMIT_PRO || '2000'),
            [token_management_types_1.UserPlan.BUSINESS]: parseInt(process.env.TOKEN_LIMIT_BUSINESS || '4000'),
            [token_management_types_1.UserPlan.ENTERPRISE]: parseInt(process.env.TOKEN_LIMIT_ENTERPRISE || '8000')
        };
    }
    static getInstance() {
        if (!TokenManagementService.instance) {
            TokenManagementService.instance = new TokenManagementService();
        }
        return TokenManagementService.instance;
    }
    async getUserTokenUsage(userId) {
        const startTime = Date.now();
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;
        try {
            const cachedUsage = await this.cacheService.get(cacheKey);
            if (cachedUsage) {
                this.metrics.incrementCounter('TokenUsageCacheHit');
                this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
                return cachedUsage;
            }
            this.metrics.incrementCounter('TokenUsageCacheMiss');
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: {
                    userId,
                    date: today
                }
            }));
            if (result.Item) {
                const usage = result.Item;
                await this.cacheService.set(cacheKey, usage, { ttl: this.cacheTtl });
                this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
                return usage;
            }
            const userPlan = await this.getUserPlan(userId);
            const limit = this.tokenLimits[userPlan] || this.tokenLimits[token_management_types_1.UserPlan.BASIC];
            const newUsage = {
                userId,
                date: today,
                planType: userPlan,
                dailyLimit: limit,
                totalTokens: 0,
                remainingTokens: limit,
                lastUpdated: new Date().toISOString(),
                resetTimestamp: this.getNextResetTimestamp(),
                alertsSent: [],
                overageCount: 0,
                overageTokens: 0
            };
            await this.dynamoDbClient.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: newUsage
            }));
            await this.cacheService.set(cacheKey, newUsage, { ttl: this.cacheTtl });
            this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
            return newUsage;
        }
        catch (error) {
            this.logger.error('Error getting user token usage', { error, userId });
            this.metrics.incrementCounter('TokenUsageRetrievalErrors');
            this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
            throw error;
        }
    }
    async consumeTokens(userId, tokenCount) {
        const startTime = Date.now();
        if (tokenCount <= 0) {
            throw new Error('Token count must be positive');
        }
        try {
            const currentUsage = await this.getUserTokenUsage(userId);
            const hasRemainingTokens = currentUsage.remainingTokens >= tokenCount;
            const actualTokensToConsume = hasRemainingTokens ? tokenCount : currentUsage.remainingTokens;
            const updatedUsage = {
                ...currentUsage,
                totalTokens: currentUsage.totalTokens + actualTokensToConsume,
                remainingTokens: Math.max(0, currentUsage.remainingTokens - actualTokensToConsume),
                lastUpdated: new Date().toISOString()
            };
            const overage = !hasRemainingTokens;
            if (overage) {
                const overageTokens = tokenCount - actualTokensToConsume;
                updatedUsage.overageCount = (currentUsage.overageCount || 0) + 1;
                updatedUsage.overageTokens = (currentUsage.overageTokens || 0) + overageTokens;
                if (updatedUsage.metadata) {
                    updatedUsage.metadata.overageCost = this.calculateOverageCost(updatedUsage.overageTokens, updatedUsage.planType);
                }
                else {
                    updatedUsage.metadata = {
                        overageCost: this.calculateOverageCost(updatedUsage.overageTokens, updatedUsage.planType)
                    };
                }
            }
            await this.dynamoDbClient.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: updatedUsage
            }));
            const today = new Date().toISOString().split('T')[0];
            const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;
            await this.cacheService.set(cacheKey, updatedUsage, { ttl: this.cacheTtl });
            const usagePercentage = ((updatedUsage.dailyLimit - updatedUsage.remainingTokens) / updatedUsage.dailyLimit) * 100;
            const alertTriggered = await this.checkThresholds(updatedUsage, usagePercentage);
            this.metrics.incrementCounter('TokensConsumed', actualTokensToConsume);
            if (overage) {
                this.metrics.incrementCounter('TokenOverages');
            }
            this.metrics.recordLatency('TokenConsumptionLatency', Date.now() - startTime);
            const metricsService = business_metrics_service_1.BusinessMetricsService.getInstance();
            await metricsService.trackTokenUsage(userId, tokenCount, updatedUsage.planType, updatedUsage.metadata?.lastConversationId);
            if (tokenCount > 0) {
                const anomalyService = anomaly_detection_service_1.AnomalyDetectionService.getInstance();
                await anomalyService.evaluateMetric('TokensUsed', tokenCount, { userId, plan: updatedUsage.planType });
            }
            return {
                usage: updatedUsage,
                hasRemainingTokens,
                overage,
                alertTriggered,
                usagePercentage
            };
        }
        catch (error) {
            this.logger.error('Error consuming tokens', { error, userId, tokenCount });
            this.metrics.incrementCounter('TokenConsumptionErrors');
            this.metrics.recordLatency('TokenConsumptionLatency', Date.now() - startTime);
            throw error;
        }
    }
    async checkTokenAvailability(userId, requiredTokens) {
        try {
            const usage = await this.getUserTokenUsage(userId);
            const available = usage.remainingTokens >= requiredTokens;
            if (!available) {
                this.metrics.incrementCounter('InsufficientTokenChecks');
            }
            return available;
        }
        catch (error) {
            this.logger.error('Error checking token availability', { error, userId, requiredTokens });
            this.metrics.incrementCounter('TokenAvailabilityCheckErrors');
            throw error;
        }
    }
    async resetDailyTokens(userId) {
        const startTime = Date.now();
        const date = new Date().toISOString().split('T')[0];
        try {
            const userPlan = await this.getUserPlan(userId);
            const limit = this.tokenLimits[userPlan] || this.tokenLimits[token_management_types_1.UserPlan.BASIC];
            const newUsage = {
                userId,
                date: date,
                planType: userPlan,
                dailyLimit: limit,
                totalTokens: 0,
                remainingTokens: limit,
                lastUpdated: new Date().toISOString(),
                resetTimestamp: this.getNextResetTimestamp(),
                alertsSent: [],
                overageCount: 0,
                overageTokens: 0
            };
            await this.dynamoDbClient.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: newUsage
            }));
            const today = new Date().toISOString().split('T')[0];
            const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;
            await this.cacheService.set(cacheKey, newUsage, { ttl: this.cacheTtl });
            this.metrics.incrementCounter('TokensReset');
            this.metrics.recordLatency('TokenResetLatency', Date.now() - startTime);
            return newUsage;
        }
        catch (error) {
            this.logger.error('Error resetting daily tokens', { error, userId });
            this.metrics.incrementCounter('TokenResetErrors');
            this.metrics.recordLatency('TokenResetLatency', Date.now() - startTime);
            throw error;
        }
    }
    async getTokenUsageHistory(userId, startDate, endDate) {
        const startTime = Date.now();
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
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
            this.metrics.recordLatency('TokenHistoryRetrievalLatency', Date.now() - startTime);
            return (result.Items || []);
        }
        catch (error) {
            this.logger.error('Error getting token usage history', { error, userId, startDate, endDate });
            this.metrics.incrementCounter('TokenHistoryRetrievalErrors');
            this.metrics.recordLatency('TokenHistoryRetrievalLatency', Date.now() - startTime);
            throw error;
        }
    }
    async checkThresholds(usage, usagePercentage) {
        try {
            const thresholds = [
                { percentage: 80, type: 'APPROACHING_LIMIT' },
                { percentage: 90, type: 'NEAR_LIMIT' },
                { percentage: 100, type: 'LIMIT_REACHED' }
            ];
            const threshold = thresholds
                .filter(t => usagePercentage >= t.percentage)
                .sort((a, b) => b.percentage - a.percentage)[0];
            if (!threshold) {
                return false;
            }
            const alertId = `${threshold.type}_${usage.date}`;
            if (usage.alertsSent && usage.alertsSent.includes(alertId)) {
                return false;
            }
            const success = await this.sendTokenAlert(usage, usagePercentage, threshold.type);
            if (success) {
                const updatedAlertsSent = [...(usage.alertsSent || []), alertId];
                await this.dynamoDbClient.send(new lib_dynamodb_1.UpdateCommand({
                    TableName: this.tableName,
                    Key: {
                        userId: usage.userId,
                        date: usage.date
                    },
                    UpdateExpression: 'SET alertsSent = :alertsSent',
                    ExpressionAttributeValues: {
                        ':alertsSent': updatedAlertsSent
                    }
                }));
                const cacheKey = `${this.cacheKeyPrefix}${usage.userId}:${usage.date}`;
                await this.cacheService.get(cacheKey).then(cachedUsage => {
                    if (cachedUsage) {
                        cachedUsage.alertsSent = updatedAlertsSent;
                        this.cacheService.set(cacheKey, cachedUsage, { ttl: this.cacheTtl });
                    }
                });
                return true;
            }
            return false;
        }
        catch (error) {
            this.logger.error('Error checking token thresholds', { error, userId: usage.userId });
            this.metrics.incrementCounter('TokenThresholdCheckErrors');
            return false;
        }
    }
    async sendTokenAlert(usage, usagePercentage, alertType) {
        try {
            const event = {
                Source: 'spectrum.token-service',
                DetailType: 'token-usage-alert',
                Detail: JSON.stringify({
                    userId: usage.userId,
                    usagePercentage,
                    plan: usage.planType,
                    remainingTokens: usage.remainingTokens,
                    dailyLimit: usage.dailyLimit,
                    alertType,
                    timestamp: new Date().toISOString()
                }),
                EventBusName: this.eventBusName
            };
            await this.eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [event]
            }));
            this.logger.info('Token alert sent', {
                userId: usage.userId,
                usagePercentage,
                alertType
            });
            this.metrics.incrementCounter('TokenAlertsSent');
            return true;
        }
        catch (error) {
            this.logger.error('Error sending token alert', { error, userId: usage.userId });
            this.metrics.incrementCounter('TokenAlertErrors');
            return false;
        }
    }
    calculateOverageCost(overageTokens, planType) {
        const rates = {
            [token_management_types_1.UserPlan.BASIC]: 2.0,
            [token_management_types_1.UserPlan.PRO]: 1.8,
            [token_management_types_1.UserPlan.BUSINESS]: 1.5,
            [token_management_types_1.UserPlan.ENTERPRISE]: 1.0
        };
        const rate = rates[planType] || rates[token_management_types_1.UserPlan.BASIC];
        return (overageTokens / 1000) * rate;
    }
    getNextResetTimestamp() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow.toISOString();
    }
    async getUserPlan(userId) {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.usersTableName,
                Key: { userId }
            }));
            if (result.Item && result.Item.userType) {
                switch (result.Item.userType.toLowerCase()) {
                    case 'pro':
                        return token_management_types_1.UserPlan.PRO;
                    case 'business':
                        return token_management_types_1.UserPlan.BUSINESS;
                    case 'enterprise':
                        return token_management_types_1.UserPlan.ENTERPRISE;
                    default:
                        return token_management_types_1.UserPlan.BASIC;
                }
            }
            return token_management_types_1.UserPlan.BASIC;
        }
        catch (error) {
            this.logger.error('Error getting user plan', { error, userId });
            this.metrics.incrementCounter('UserPlanRetrievalErrors');
            return token_management_types_1.UserPlan.BASIC;
        }
    }
}
exports.TokenManagementService = TokenManagementService;
//# sourceMappingURL=token-management.service.js.map