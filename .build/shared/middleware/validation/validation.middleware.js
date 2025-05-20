"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = exports.ValidationMiddleware = void 0;
const logger_1 = require("@shared/utils/logger");
const errors_1 = require("@shared/utils/errors");
class ValidationMiddleware {
    static logger = new logger_1.Logger('ValidationMiddleware');
    static validate(schema, options = {}) {
        return (handler) => {
            return async (event, context, callback) => {
                try {
                    let parsedBody;
                    this.logger.info('Validation started', {
                        hasBody: !!event.body,
                        isBase64: event.isBase64Encoded,
                        contentType: event.headers['Content-Type'] || event.headers['content-type']
                    });
                    if (event.body) {
                        try {
                            if (event.isBase64Encoded) {
                                const decodedBody = Buffer.from(event.body, 'base64').toString('utf8');
                                this.logger.info('Decoded base64 body', { decodedBody });
                                parsedBody = JSON.parse(decodedBody);
                            }
                            else {
                                this.logger.info('Parsing raw body', { body: event.body });
                                parsedBody = JSON.parse(event.body);
                            }
                            this.logger.info('Parsed body before validation', { parsedBody });
                            const { error, value } = schema.validate(parsedBody, {
                                abortEarly: false,
                                stripUnknown: true,
                                ...options
                            });
                            if (error) {
                                this.logger.error('Validation error details', {
                                    error: error.details,
                                    receivedValue: parsedBody
                                });
                                throw new errors_1.ValidationError('Validation failed', {
                                    details: error.details.map(detail => ({
                                        message: detail.message,
                                        path: detail.path
                                    }))
                                });
                            }
                            this.logger.info('Validation successful', { validatedValue: value });
                            event.body = JSON.stringify(value);
                        }
                        catch (error) {
                            this.logger.error('Body processing error', {
                                error,
                                bodyPreview: event.body?.substring(0, 100)
                            });
                            throw error;
                        }
                    }
                    else {
                        throw new Error('No body found in request');
                    }
                    const result = await handler(event, context, callback);
                    if (!result) {
                        throw new Error('Handler did not return a result');
                    }
                    return result;
                }
                catch (error) {
                    if (error instanceof errors_1.ValidationError) {
                        throw error;
                    }
                    throw new errors_1.ValidationError(error instanceof Error ? error.message : 'Invalid request data');
                }
            };
        };
    }
}
exports.ValidationMiddleware = ValidationMiddleware;
const validateRequest = (schema, options) => ValidationMiddleware.validate(schema, options);
exports.validateRequest = validateRequest;
//# sourceMappingURL=validation.middleware.js.map