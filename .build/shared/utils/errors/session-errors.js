"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionExpiredError = exports.SessionNotFoundError = void 0;
const base_error_1 = require("./base-error");
class SessionNotFoundError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('SESSION_NOT_FOUND', 404, message, metadata);
    }
}
exports.SessionNotFoundError = SessionNotFoundError;
class SessionExpiredError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('SESSION_EXPIRED', 401, message, metadata);
    }
}
exports.SessionExpiredError = SessionExpiredError;
//# sourceMappingURL=session-errors.js.map