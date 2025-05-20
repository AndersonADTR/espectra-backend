"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMiddleware = void 0;
const logger_1 = require("@shared/utils/logger");
const security_service_1 = require("./security.service");
const errors_1 = require("@shared/utils/errors");
const security_context_1 = require("./security.context");
const metrics_1 = require("@shared/utils/metrics");
class SecurityMiddleware {
    static logger = new logger_1.Logger('SecurityMiddleware');
    static securityService = new security_service_1.SecurityService();
    static metrics = new metrics_1.MetricsService('Security');
    static secure(options = {}) {
        return (handler) => {
            return async (event, context, callback) => {
                const startTime = Date.now();
                try {
                    const contextManager = security_context_1.SecurityContextManager.getInstance();
                    return await contextManager.run({
                        traceId: context.awsRequestId,
                        requestId: event.requestContext.requestId
                    }, async () => {
                        try {
                            if (options.ipWhitelist?.length) {
                                const clientIp = event.requestContext.identity.sourceIp;
                                if (!options.ipWhitelist.includes(clientIp)) {
                                    this.metrics.incrementCounter('IpWhitelistRejection');
                                    throw new errors_1.ForbiddenError('IP not allowed');
                                }
                            }
                            if (options.requireAuth) {
                                const token = this.extractToken(event);
                                const user = await this.securityService.validateToken(token);
                                if (options.roles?.length) {
                                    const hasRole = options.roles.some(role => user.roles?.includes(role));
                                    if (!hasRole) {
                                        this.metrics.incrementCounter('InsufficientRoleRejection');
                                        throw new errors_1.ForbiddenError('Insufficient roles');
                                    }
                                }
                                if (options.permissions?.length) {
                                    const hasPermissions = options.permissions.every(permission => user.permissions?.includes(permission));
                                    if (!hasPermissions) {
                                        this.metrics.incrementCounter('InsufficientPermissionsRejection');
                                        throw new errors_1.ForbiddenError('Insufficient permissions');
                                    }
                                }
                                contextManager.updateContext({ user });
                                this.metrics.incrementCounter('AuthenticationSuccess');
                            }
                            if (options.customValidation) {
                                const isValid = await options.customValidation(event);
                                if (!isValid) {
                                    this.metrics.incrementCounter('CustomValidationRejection');
                                    throw new errors_1.ForbiddenError('Custom validation failed');
                                }
                            }
                            const result = await handler(event, context, callback);
                            const duration = Date.now() - startTime;
                            this.metrics.recordLatency('RequestDuration', duration);
                            return result;
                        }
                        catch (error) {
                            this.logger.error('Security check failed', { error });
                            this.metrics.incrementCounter('SecurityCheckFailure');
                            throw error;
                        }
                    });
                }
                catch (error) {
                    this.logger.error('Security check failed', { error });
                    this.metrics.incrementCounter('SecurityCheckFailure');
                    throw error;
                }
            };
        };
    }
    static extractToken(event) {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            this.metrics.incrementCounter('MissingAuthToken');
            throw new errors_1.ForbiddenError('No authorization token provided');
        }
        return authHeader.replace('Bearer ', '');
    }
}
exports.SecurityMiddleware = SecurityMiddleware;
//# sourceMappingURL=security.middleware.js.map