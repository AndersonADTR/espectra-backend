"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseError = void 0;
class BaseError extends Error {
    code;
    statusCode;
    metadata;
    constructor(code, statusCode, message, metadata) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.metadata = metadata;
        Object.setPrototypeOf(this, new.target.prototype);
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            details: this.metadata
        };
    }
}
exports.BaseError = BaseError;
//# sourceMappingURL=base-error.js.map