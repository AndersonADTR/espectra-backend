"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const authentication_service_1 = require("../services/authentication.service");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const logger = new logger_1.Logger('GetUserHandler');
const getUserHandler = async (event) => {
    logger.info('Processing get user request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const userId = event.pathParameters?.userId;
        if (!userId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    message: 'Missing userId parameter',
                    data: null,
                    errors: {
                        userId: ['User ID is required']
                    }
                })
            };
        }
        logger.info(`Fetching user data for userId: ${userId}`);
        const user = await authService.getUserById(userId);
        if (!user) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: false,
                    message: 'User not found',
                    data: null,
                    errors: {
                        userId: ['User with the specified ID was not found']
                    }
                })
            };
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: true,
                message: 'User retrieved successfully',
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
exports.handler = (0, error_handling_middleware_1.withErrorHandling)(getUserHandler);
//# sourceMappingURL=getUser.js.map