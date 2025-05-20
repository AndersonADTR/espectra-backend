"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooManyRequestsError = void 0;
const base_error_1 = require("./base-error");
class TooManyRequestsError extends base_error_1.BaseError {
    constructor(message, metadata) {
        super('TOO_MANY_REQUESTS', 429, message, metadata);
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
//# sourceMappingURL=rate-limit-error.js.map