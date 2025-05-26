"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsPreflightHandler = exports.withCors = void 0;
const logger_1 = require("@shared/utils/logger");
const logger = new logger_1.Logger('CorsMiddleware');
const defaultCorsOptions = {
    allowOrigin: '*',
    allowCredentials: false,
    allowMethods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowHeaders: 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,X-Requested-With,X-Amz-User-Agent',
    exposeHeaders: 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    maxAge: 86400
};
const withCors = (handler, options = {}) => {
    const corsOptions = { ...defaultCorsOptions, ...options };
    return async (event, context) => {
        try {
            if (event.httpMethod === 'OPTIONS') {
                logger.debug('Handling OPTIONS request with CORS headers');
                return {
                    statusCode: 204,
                    headers: getCorsHeaders(corsOptions),
                    body: ''
                };
            }
            const result = await handler(event, context, null);
            return {
                ...result,
                headers: {
                    ...getCorsHeaders(corsOptions),
                    ...result.headers
                }
            };
        }
        catch (error) {
            logger.error('Error in CORS middleware', { error: error.message });
            return {
                statusCode: 500,
                headers: getCorsHeaders(corsOptions),
                body: JSON.stringify({
                    message: 'Internal Server Error',
                    error: process.env.STAGE === 'dev' ? error.message : 'An unexpected error occurred'
                })
            };
        }
    };
};
exports.withCors = withCors;
function getCorsHeaders(options) {
    const headers = {
        'Access-Control-Allow-Origin': options.allowOrigin || defaultCorsOptions.allowOrigin
    };
    if (options.allowCredentials) {
        headers['Access-Control-Allow-Credentials'] = true;
    }
    if (options.allowMethods) {
        headers['Access-Control-Allow-Methods'] = options.allowMethods;
    }
    if (options.allowHeaders) {
        headers['Access-Control-Allow-Headers'] = options.allowHeaders;
    }
    if (options.exposeHeaders) {
        headers['Access-Control-Expose-Headers'] = options.exposeHeaders;
    }
    if (options.maxAge) {
        headers['Access-Control-Max-Age'] = options.maxAge.toString();
    }
    return headers;
}
const corsPreflightHandler = (options = {}) => {
    return async (event) => {
        logger.debug('Handling preflight OPTIONS request');
        return {
            statusCode: 204,
            headers: getCorsHeaders({ ...defaultCorsOptions, ...options }),
            body: ''
        };
    };
};
exports.corsPreflightHandler = corsPreflightHandler;
//# sourceMappingURL=cors.middleware.js.map