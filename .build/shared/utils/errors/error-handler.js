"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const base_error_1 = require("./base-error");
const logger_1 = require("../logger");
const logger = new logger_1.Logger('ErrorHandler');
const errorHandler = (error) => {
    if (error instanceof base_error_1.BaseError) {
        logger.error('Known error occurred', {
            errorType: error.name,
            errorCode: error.code,
            errorMessage: error.message,
            metadata: error.metadata
        });
        return {
            statusCode: error.statusCode,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(error.toJSON())
        };
    }
    logger.error('Unhandled error occurred', {
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack
    });
    const internalError = new logger_1.InternalServerError('An unexpected error occurred');
    return {
        statusCode: internalError.statusCode,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(internalError)
    };
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error-handler.js.map