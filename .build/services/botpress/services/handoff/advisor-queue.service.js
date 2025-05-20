"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvisorQueueService = exports.AdvisorStatus = exports.HandoffStatus = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const uuid_1 = require("uuid");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const config_1 = require("../../config/config");
var HandoffStatus;
(function (HandoffStatus) {
    HandoffStatus["PENDING"] = "PENDING";
    HandoffStatus["ASSIGNED"] = "ASSIGNED";
    HandoffStatus["IN_PROGRESS"] = "IN_PROGRESS";
    HandoffStatus["COMPLETED"] = "COMPLETED";
    HandoffStatus["CANCELLED"] = "CANCELLED";
    HandoffStatus["TIMEOUT"] = "TIMEOUT";
})(HandoffStatus || (exports.HandoffStatus = HandoffStatus = {}));
var AdvisorStatus;
(function (AdvisorStatus) {
    AdvisorStatus["AVAILABLE"] = "AVAILABLE";
    AdvisorStatus["BUSY"] = "BUSY";
    AdvisorStatus["AWAY"] = "AWAY";
    AdvisorStatus["OFFLINE"] = "OFFLINE";
})(AdvisorStatus || (exports.AdvisorStatus = AdvisorStatus = {}));
class AdvisorQueueService {
    static instance;
    dynamoDbClient;
    sqsClient;
    eventBridgeClient;
    logger;
    metrics;
    handoffTableName;
    advisorTableName;
    handoffQueueUrl;
    eventBusName;
    constructor() {
        const dbClient = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dbClient);
        this.sqsClient = new client_sqs_1.SQSClient({});
        this.eventBridgeClient = new client_eventbridge_1.EventBridgeClient({});
        this.logger = new logger_1.Logger('AdvisorQueueService');
        this.metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
        this.handoffTableName = process.env.HANDOFF_TABLE ||
            `${process.env.RESOURCE_PREFIX}-handoff-requests`;
        this.advisorTableName = process.env.ADVISOR_TABLE ||
            `${process.env.RESOURCE_PREFIX}-advisors`;
        this.handoffQueueUrl = process.env.HANDOFF_QUEUE_URL || '';
        this.eventBusName = process.env.EVENT_BUS_NAME ||
            `${process.env.RESOURCE_PREFIX}-event-bus`;
    }
    static getInstance() {
        if (!AdvisorQueueService.instance) {
            AdvisorQueueService.instance = new AdvisorQueueService();
        }
        return AdvisorQueueService.instance;
    }
    async createHandoffRequest(conversationId, userId, reason, priorityLevel = 1, metadata) {
        try {
            const timestamp = new Date().toISOString();
            const handoffId = (0, uuid_1.v4)();
            const handoffRequest = {
                handoffId,
                conversationId,
                userId,
                status: HandoffStatus.PENDING,
                reason,
                createdAt: timestamp,
                updatedAt: timestamp,
                priorityLevel,
                metadata
            };
            await this.dynamoDbClient.send(new lib_dynamodb_1.PutCommand({
                TableName: this.handoffTableName,
                Item: handoffRequest
            }));
            await this.sqsClient.send(new client_sqs_1.SendMessageCommand({
                QueueUrl: this.handoffQueueUrl,
                MessageBody: JSON.stringify(handoffRequest),
                MessageGroupId: conversationId,
                MessageDeduplicationId: handoffId
            }));
            await this.eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [
                    {
                        Source: 'spectrum.handoff',
                        DetailType: 'handoff-requested',
                        Detail: JSON.stringify(handoffRequest),
                        EventBusName: this.eventBusName
                    }
                ]
            }));
            this.metrics.incrementCounter('HandoffRequests');
            this.logger.info('Handoff request created', {
                handoffId,
                conversationId,
                userId
            });
            return handoffRequest;
        }
        catch (error) {
            this.logger.error('Error creating handoff request', {
                error,
                conversationId,
                userId
            });
            throw error;
        }
    }
    async getAdvisorInfo(advisorId) {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.advisorTableName,
                Key: { advisorId }
            }));
            return result.Item || null;
        }
        catch (error) {
            this.logger.error('Error getting advisor info', { error, advisorId });
            throw error;
        }
    }
    async getHandoffRequest(handoffId) {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.handoffTableName,
                Key: { handoffId }
            }));
            return result.Item || null;
        }
        catch (error) {
            this.logger.error('Error getting handoff request', { error, handoffId });
            throw error;
        }
    }
    async updateHandoffStatus(handoffId, status, advisorId) {
        try {
            const timestamp = new Date().toISOString();
            let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
            const expressionAttributeNames = { '#status': 'status' };
            const expressionAttributeValues = {
                ':status': status,
                ':updatedAt': timestamp
            };
            if (advisorId) {
                updateExpression += ', assignedAdvisorId = :advisorId';
                expressionAttributeValues[':advisorId'] = advisorId;
            }
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.handoffTableName,
                Key: { handoffId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            }));
            const updatedRequest = result.Attributes;
            await this.eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [
                    {
                        Source: 'spectrum.handoff',
                        DetailType: `handoff-${status.toLowerCase()}`,
                        Detail: JSON.stringify(updatedRequest),
                        EventBusName: this.eventBusName
                    }
                ]
            }));
            this.logger.info('Handoff status updated', {
                handoffId,
                status,
                advisorId
            });
            return updatedRequest;
        }
        catch (error) {
            this.logger.error('Error updating handoff status', {
                error,
                handoffId,
                status
            });
            throw error;
        }
    }
    async getPendingHandoffs(limit = 10) {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.handoffTableName,
                IndexName: 'StatusCreatedAtIndex',
                KeyConditionExpression: '#status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': HandoffStatus.PENDING },
                Limit: limit,
                ScanIndexForward: false
            }));
            const pendingHandoffs = (result.Items || [])
                .sort((a, b) => {
                if (a.priorityLevel !== b.priorityLevel) {
                    return b.priorityLevel - a.priorityLevel;
                }
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });
            return pendingHandoffs;
        }
        catch (error) {
            this.logger.error('Error getting pending handoffs', { error });
            throw error;
        }
    }
    async getAvailableAdvisors() {
        try {
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.advisorTableName,
                IndexName: 'StatusIndex',
                KeyConditionExpression: '#status = :status',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':status': AdvisorStatus.AVAILABLE }
            }));
            return result.Items || [];
        }
        catch (error) {
            this.logger.error('Error getting available advisors', { error });
            throw error;
        }
    }
    async updateAdvisorStatus(advisorId, status) {
        try {
            const timestamp = new Date().toISOString();
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.advisorTableName,
                Key: { advisorId },
                UpdateExpression: 'SET #status = :status, lastActivityAt = :lastActivityAt',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':lastActivityAt': timestamp
                },
                ReturnValues: 'ALL_NEW'
            }));
            const updatedAdvisor = result.Attributes;
            this.logger.info('Advisor status updated', {
                advisorId,
                status
            });
            return updatedAdvisor;
        }
        catch (error) {
            this.logger.error('Error updating advisor status', {
                error,
                advisorId,
                status
            });
            throw error;
        }
    }
    async assignNextHandoff() {
        try {
            const pendingHandoffs = await this.getPendingHandoffs(1);
            const availableAdvisors = await this.getAvailableAdvisors();
            if (pendingHandoffs.length === 0 || availableAdvisors.length === 0) {
                return null;
            }
            const handoff = pendingHandoffs[0];
            const advisor = availableAdvisors[0];
            const updatedHandoff = await this.updateHandoffStatus(handoff.handoffId, HandoffStatus.ASSIGNED, advisor.advisorId);
            const updatedAdvisor = await this.dynamoDbClient.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.advisorTableName,
                Key: { advisorId: advisor.advisorId },
                UpdateExpression: 'SET activeHandoffs = activeHandoffs + :inc, #status = :status, lastActivityAt = :lastActivityAt',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':inc': 1,
                    ':status': AdvisorStatus.BUSY,
                    ':lastActivityAt': new Date().toISOString()
                },
                ReturnValues: 'ALL_NEW'
            }));
            this.metrics.incrementCounter('HandoffsAssigned');
            this.logger.info('Handoff assigned', {
                handoffId: handoff.handoffId,
                advisorId: advisor.advisorId
            });
            return {
                handoff: updatedHandoff,
                advisor: updatedAdvisor.Attributes
            };
        }
        catch (error) {
            this.logger.error('Error assigning handoff', { error });
            throw error;
        }
    }
}
exports.AdvisorQueueService = AdvisorQueueService;
//# sourceMappingURL=advisor-queue.service.js.map