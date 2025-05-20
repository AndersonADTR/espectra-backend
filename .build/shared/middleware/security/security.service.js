"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
const metrics_1 = require("@shared/utils/metrics");
const aws_jwt_verify_1 = require("aws-jwt-verify");
const config_service_1 = require("@shared/config/config.service");
class SecurityService {
    logger;
    metrics;
    verifier;
    constructor() {
        this.logger = new logger_1.Logger('SecurityService');
        this.metrics = new metrics_1.MetricsService('Security');
        this.verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
            userPoolId: config_service_1.config.getRequired('COGNITO_USER_POOL_ID'),
            tokenUse: "access",
            clientId: config_service_1.config.getRequired('COGNITO_CLIENT_ID')
        });
    }
    async validateToken(token) {
        try {
            const payload = await this.verifier.verify(token);
            const user = {
                userId: payload.sub,
                email: payload.email,
                roles: payload['custom:roles']?.split(','),
                permissions: payload['custom:permissions']?.split(','),
                metadata: payload
            };
            this.metrics.incrementCounter('TokenValidationSuccess');
            return user;
        }
        catch (error) {
            this.logger.error('Token validation failed', { error });
            this.metrics.incrementCounter('TokenValidationFailure');
            throw new errors_1.AuthenticationError('Invalid or expired token');
        }
    }
    async validatePermissions(user, requiredPermissions) {
        if (!user.permissions) {
            return false;
        }
        return requiredPermissions.every(permission => user.permissions.includes(permission));
    }
    async validateRoles(user, requiredRoles) {
        if (!user.roles) {
            return false;
        }
        return requiredRoles.some(role => user.roles.includes(role));
    }
}
exports.SecurityService = SecurityService;
//# sourceMappingURL=security.service.js.map