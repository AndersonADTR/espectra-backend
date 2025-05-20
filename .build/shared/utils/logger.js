"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalServerError = exports.ResourceNotFoundError = exports.ValidationError = exports.AuthorizationError = exports.BaseError = exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
class Logger {
    context;
    logger;
    constructor(context) {
        this.context = context;
        this.logger = winston_1.default.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
            defaultMeta: {
                service: 'espectra-backend',
                context: this.context,
            },
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
                }),
            ],
        });
    }
    info(message, meta) {
        console.info(message, meta);
        this.logger.info(message, meta);
    }
    error(message, meta) {
        console.error(message, meta);
        this.logger.error(message, meta);
    }
    warn(message, meta) {
        console.warn(message, meta);
        this.logger.warn(message, meta);
    }
    debug(message, meta) {
        console.debug(message, meta);
        this.logger.debug(message, meta);
    }
}
exports.Logger = Logger;
class BaseError extends Error {
    code;
    statusCode;
    constructor(code, statusCode, message) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = this.constructor.name;
    }
}
exports.BaseError = BaseError;
class AuthorizationError extends BaseError {
    constructor(message) {
        super('AUTHORIZATION_ERROR', 401, message);
    }
}
exports.AuthorizationError = AuthorizationError;
class ValidationError extends BaseError {
    constructor(message) {
        super('VALIDATION_ERROR', 400, message);
    }
}
exports.ValidationError = ValidationError;
class ResourceNotFoundError extends BaseError {
    constructor(message) {
        super('RESOURCE_NOT_FOUND', 404, message);
    }
}
exports.ResourceNotFoundError = ResourceNotFoundError;
class InternalServerError extends BaseError {
    constructor(message = 'Internal Server Error') {
        super('INTERNAL_SERVER_ERROR', 500, message);
    }
}
exports.InternalServerError = InternalServerError;
//# sourceMappingURL=logger.js.map