"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketConfig = void 0;
exports.WebSocketConfig = {
    PATH: '/ws',
    PING_INTERVAL: 30000,
    PING_TIMEOUT: 10000,
    RECONNECT_INTERVAL: 5000,
    MAX_RECONNECT_ATTEMPTS: 5,
    CONNECTION_TIMEOUT: 300,
    ERROR_CODES: {
        INVALID_MESSAGE: 4000,
        AUTH_FAILED: 4001,
        RATE_LIMIT: 4002,
        INVALID_STATE: 4003,
        SERVER_ERROR: 4500
    },
    MESSAGE_TYPES: {
        PING: 'PING',
        PONG: 'PONG',
        ERROR: 'ERROR',
        RECONNECT: 'RECONNECT'
    }
};
//# sourceMappingURL=websocket.js.map