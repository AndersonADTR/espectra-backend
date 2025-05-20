"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = exports.SessionStatus = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const cache_service_1 = require("@shared/services/cache/cache.service");
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const cache_decorator_1 = require("@shared/services/cache/cache.decorator");
const metrics_1 = require("@shared/utils/metrics");
const observability_service_1 = require("@shared/services/observability/observability.service");
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["ACTIVE"] = "ACTIVE";
    SessionStatus["EXPIRED"] = "EXPIRED";
    SessionStatus["TERMINATED"] = "TERMINATED";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
class SessionService {
    logger;
    cache;
    dynamodb;
    metrics;
    tableName;
    observability;
    constructor() {
        this.logger = new logger_1.Logger('SessionService');
        this.cache = cache_service_1.CacheService.getInstance();
        this.dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
        this.metrics = new metrics_1.MetricsService('Sessions');
        this.tableName = process.env.SESSION_TABLE || `${process.env.RESOURCE_PREFIX}-chat-sessions`;
        this.observability = observability_service_1.ObservabilityService.getInstance();
    }
    async createSession(userId, metadata = {}) {
        const session = {
            sessionId: (0, uuid_1.v4)(),
            userId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            lastActivity: new Date().toISOString(),
            metadata: {
                ...metadata,
                userType: metadata.userType || 'basic'
            },
            status: SessionStatus.ACTIVE
        };
        try {
            await this.dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName: this.tableName,
                Item: {
                    ...session,
                    GSI1PK: `USER#${userId}`,
                    GSI1SK: session.createdAt,
                    entityType: 'SESSION'
                },
                ConditionExpression: 'attribute_not_exists(sessionId)'
            }));
            this.metrics.incrementCounter('SessionCreated');
            return session;
        }
        catch (error) {
            this.logger.error('Error creating session', { error, userId });
            throw error;
        }
    }
    async getUserActiveSessions(userId) {
        try {
            const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.tableName,
                IndexName: 'UserStatusIndex',
                KeyConditionExpression: 'userId = :userId AND status = :status',
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': SessionStatus.ACTIVE
                }
            }));
            return result.Items;
        }
        catch (error) {
            this.logger.error('Error getting user sessions', { error, userId });
            throw error;
        }
    }
    async getSession(sessionId) {
        const cachedSession = await this.cache.get(`session:${sessionId}`);
        if (cachedSession) {
            return cachedSession;
        }
        const result = await this.dynamodb.send(new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: { sessionId }
        }));
        if (!result.Item) {
            this.logger.error(`Session ${sessionId} not found`);
            throw new errors_1.SessionNotFoundError(`Session ${sessionId} not found`);
        }
        const session = result.Item;
        if (new Date(session.expiresAt) < new Date()) {
            await this.terminateSession(sessionId);
            this.logger.error(`Session ${sessionId} has expired`);
            throw new errors_1.SessionNotFoundError(`Session ${sessionId} has expired`);
        }
        await this.cache.set(`session:${sessionId}`, session, { ttl: 3600 });
        return session;
    }
    async updateSession(sessionId, metadata) {
        const session = await this.getSession(sessionId);
        const updatedSession = {
            ...session,
            lastActivity: new Date().toISOString(),
            metadata: { ...session.metadata, ...metadata }
        };
        await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { sessionId },
            UpdateExpression: 'SET lastActivity = :la, metadata = :md',
            ExpressionAttributeValues: {
                ':la': updatedSession.lastActivity,
                ':md': updatedSession.metadata
            }
        }));
        await this.cache.set(`session:${sessionId}`, updatedSession, { ttl: 3600 });
        return updatedSession;
    }
    async terminateSession(sessionId) {
        await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: { sessionId },
            UpdateExpression: 'SET status = :status',
            ExpressionAttributeValues: {
                ':status': SessionStatus.TERMINATED
            }
        }));
        await this.cache.delete(`session:${sessionId}`);
    }
    async extendSession(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            await this.observability.trackSessionMetrics(sessionId, 'SessionExtended', 1);
            const extendedSession = {
                ...session,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                lastActivity: new Date().toISOString()
            };
            await this.updateSession(sessionId, extendedSession);
            this.metrics.incrementCounter('SessionExtended');
            return extendedSession;
        }
        catch (error) {
            await this.observability.trackAuthEvent('SessionExtensionFailure', { sessionId });
            this.logger.error('Error extending session', { error, sessionId });
            throw error;
        }
    }
    async terminateAllUserSessions(userId) {
        try {
            const sessions = await this.getUserActiveSessions(userId);
            await Promise.all(sessions.map(session => this.terminateSession(session.sessionId)));
            this.metrics.incrementCounter('UserSessionsTerminated');
        }
        catch (error) {
            this.logger.error('Error terminating user sessions', { error, userId });
            throw error;
        }
    }
    async cleanupExpiredSessions() {
        const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            IndexName: 'StatusExpiresIndex',
            KeyConditionExpression: 'status = :status AND expiresAt < :now',
            ExpressionAttributeValues: {
                ':status': SessionStatus.ACTIVE,
                ':now': new Date().toISOString()
            }
        }));
        const expiredSessions = result.Items;
        await Promise.all(expiredSessions.map(session => this.terminateSession(session.sessionId)));
        this.metrics.incrementCounter('ExpiredSessionsCleaned');
    }
}
exports.SessionService = SessionService;
__decorate([
    (0, cache_decorator_1.Cached)({
        keyPrefix: 'createSession:',
        keyGenerator: ([sessionId]) => sessionId
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionService.prototype, "createSession", null);
//# sourceMappingURL=session.service.js.map