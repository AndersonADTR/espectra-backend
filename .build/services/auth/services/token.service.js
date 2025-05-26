"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const config_service_1 = require("@shared/config/config.service");
const errors_1 = require("@shared/utils/errors");
const redis_service_1 = require("@shared/services/cache/redis.service");
const observability_service_1 = require("@shared/services/observability/observability.service");
class TokenService {
    verifier;
    redis;
    observability;
    constructor() {
        this.verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
            userPoolId: config_service_1.config.getRequired('COGNITO_USER_POOL_ID'),
            tokenUse: "access",
            clientId: config_service_1.config.getRequired('COGNITO_CLIENT_ID')
        });
        this.redis = redis_service_1.RedisService.getInstance();
        this.observability = observability_service_1.ObservabilityService.getInstance();
    }
    async verifyToken(token) {
        try {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: TokenService.verifyToken called',
                tokenLength: token ? token.length : 0,
                tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            }));
            console.log('TokenService: Verifying token', {
                tokenLength: token ? token.length : 0,
                tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null'
            });
            if (!token || token.trim() === '') {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Empty JWT provided',
                    timestamp: new Date().toISOString()
                }));
                throw new errors_1.AuthenticationError('Empty JWT provided');
            }
            let isBlacklisted = false;
            try {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Checking if token is blacklisted',
                    timestamp: new Date().toISOString()
                }));
                isBlacklisted = await this.isTokenBlacklisted(token);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token blacklist check result',
                    isBlacklisted,
                    timestamp: new Date().toISOString()
                }));
            }
            catch (redisError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error checking token blacklist',
                    error: redisError instanceof Error ? redisError.message : String(redisError),
                    stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Error checking token blacklist, assuming token valid', {
                    error: redisError instanceof Error ? redisError.message : String(redisError)
                });
                isBlacklisted = false;
            }
            if (isBlacklisted) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token has been revoked',
                    timestamp: new Date().toISOString()
                }));
                throw new errors_1.AuthenticationError('Token has been revoked');
            }
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Token not blacklisted, verifying with Cognito',
                timestamp: new Date().toISOString()
            }));
            console.log('TokenService: Token not blacklisted');
            try {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Verifying token with Cognito',
                    timestamp: new Date().toISOString()
                }));
                const payload = await this.verifier.verify(token);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token verified successfully',
                    sub: payload.sub,
                    username: payload.username || payload.sub,
                    hasEmail: !!payload.email,
                    timestamp: new Date().toISOString()
                }));
                console.log('TokenService: Token verified');
                try {
                    await this.observability.trackAuthEvent('TokenValidationSuccess');
                    console.log('TokenService: Tracking auth event');
                }
                catch (observabilityError) {
                    console.log(JSON.stringify({
                        message: 'CLOUDWATCH DEBUG: Error tracking auth event',
                        error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError),
                        timestamp: new Date().toISOString()
                    }));
                    console.warn('Error tracking auth event', {
                        error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
                    });
                }
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token payload',
                    payload: JSON.stringify(payload),
                    timestamp: new Date().toISOString()
                }));
                console.log('TokenService: Token payload', JSON.stringify(payload, null, 2));
                const sub = payload.sub;
                return {
                    sub: sub,
                    email: payload.email || '',
                    userType: payload['custom:userType'] || 'basic',
                    name: payload.name || '',
                    iat: payload.iat,
                    exp: payload.exp,
                    username: payload.username || sub
                };
            }
            catch (cognitoError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error verifying token with Cognito',
                    error: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
                    stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                }));
                console.error('Error verifying token with Cognito', {
                    error: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
                    stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
                });
                try {
                    await this.observability.trackAuthEvent('TokenValidationFailure');
                }
                catch (observabilityError) {
                    console.warn('Error tracking token validation failure', {
                        error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
                    });
                }
                throw new errors_1.AuthenticationError('Invalid token: ' + (cognitoError.message || 'Unknown error'));
            }
        }
        catch (error) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Error in verifyToken',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                timestamp: new Date().toISOString()
            }));
            console.error('Error verifying token', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            try {
                await this.observability.trackAuthEvent('TokenValidationFailure');
            }
            catch (observabilityError) {
                console.warn('Error tracking token validation failure', {
                    error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
                });
            }
            throw new errors_1.AuthenticationError('Invalid token: ' + (error.message || 'Unknown error'));
        }
    }
    async invalidateToken(token) {
        try {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: TokenService.invalidateToken called',
                tokenLength: token ? token.length : 0,
                tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            }));
            console.log('TokenService: Invalidating token', {
                tokenLength: token ? token.length : 0,
                tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null'
            });
            let payload;
            try {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Verifying token before invalidation',
                    timestamp: new Date().toISOString()
                }));
                payload = await this.verifier.verify(token);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token verified successfully',
                    sub: payload.sub,
                    username: payload.username || payload.sub,
                    hasEmail: !!payload.email,
                    timestamp: new Date().toISOString()
                }));
            }
            catch (verifyError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error verifying token before invalidation',
                    error: verifyError instanceof Error ? verifyError.message : String(verifyError),
                    stack: verifyError instanceof Error ? verifyError.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                }));
                console.error('Error verifying token before invalidation', {
                    error: verifyError instanceof Error ? verifyError.message : String(verifyError),
                    stack: verifyError instanceof Error ? verifyError.stack : 'No stack trace'
                });
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token is already invalid or expired',
                    timestamp: new Date().toISOString()
                }));
                return;
            }
            const now = Math.floor(Date.now() / 1000);
            const timeToExpire = payload.exp - now;
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Token expiration details',
                timeToExpire,
                expiresAt: new Date(payload.exp * 1000).toISOString(),
                now: new Date(now * 1000).toISOString(),
                timestamp: new Date().toISOString()
            }));
            if (timeToExpire <= 0) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token is already expired, no need to blacklist',
                    timestamp: new Date().toISOString()
                }));
                return;
            }
            const isConnected = await this.redis.checkConnection().catch(() => false);
            if (!isConnected) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Redis is not connected, cannot blacklist token',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Redis is not connected, cannot blacklist token');
                return;
            }
            try {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Adding token to blacklist',
                    timeToExpire,
                    timestamp: new Date().toISOString()
                }));
                await Promise.race([
                    this.redis.getClient().setex(`blacklist:${token}`, timeToExpire, 'true'),
                    new Promise((_, reject) => setTimeout(() => {
                        console.log(JSON.stringify({
                            message: 'CLOUDWATCH DEBUG: Redis operation timed out',
                            timestamp: new Date().toISOString()
                        }));
                        reject(new Error('Redis operation timed out'));
                    }, 3000))
                ]);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token added to blacklist successfully',
                    timestamp: new Date().toISOString()
                }));
            }
            catch (redisError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error adding token to blacklist',
                    error: redisError instanceof Error ? redisError.message : String(redisError),
                    stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Error adding token to blacklist', {
                    error: redisError instanceof Error ? redisError.message : String(redisError),
                    stack: redisError instanceof Error ? redisError.stack : 'No stack trace'
                });
            }
            try {
                await this.observability.trackAuthEvent('TokenInvalidated');
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Token invalidation event tracked',
                    timestamp: new Date().toISOString()
                }));
            }
            catch (observabilityError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error tracking token invalidation event',
                    error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError),
                    timestamp: new Date().toISOString()
                }));
                console.warn('Error tracking token invalidation event', {
                    error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
                });
            }
        }
        catch (error) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Error in invalidateToken',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                timestamp: new Date().toISOString()
            }));
            console.error('Error invalidating token', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
        }
    }
    async isTokenBlacklisted(token) {
        try {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Checking if token is blacklisted in Redis',
                tokenLength: token ? token.length : 0,
                tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            }));
            const isConnected = await this.redis.checkConnection().catch(() => false);
            if (!isConnected) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Redis is not connected, assuming token is valid',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Redis is not connected, assuming token is valid');
                return false;
            }
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Redis is connected, checking blacklist',
                timestamp: new Date().toISOString()
            }));
            const exists = await Promise.race([
                this.redis.getClient().exists(`blacklist:${token}`),
                new Promise((_, reject) => setTimeout(() => {
                    console.log(JSON.stringify({
                        message: 'CLOUDWATCH DEBUG: Redis operation timed out',
                        timestamp: new Date().toISOString()
                    }));
                    reject(new Error('Redis operation timed out'));
                }, 3000))
            ]);
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Token blacklist check result',
                exists,
                isBlacklisted: exists === 1,
                timestamp: new Date().toISOString()
            }));
            return exists === 1;
        }
        catch (error) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Error checking token blacklist',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                timestamp: new Date().toISOString()
            }));
            console.warn('Error checking token blacklist, assuming token valid', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            return false;
        }
    }
    async cleanup() {
        try {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: TokenService.cleanup called',
                timestamp: new Date().toISOString()
            }));
            console.log('TokenService: Cleaning up');
            const isConnected = await this.redis.checkConnection().catch(() => false);
            if (!isConnected) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Redis is not connected, skipping cleanup',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Redis is not connected, skipping cleanup');
                return;
            }
            try {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Cleaning up Redis',
                    timestamp: new Date().toISOString()
                }));
                await Promise.race([
                    this.redis.cleanup(),
                    new Promise((_, reject) => setTimeout(() => {
                        console.log(JSON.stringify({
                            message: 'CLOUDWATCH DEBUG: Redis cleanup operation timed out',
                            timestamp: new Date().toISOString()
                        }));
                        reject(new Error('Redis cleanup operation timed out'));
                    }, 3000))
                ]);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Redis cleaned up successfully',
                    timestamp: new Date().toISOString()
                }));
            }
            catch (redisError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH DEBUG: Error cleaning up Redis',
                    error: redisError instanceof Error ? redisError.message : String(redisError),
                    stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
                    timestamp: new Date().toISOString()
                }));
                console.warn('Error cleaning up Redis', {
                    error: redisError instanceof Error ? redisError.message : String(redisError),
                    stack: redisError instanceof Error ? redisError.stack : 'No stack trace'
                });
            }
        }
        catch (error) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Error in cleanup',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                timestamp: new Date().toISOString()
            }));
            console.error('Error cleaning up TokenService', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
        }
    }
}
exports.TokenService = TokenService;
//# sourceMappingURL=token.service.js.map