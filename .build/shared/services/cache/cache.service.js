"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const redis_service_1 = require("./redis.service");
class CacheService {
    static instance;
    redisService;
    defaultOptions = {
        ttl: 3600,
        prefix: 'cache:',
        serialize: true
    };
    constructor() {
        this.redisService = redis_service_1.RedisService.getInstance();
    }
    static getInstance() {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }
    getFullKey(key, prefix) {
        const finalPrefix = prefix || this.defaultOptions.prefix;
        return `${finalPrefix}${key}`;
    }
    async get(key, options = {}) {
        try {
            const fullKey = this.getFullKey(key, options.prefix);
            const value = await this.redisService.get(fullKey);
            if (!value) {
                return null;
            }
            return (options.serialize ?? this.defaultOptions.serialize)
                ? JSON.parse(value)
                : value;
        }
        catch (error) {
            console.error('Error getting cache value', { error, key });
            return null;
        }
    }
    async set(key, value, options = {}) {
        try {
            const fullKey = this.getFullKey(key, options.prefix);
            const ttl = options.ttl ?? this.defaultOptions.ttl;
            const shouldSerialize = options.serialize ?? this.defaultOptions.serialize;
            const finalValue = shouldSerialize ? JSON.stringify(value) : String(value);
            await this.redisService.set(fullKey, finalValue, 'EX', ttl);
            return true;
        }
        catch (error) {
            console.error('Error setting cache value', { error, key });
            return false;
        }
    }
    async delete(key, prefix) {
        try {
            const fullKey = this.getFullKey(key, prefix);
            await this.redisService.del(fullKey);
            return true;
        }
        catch (error) {
            console.error('Error deleting cache value', { error, key });
            return false;
        }
    }
    async exists(key, prefix) {
        try {
            const fullKey = this.getFullKey(key, prefix);
            const exists = await this.redisService.exists(fullKey);
            return exists === 1;
        }
        catch (error) {
            console.error('Error checking cache key existence', { error, key });
            return false;
        }
    }
    async expire(key, ttlSeconds) {
        try {
            const result = await this.redisService.getClient().expire(key, ttlSeconds);
            return result === 1;
        }
        catch (error) {
            console.error('Error setting expiration for key', { error, key });
            return false;
        }
    }
    async invalidateByPattern(pattern) {
        try {
            const keys = await this.redisService.getClient().keys(pattern);
            if (keys.length > 0) {
                await this.redisService.del(...keys);
            }
            return true;
        }
        catch (error) {
            console.error('Error invalidating cache by pattern', { error, pattern });
            return false;
        }
    }
    async cleanup() {
        try {
            await this.redisService.cleanup();
        }
        catch (error) {
            console.error('Error cleaning up cache service', { error });
        }
    }
}
exports.CacheService = CacheService;
//# sourceMappingURL=cache.service.js.map