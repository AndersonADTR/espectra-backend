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
            console.log('TokenService: Verifying token', { token });
            if (!token || token.trim() === '') {
                throw new errors_1.AuthenticationError('Empty JWT provided');
            }
            const isBlacklisted = await this.isTokenBlacklisted(token);
            if (isBlacklisted) {
                throw new errors_1.AuthenticationError('Token has been revoked');
            }
            console.log('TokenService: Token not blacklisted');
            const payload = await this.verifier.verify(token);
            console.log('TokenService: Token verified');
            await this.observability.trackAuthEvent('TokenValidationSuccess');
            console.log('TokenService: Tracking auth event');
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
        catch (error) {
            console.warn('Redis blacklist check failed, proceeding with token refresh', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            await this.observability.trackAuthEvent('TokenValidationFailure');
            throw new errors_1.AuthenticationError('Invalid token: ' + (error.message || 'Unknown error'));
        }
    }
    async invalidateToken(token) {
        try {
            const payload = await this.verifier.verify(token);
            const now = Math.floor(Date.now() / 1000);
            const timeToExpire = payload.exp - now;
            if (timeToExpire > 0) {
                await this.redis.getClient().setex(`blacklist:${token}`, timeToExpire, 'true');
            }
            await this.observability.trackAuthEvent('TokenInvalidated');
        }
        catch (error) {
            console.log('Error invalidating token', { error });
            throw new errors_1.AuthenticationError('Failed to invalidate token: ' + (error.message || 'Unknown error'));
        }
    }
    async isTokenBlacklisted(token) {
        try {
            const exists = await Promise.race([
                this.redis.getClient().exists(`blacklist:${token}`),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Redis operation timed out')), 3000))
            ]);
            return exists === 1;
        }
        catch (error) {
            console.warn('Error checking token blacklist, assuming token valid', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }
    async cleanup() {
        try {
            await this.redis.cleanup();
        }
        catch (error) {
            console.log('Error cleaning up TokenService', { error });
        }
    }
}
exports.TokenService = TokenService;
//# sourceMappingURL=token.service.js.map