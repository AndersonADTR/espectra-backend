"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionModel = exports.SessionStatus = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("@shared/utils/logger");
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["ACTIVE"] = "ACTIVE";
    SessionStatus["EXPIRED"] = "EXPIRED";
    SessionStatus["TERMINATED"] = "TERMINATED";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
class SessionModel {
    dynamodb;
    logger;
    tableName;
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient({});
        this.dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
        this.logger = new logger_1.Logger('SessionModel');
        this.tableName = `${process.env.METRICS_TABLE}`;
    }
    async create(session) {
        try {
            await this.dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: {
                    ...session,
                    GSI1PK: `USER#${session.userId}`,
                    GSI1SK: session.createdAt,
                    GSI2PK: `STATUS#${session.status}`,
                    GSI2SK: session.lastActivity
                },
                ConditionExpression: 'attribute_not_exists(sessionId)'
            }));
            return session;
        }
        catch (error) {
            this.logger.error('Error creating session', { error, sessionId: session.sessionId });
            throw error;
        }
    }
    async get(sessionId) {
        try {
            const result = await this.dynamodb.send(new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: { sessionId }
            }));
            return result.Item || null;
        }
        catch (error) {
            this.logger.error('Error getting session', { error, sessionId });
            throw error;
        }
    }
    async update(sessionId, updates) {
        try {
            const updateExpressions = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            Object.entries(updates).forEach(([key, value]) => {
                updateExpressions.push(`#${key} = :${key}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:${key}`] = value;
            });
            const result = await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: this.tableName,
                Key: { sessionId },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            }));
            return result.Attributes;
        }
        catch (error) {
            this.logger.error('Error updating session', { error, sessionId });
            throw error;
        }
    }
    async queryByUser(userId, status) {
        try {
            const params = {
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :pk',
                ExpressionAttributeValues: {
                    ':pk': `USER#${userId}`
                }
            };
            if (status) {
                params.FilterExpression = 'status = :status';
                params.ExpressionAttributeValues[':status'] = status;
            }
            const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand(params));
            return result.Items;
        }
        catch (error) {
            this.logger.error('Error querying sessions by user', { error, userId });
            throw error;
        }
    }
}
exports.SessionModel = SessionModel;
//# sourceMappingURL=session.model.js.map