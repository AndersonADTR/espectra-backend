"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withAuth = void 0;
const authentication_service_1 = require("@services/auth/services/authentication.service");
const errors_1 = require("@shared/utils/errors");
const logger_1 = require("@shared/utils/logger");
const logger = new logger_1.Logger('AuthMiddleware');
const withAuth = (handler) => {
    return async (event, context) => {
        const authService = new authentication_service_1.AuthenticationService();
        try {
            const authHeader = event.headers.Authorization || event.headers.authorization;
            if (!authHeader) {
                logger.warn('No authorization header provided');
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        success: false,
                        message: 'Unauthorized: No token provided',
                        data: null,
                        errors: {
                            auth: ['No authorization token was found']
                        }
                    })
                };
            }
            const token = authHeader.replace('Bearer ', '');
            const user = await authService.validateToken(token);
            if (!event.requestContext.authorizer) {
                event.requestContext.authorizer = {};
            }
            event.requestContext.authorizer.user = user;
            return await handler(event, context);
        }
        catch (error) {
            logger.error('Authentication error', { error });
            if (error instanceof errors_1.AuthenticationError) {
                return {
                    statusCode: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        success: false,
                        message: 'Unauthorized: Invalid token',
                        data: null,
                        errors: {
                            auth: [error.message]
                        }
                    })
                };
            }
            return {
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    message: 'Internal server error',
                    data: null,
                    errors: {
                        server: ['An unexpected error occurred']
                    }
                })
            };
        }
        finally {
            await authService.cleanup();
        }
    };
};
exports.withAuth = withAuth;
//# sourceMappingURL=auth.middleware.js.map