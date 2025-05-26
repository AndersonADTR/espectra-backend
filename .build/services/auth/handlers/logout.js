"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const authentication_service_1 = require("../services/authentication.service");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const cors_1 = require("@shared/middleware/cors");
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
const logger = new logger_1.Logger('LogoutHandler');
const logoutHandler = async (event) => {
    console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Processing logout request',
        timestamp: new Date().toISOString(),
        requestId: event.requestContext?.requestId,
        path: event.path,
        method: event.httpMethod,
        stage: event.requestContext?.stage,
        headers: event.headers,
        hasAuthorization: !!(event.headers.Authorization || event.headers.authorization)
    }));
    logger.info('Processing logout request', {
        headers: event.headers,
        hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
        timestamp: new Date().toISOString(),
        requestId: event.requestContext?.requestId
    });
    console.log('Processing logout request', {
        headers: event.headers,
        hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
        timestamp: new Date().toISOString(),
        requestId: event.requestContext?.requestId
    });
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const authHeader = event.headers.Authorization || event.headers.authorization;
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization header check',
            hasAuthHeader: !!authHeader,
            authHeaderType: typeof authHeader,
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        }));
        if (!authHeader) {
            logger.error('No authorization header provided');
            console.error('No authorization header provided');
            throw new errors_1.AuthenticationError('No authorization token provided');
        }
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization header found',
            authHeaderLength: authHeader.length,
            authHeaderStartsWith: authHeader.substring(0, 20) + '...',
            authHeaderType: typeof authHeader,
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        }));
        logger.info('Authorization header found', {
            authHeaderLength: authHeader.length,
            authHeaderStartsWith: authHeader.substring(0, 20) + '...',
            authHeaderType: typeof authHeader,
            timestamp: new Date().toISOString()
        });
        console.log('Authorization header found', {
            authHeaderLength: authHeader.length,
            authHeaderStartsWith: authHeader.substring(0, 20) + '...',
            authHeaderType: typeof authHeader,
            timestamp: new Date().toISOString()
        });
        let token = authHeader;
        if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Token extracted from header',
            tokenLength: token.length,
            tokenStartsWith: token.substring(0, 20) + '...',
            isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        }));
        logger.info('Token extracted from header', {
            tokenLength: token.length,
            tokenStartsWith: token.substring(0, 20) + '...',
            isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
            timestamp: new Date().toISOString()
        });
        console.log('Token extracted from header', {
            tokenLength: token.length,
            tokenStartsWith: token.substring(0, 20) + '...',
            isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
            timestamp: new Date().toISOString()
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
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Error in logout handler',
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace',
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        }));
        logger.error('Error in logout handler', {
            error,
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace',
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        });
        console.error('Error in logout handler', {
            error,
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace',
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        });
        if (error instanceof errors_1.AuthenticationError) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    message: error.message || 'Authentication error',
                    code: 'AUTHENTICATION_ERROR',
                    data: null,
                    errors: {
                        auth: [error.message || 'Authentication error']
                    }
                })
            };
        }
        throw error;
    }
    finally {
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Logout process completed',
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        }));
        logger.info('Logout process completed', {
            timestamp: new Date().toISOString(),
            requestId: event.requestContext?.requestId
        });
        await authService.cleanup();
    }
};
exports.handler = (0, cors_1.withCors)((0, error_handling_middleware_1.withErrorHandling)(logoutHandler));
//# sourceMappingURL=logout.js.map