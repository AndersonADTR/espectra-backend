"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = exports.rateLimitPresets = exports.RateLimitMiddleware = void 0;
const logger_1 = require("@shared/utils/logger");
const redis_service_1 = require("@shared/services/cache/redis.service");
const rate_limit_error_1 = require("@shared/utils/errors/rate-limit-error");
class RateLimitMiddleware {
    static logger = new logger_1.Logger('RateLimitMiddleware');
    static rateLimit(config) {
        return (handler) => {
            return async (event, context) => {
                try {
                    const clientIp = event.requestContext?.identity?.sourceIp ||
                        event.requestContext?.http?.sourceIp;
                    const key = `${config.keyPrefix || 'rateLimit'}:${clientIp}:${event.path}`;
                    let count = 1;
                    let ttl = config.windowMs;
                    let headers = {};
                    try {
                        const redisService = redis_service_1.RedisService.getInstance();
                        const isConnected = await redisService.checkConnection();
                        if (isConnected) {
                            const redis = redisService.getClient();
                            const multi = redisService.multi();
                            multi.incr(key);
                            multi.pttl(key);
                            const results = await multi.exec();
                            if (results) {
                                count = results[0][1];
                                ttl = results[1][1];
                                if (count === 1) {
                                    await redis.pexpire(key, config.windowMs);
                                    ttl = config.windowMs;
                                }
                                if (count > config.max) {
                                    const resetTime = new Date(Date.now() + ttl);
                                    throw new rate_limit_error_1.TooManyRequestsError('Rate limit exceeded', {
                                        retryAfter: Math.ceil(ttl / 1000),
                                        resetTime: resetTime.toISOString()
                                    });
                                }
                                headers = {
                                    'X-RateLimit-Limit': config.max.toString(),
                                    'X-RateLimit-Remaining': Math.max(0, config.max - count).toString(),
                                    'X-RateLimit-Reset': new Date(Date.now() + ttl).toISOString()
                                };
                            }
                            else {
                                this.logger.warn('Redis multi command returned null results, skipping rate limiting');
                            }
                        }
                        else {
                            this.logger.warn('Redis is not connected, skipping rate limiting');
                        }
                    }
                    catch (redisError) {
                        this.logger.error('Error in Redis operations, skipping rate limiting', {
                            error: redisError instanceof Error ? redisError.message : String(redisError),
                            stack: redisError instanceof Error ? redisError.stack : undefined
                        });
                    }
                    const result = await handler(event, context, () => { });
                    if (!result) {
                        return {
                            statusCode: 500,
                            body: JSON.stringify({
                                success: false,
                                message: 'Internal server error',
                                data: null,
                                errors: {
                                    server: ['An unexpected error occurred']
                                }
                            }),
                            headers: {
                                'Content-Type': 'application/json',
                                ...headers
                            }
                        };
                    }
                    return {
                        ...result,
                        statusCode: result.statusCode || 200,
                        body: result.body || '',
                        headers: {
                            ...(result.headers || {}),
                            ...headers
                        }
                    };
                }
                catch (error) {
                    if (error instanceof rate_limit_error_1.TooManyRequestsError) {
                        const headers = {
                            'Content-Type': 'application/json',
                            'Retry-After': error.metadata?.retryAfter?.toString() || '60',
                            'X-RateLimit-Reset': (error.metadata?.resetTime?.toString() || new Date(Date.now() + 60000).toISOString())
                        };
                        return {
                            statusCode: 429,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Too many requests, please try again later',
                                data: null,
                                errors: {
                                    rateLimit: ['Rate limit exceeded. Please try again later.']
                                }
                            })
                        };
                    }
                    throw error;
                }
                finally {
                }
            };
        };
    }
}
exports.RateLimitMiddleware = RateLimitMiddleware;
exports.rateLimitPresets = {
    strict: {
        windowMs: 60000,
        max: 5,
        keyPrefix: 'rl:str'
    },
    moderate: {
        windowMs: 300000,
        max: 100,
        keyPrefix: 'rl:mod'
    },
    relaxed: {
        windowMs: 3600000,
        max: 1000,
        keyPrefix: 'rl:rel'
    }
};
const rateLimit = (config = exports.rateLimitPresets.moderate) => RateLimitMiddleware.rateLimit(config);
exports.rateLimit = rateLimit;
//# sourceMappingURL=rate-limit.middleware.js.map