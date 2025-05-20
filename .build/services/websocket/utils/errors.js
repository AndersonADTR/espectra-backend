"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketMessageError = exports.WebSocketConnectionError = exports.WebSocketError = void 0;
const errors_1 = require("@shared/utils/errors");
class WebSocketError extends errors_1.BaseError {
    details;
    statusCode;
    context;
    constructor(message, statusCode = 500, details) {
        super('WEBSOCKET_ERROR', statusCode, message);
        this.details = details;
        this.name = 'WebSocketError';
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, WebSocketError.prototype);
    }
}
exports.WebSocketError = WebSocketError;
class WebSocketConnectionError extends WebSocketError {
    constructor(message, details) {
        super(message, 503, details);
        this.name = 'WebSocketConnectionError';
    }
}
exports.WebSocketConnectionError = WebSocketConnectionError;
class WebSocketMessageError extends WebSocketError {
    constructor(message, details) {
        super(message, 400, details);
        this.name = 'WebSocketMessageError';
    }
}
exports.WebSocketMessageError = WebSocketMessageError;
//# sourceMappingURL=errors.js.map