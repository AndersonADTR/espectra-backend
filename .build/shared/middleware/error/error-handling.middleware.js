"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withErrorHandling = exports.ErrorHandlingMiddleware = void 0;
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
class ErrorHandlingMiddleware {
    static logger = new logger_1.Logger('ErrorHandlingMiddleware');
    static withErrorHandling(handler) {
        return async (event, context, callback) => {
            try {
                context.callbackWaitsForEmptyEventLoop = false;
                const requestContext = {
                    requestId: context.awsRequestId,
                    path: event.path,
                    method: event.httpMethod,
                    sourceIP: event.requestContext?.identity?.sourceIp ||
                        event.requestContext?.http?.sourceIp ||
                        'unknown'
                };
                this.logger.info('Processing request', requestContext);
                const result = await handler(event, context, callback);
                if (!result) {
                    throw new Error('Handler did not return a result');
                }
                return {
                    ...result,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': true,
                        ...result.headers,
                    }
                };
            }
            catch (error) {
                return this.handleError(error, context, event);
            }
        };
    }
    static handleError(error, context, event) {
        const timestamp = new Date().toISOString();
        const requestId = context.awsRequestId;
        const requestInfo = {
            path: event.path,
            method: event.httpMethod,
            sourceIP: event.requestContext?.identity?.sourceIp ||
                event.requestContext?.http?.sourceIp ||
                'unknown'
        };
        if (error instanceof errors_1.BaseError) {
            console.log('Known error occurred', {
                ...requestInfo,
                errorType: error.name,
                errorCode: error.code,
                statusCode: error.statusCode,
                message: error.message,
                requestId,
                timestamp,
                ...(error.metadata || {})
            });
            return {
                statusCode: error.statusCode,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                    'X-Request-ID': requestId
                },
                body: JSON.stringify({
                    code: error.code,
                    message: error.message,
                    statusCode: error.statusCode,
                    details: {
                        requestId,
                        timestamp,
                        ...(process.env.STAGE === 'dev' ? error.metadata : {})
                    }
                })
            };
        }
        console.log('Unhandled error occurred', {
            ...requestInfo,
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            requestId,
            timestamp
        });
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'X-Request-ID': requestId
            },
            body: JSON.stringify({
                code: 'INTERNAL_SERVER_ERROR',
                message: process.env.STAGE === 'dev' ?
                    (error instanceof Error ? error.message : 'Unknown error') :
                    'An internal server error occurred',
                statusCode: 500,
                details: {
                    requestId,
                    timestamp
                }
            })
        };
    }
}
exports.ErrorHandlingMiddleware = ErrorHandlingMiddleware;
const withErrorHandling = (handler) => ErrorHandlingMiddleware.withErrorHandling(handler);
exports.withErrorHandling = withErrorHandling;
//# sourceMappingURL=error-handling.middleware.js.map