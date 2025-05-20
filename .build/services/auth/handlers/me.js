"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const authentication_service_1 = require("../services/authentication.service");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const auth_middleware_1 = require("@shared/middleware/auth/auth.middleware");
const logger_1 = require("@shared/utils/logger");
const logger = new logger_1.Logger('MeHandler');
const meHandler = async (event) => {
    logger.info('Processing me request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const user = event.requestContext?.authorizer?.user;
        if (!user) {
            throw new Error('User not found in request context');
        }
        logger.info('User information retrieved', {
            userId: user.userId,
            userType: user.userType
        });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'User information retrieved successfully',
                data: {
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        userType: user.userType,
                        createdAt: user.createdAt,
                        lastLogin: user.lastLogin
                    }
                },
                errors: null
            })
        };
    }
    finally {
        await authService.cleanup();
    }
};
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, auth_middleware_1.withAuth)(meHandler));
//# sourceMappingURL=me.js.map