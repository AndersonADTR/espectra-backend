"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalServerError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.AuthenticationError = exports.AuthorizationError = exports.ResourceNotFoundError = exports.ValidationError = void 0;
const base_error_1 = require("./base-error");
class ValidationError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('VALIDATION_ERROR', 400, message, metadata);
    }
}
exports.ValidationError = ValidationError;
class ResourceNotFoundError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('RESOURCE_NOT_FOUND', 404, message, metadata);
    }
}
exports.ResourceNotFoundError = ResourceNotFoundError;
class AuthorizationError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('AUTHORIZATION_ERROR', 401, message, metadata);
    }
}
exports.AuthorizationError = AuthorizationError;
class AuthenticationError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('AUTHENTICATION_ERROR', 401, message, metadata);
    }
}
exports.AuthenticationError = AuthenticationError;
class ForbiddenError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('FORBIDDEN', 403, message, metadata);
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('NOT_FOUND', 404, message, metadata);
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('CONFLICT', 409, message, metadata);
    }
}
exports.ConflictError = ConflictError;
class InternalServerError extends base_error_1.BaseError {
    constructor(message = 'Internal server error', metadata) {
        super('INTERNAL_SERVER_ERROR', 500, message, metadata);
    }
}
exports.InternalServerError = InternalServerError;
//# sourceMappingURL=http-errors.js.map