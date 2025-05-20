"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("@shared/utils/logger");
const cache_service_1 = require("@shared/services/cache/cache.service");
class UserService {
    static instance;
    dynamoDbClient;
    logger;
    cacheService;
    usersTableName;
    cacheKeyPrefix = 'user:';
    cacheTtl = 3600;
    constructor() {
        const client = new client_dynamodb_1.DynamoDBClient({});
        this.dynamoDbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client, {
            marshallOptions: {
                removeUndefinedValues: true,
                convertEmptyValues: true
            }
        });
        this.logger = new logger_1.Logger('UserService');
        this.cacheService = cache_service_1.CacheService.getInstance();
        this.usersTableName = process.env.USERS_TABLE ||
            `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`;
    }
    static getInstance() {
        if (!UserService.instance) {
            UserService.instance = new UserService();
        }
        return UserService.instance;
    }
    async getUserById(userId) {
        if (!userId) {
            this.logger.warn('Invalid userId provided to getUserById', { userId });
            return null;
        }
        const startTime = Date.now();
        const cacheKey = `${this.cacheKeyPrefix}${userId}`;
        try {
            const cachedUser = await this.cacheService.get(cacheKey);
            if (cachedUser) {
                this.logger.debug('User details retrieved from cache', { userId });
                return cachedUser;
            }
            const result = await this.dynamoDbClient.send(new lib_dynamodb_1.GetCommand({
                TableName: this.usersTableName,
                Key: { userId }
            }));
            if (!result.Item) {
                this.logger.warn('User not found', { userId });
                return null;
            }
            const user = result.Item;
            if (!user.botpressUserKeyId) {
                this.logger.warn('User found but has no botpressUserKeyId', { userId });
            }
            await this.cacheService.set(cacheKey, user, { ttl: this.cacheTtl });
            this.logger.debug('User details retrieved from database', {
                userId,
                hasBotpressKey: !!user.botpressUserKeyId,
                latency: Date.now() - startTime
            });
            return user;
        }
        catch (error) {
            this.logger.error('Error retrieving user details', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            return null;
        }
    }
    async getBotpressUserKey(userId) {
        if (!userId) {
            this.logger.warn('Invalid userId provided to getBotpressUserKey', { userId });
            return null;
        }
        try {
            const cacheKey = `${this.cacheKeyPrefix}${userId}`;
            const cachedUser = await this.cacheService.get(cacheKey);
            if (cachedUser && cachedUser.botpressUserKeyId) {
                return cachedUser.botpressUserKeyId;
            }
            const user = await this.getUserById(userId);
            if (!user) {
                this.logger.warn('User not found when retrieving Botpress key', { userId });
                return null;
            }
            if (!user.botpressUserKeyId) {
                this.logger.warn('User has no Botpress key assigned', {
                    userId,
                    userEmail: user.email,
                    userStatus: user.status
                });
                return null;
            }
            return user.botpressUserKeyId;
        }
        catch (error) {
            this.logger.error('Error retrieving Botpress user key', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            return null;
        }
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map