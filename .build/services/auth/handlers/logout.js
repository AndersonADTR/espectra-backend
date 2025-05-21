"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const authentication_service_1 = require("../services/authentication.service");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
const logger = new logger_1.Logger('LogoutHandler');
const logoutHandler = async (event) => {
    logger.info('Processing logout request', {
        headers: event.headers,
        hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
        timestamp: new Date().toISOString()
    });
    console.log('Processing logout request', {
        headers: event.headers,
        hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
        timestamp: new Date().toISOString()
    });
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            logger.error('No authorization header provided');
            console.error('No authorization header provided');
            throw new errors_1.AuthenticationError('No authorization token provided');
        }
        logger.info('Authorization header found', {
            authHeaderLength: authHeader.length,
            authHeaderStartsWith: authHeader.substring(0, 10) + '...'
        });
        console.log('Authorization header found', {
            authHeaderLength: authHeader.length,
            authHeaderStartsWith: authHeader.substring(0, 10) + '...'
        });
        const token = authHeader.replace('Bearer ', '');
        logger.info('Token extracted from header', {
            tokenLength: token.length,
            tokenStartsWith: token.substring(0, 10) + '...',
            isBearerToken: authHeader.startsWith('Bearer ')
        });
        console.log('Token extracted from header', {
            tokenLength: token.length,
            tokenStartsWith: token.substring(0, 10) + '...',
            isBearerToken: authHeader.startsWith('Bearer ')
        });
        logger.info('Executing logout');
        console.log('Executing logout');
        await authService.logout(token);
        logger.info('Logout executed successfully');
        console.log('Logout executed successfully');
        const cookies = [];
        if (process.env.STAGE === 'prod') {
            cookies.push('refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
            logger.info('Refresh token cookie cleared');
            console.log('Refresh token cookie cleared');
        }
        logger.info('Logout completed successfully');
        console.log('Logout completed successfully');
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
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
    catch (error) {
        logger.error('Error in logout handler', {
            error,
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        console.error('Error in logout handler', {
            error,
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        throw error;
    }
    finally {
        await authService.cleanup();
    }
};
exports.handler = (0, error_handling_middleware_1.withErrorHandling)(logoutHandler);
//# sourceMappingURL=logout.js.map