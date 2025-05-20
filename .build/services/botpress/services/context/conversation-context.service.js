"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationContextService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const cache_service_1 = require("@shared/services/cache/cache.service");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const conversation_context_types_1 = require("../../types/conversation-context.types");
class ConversationContextService {
    static instance;
    dynamoDbClient;
    cacheService;
    logger;
    metrics;
    tableName;
    cacheKeyPrefix = 'conversation:';
    defaultTtl = 30 * 24 * 60 * 60;
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, {
            marshallOptions: {
                removeUndefinedValues: true,
                convertEmptyValues: true
            }
        });
        this.cacheService = cache_service_1.CacheService.getInstance();
        this.logger = new logger_1.Logger('ConversationContextService');
        this.metrics = new metrics_1.MetricsService('ConversationContext');
        this.tableName = process.env.CONTEXT_TABLE || `${process.env.RESOURCE_PREFIX}-conversation-context-table`;
    }
    static getInstance() {
        if (!ConversationContextService.instance) {
            ConversationContextService.instance = new ConversationContextService();
        }
        return ConversationContextService.instance;
    }
    async getContext(conversationId) {
        const startTime = Date.now();
        try {
            const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
            const cachedContext = await this.cacheService.get(cacheKey);
            if (cachedContext) {
                this.logger.debug('Context retrieved from cache', { conversationId });
                this.metrics.incrementCounter('CacheHit');
                this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
                return cachedContext;
            }
            this.metrics.incrementCounter('CacheMiss');
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: { conversationId }
            }));
            if (!result.Item) {
                this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
                return null;
            }
            const context = result.Item;
            await this.cacheService.set(cacheKey, context, { ttl: 900 });
            this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
            return context;
        }
        catch (error) {
            this.logger.error('Error retrieving conversation context', { error, conversationId });
            this.metrics.incrementCounter('ContextRetrievalErrors');
            this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
            throw error;
        }
    }
    async saveContext(context) {
        const startTime = Date.now();
        try {
            const timestamp = Date.now();
            const contextToSave = {
                ...context,
                createdAt: context.createdAt || timestamp,
                updatedAt: timestamp,
                lastActivity: timestamp,
                status: context.status || conversation_context_types_1.ConversationStatus.ACTIVE,
                type: context.type || conversation_context_types_1.ConversationType.BOT,
                ttl: Math.floor(timestamp / 1000) + this.defaultTtl
            };
            await this.dynamoDbClient.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: contextToSave
            }));
            const cacheKey = `${this.cacheKeyPrefix}${context.conversationId}`;
            await this.cacheService.set(cacheKey, contextToSave, { ttl: 900 });
            this.metrics.incrementCounter('ContextSaved');
            this.metrics.recordLatency('ContextSaveLatency', Date.now() - startTime);
            return contextToSave;
        }
        catch (error) {
            this.logger.error('Error saving conversation context', { error, conversationId: context.conversationId });
            this.metrics.incrementCounter('ContextSaveErrors');
            this.metrics.recordLatency('ContextSaveLatency', Date.now() - startTime);
            throw error;
        }
    }
    async updateContext(conversationId, updates) {
        const startTime = Date.now();
        try {
            const timestamp = Date.now();
            const { conversationId: id, createdAt, ttl, updatedAt, lastActivity, ...validUpdates } = updates;
            const updateExpressionParts = ['#updatedAt = :updatedAt, #lastActivity = :lastActivity'];
            const expressionAttributeValues = {
                ':updatedAt': timestamp,
                ':lastActivity': timestamp
            };
            const expressionAttributeNames = {
                '#updatedAt': 'updatedAt',
                '#lastActivity': 'lastActivity'
            };
            Object.entries(validUpdates).forEach(([key, value]) => {
                if (value !== undefined) {
                    updateExpressionParts.push(`#${key} = :${key}`);
                    expressionAttributeValues[`:${key}`] = value;
                    expressionAttributeNames[`#${key}`] = key;
                }
            });
            const updateExpression = `set ${updateExpressionParts.join(', ')}`;
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: { conversationId },
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW'
            }));
            if (!result.Attributes) {
                throw new Error(`Failed to update conversation context: ${conversationId}`);
            }
            const updatedContext = result.Attributes;
            const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
            await this.cacheService.set(cacheKey, updatedContext, { ttl: 900 });
            this.metrics.incrementCounter('ContextUpdated');
            this.metrics.recordLatency('ContextUpdateLatency', Date.now() - startTime);
            return updatedContext;
        }
        catch (error) {
            this.logger.error('Error updating conversation context', { error, conversationId });
            this.metrics.incrementCounter('ContextUpdateErrors');
            this.metrics.recordLatency('ContextUpdateLatency', Date.now() - startTime);
            throw error;
        }
    }
    async deleteContext(conversationId) {
        const startTime = Date.now();
        try {
            await this.dynamoDbClient.send(new lib_dynamodb_1.DeleteCommand({
                TableName: this.tableName,
                Key: { conversationId }
            }));
            const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
            await this.cacheService.delete(cacheKey);
            this.metrics.incrementCounter('ContextDeleted');
            this.metrics.recordLatency('ContextDeleteLatency', Date.now() - startTime);
            return true;
        }
        catch (error) {
            this.logger.error('Error deleting conversation context', { error, conversationId });
            this.metrics.incrementCounter('ContextDeleteErrors');
            this.metrics.recordLatency('ContextDeleteLatency', Date.now() - startTime);
            throw error;
        }
    }
    async listUserContexts(userId) {
        const startTime = Date.now();
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'UserIdIndex',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                }
            }));
            this.metrics.recordLatency('ContextListLatency', Date.now() - startTime);
            return (result.Items || []);
        }
        catch (error) {
            this.logger.error('Error listing user conversation contexts', { error, userId });
            this.metrics.incrementCounter('ContextListErrors');
            this.metrics.recordLatency('ContextListLatency', Date.now() - startTime);
            throw error;
        }
    }
    async searchConversations(criteria) {
        const startTime = Date.now();
        try {
            let filterExpressions = [];
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};
            let indexName;
            let keyConditionExpression;
            if (criteria.userId) {
                indexName = 'UserIdIndex';
                keyConditionExpression = 'userId = :userId';
                expressionAttributeValues[':userId'] = criteria.userId;
            }
            else {
                throw new Error('At least one key condition is required');
            }
            if (criteria.status) {
                if (Array.isArray(criteria.status)) {
                    const statusFilters = criteria.status.map((s, i) => `:status${i}`);
                    filterExpressions.push(`#status IN (${statusFilters.join(', ')})`);
                    expressionAttributeNames['#status'] = 'status';
                    criteria.status.forEach((s, i) => {
                        expressionAttributeValues[`:status${i}`] = s;
                    });
                }
                else {
                    filterExpressions.push('#status = :status');
                    expressionAttributeNames['#status'] = 'status';
                    expressionAttributeValues[':status'] = criteria.status;
                }
            }
            if (criteria.type) {
                if (Array.isArray(criteria.type)) {
                    const typeFilters = criteria.type.map((t, i) => `:type${i}`);
                    filterExpressions.push(`#type IN (${typeFilters.join(', ')})`);
                    expressionAttributeNames['#type'] = 'type';
                    criteria.type.forEach((t, i) => {
                        expressionAttributeValues[`:type${i}`] = t;
                    });
                }
                else {
                    filterExpressions.push('#type = :type');
                    expressionAttributeNames['#type'] = 'type';
                    expressionAttributeValues[':type'] = criteria.type;
                }
            }
            if (criteria.startDate && criteria.endDate) {
                filterExpressions.push('createdAt BETWEEN :startDate AND :endDate');
                expressionAttributeValues[':startDate'] = criteria.startDate;
                expressionAttributeValues[':endDate'] = criteria.endDate;
            }
            else if (criteria.startDate) {
                filterExpressions.push('createdAt >= :startDate');
                expressionAttributeValues[':startDate'] = criteria.startDate;
            }
            else if (criteria.endDate) {
                filterExpressions.push('createdAt <= :endDate');
                expressionAttributeValues[':endDate'] = criteria.endDate;
            }
            const queryParams = {
                TableName: this.tableName,
                IndexName: indexName,
                KeyConditionExpression: keyConditionExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                Limit: criteria.limit || 20
            };
            if (filterExpressions.length > 0) {
                queryParams.FilterExpression = filterExpressions.join(' AND ');
                queryParams.ExpressionAttributeNames = expressionAttributeNames;
            }
            if (criteria.lastEvaluatedKey) {
                queryParams.ExclusiveStartKey = criteria.lastEvaluatedKey;
            }
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand(queryParams));
            this.metrics.recordLatency('ContextSearchLatency', Date.now() - startTime);
            return {
                items: (result.Items || []),
                lastEvaluatedKey: result.LastEvaluatedKey
            };
        }
        catch (error) {
            this.logger.error('Error searching conversations', { error, criteria });
            this.metrics.incrementCounter('ContextSearchErrors');
            this.metrics.recordLatency('ContextSearchLatency', Date.now() - startTime);
            throw error;
        }
    }
    async updateStatus(conversationId, status) {
        return this.updateContext(conversationId, { status });
    }
    async updateHandoffContext(conversationId, handoffContext) {
        return this.updateContext(conversationId, { handoffContext });
    }
    async addMessage(conversationId, message) {
        const context = await this.getContext(conversationId);
        if (!context) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }
        const newMessage = {
            ...message,
            timestamp: message.timestamp || Date.now()
        };
        const messages = [...context.messages, newMessage];
        return this.updateContext(conversationId, {
            messages,
            lastActivity: newMessage.timestamp
        });
    }
}
exports.ConversationContextService = ConversationContextService;
//# sourceMappingURL=conversation-context.service.js.map