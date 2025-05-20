"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const authentication_service_1 = require("../services/authentication.service");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
const logger = new logger_1.Logger('LogoutHandler');
const logoutHandler = async (event) => {
    logger.info('Processing logout request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            throw new errors_1.AuthenticationError('No authorization token provided');
        }
        const token = authHeader.replace('Bearer ', '');
        await authService.logout(token);
        const cookies = [];
        if (process.env.STAGE === 'prod') {
            cookies.push('refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                ...(cookies.length > 0 && { 'Set-Cookie': cookies.join(', ') })
            },
            body: JSON.stringify({
                success: true,
                message: 'Logout successful',
                data: null,
                errors: null
            })
        };
    }
    finally {
        await authService.cleanup();
    }
};
exports.handler = (0, error_handling_middleware_1.withErrorHandling)(logoutHandler);
//# sourceMappingURL=logout.js.map