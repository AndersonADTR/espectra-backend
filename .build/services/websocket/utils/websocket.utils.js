"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidWebSocketMessage = isValidWebSocketMessage;
exports.createWebSocketErrorResponse = createWebSocketErrorResponse;
exports.createWebSocketResponse = createWebSocketResponse;
exports.isConnectionExpired = isConnectionExpired;
const websocket_1 = require("../config/websocket");
const logger_1 = require("@shared/utils/logger");
const logger = new logger_1.Logger('WebSocketUtils');
function isValidWebSocketMessage(message) {
    try {
        return (message &&
            typeof message.type === 'string' &&
            typeof message.content === 'string' &&
            typeof message.conversationId === 'string' &&
            typeof message.timestamp === 'string');
    }
    catch (error) {
        logger.error('Invalid WebSocket message format', { error, message });
        return false;
    }
}
function createWebSocketErrorResponse(message, code = websocket_1.WebSocketConfig.ERROR_CODES.SERVER_ERROR, details) {
    const response = {
        type: 'ERROR',
        code,
        message,
        timestamp: new Date().toISOString()
    };
    if (details) {
        response.details = details;
    }
    return response;
}
function createWebSocketResponse(type, content, conversationId, metadata) {
    return {
        type,
        content,
        conversationId,
        timestamp: new Date().toISOString(),
        metadata
    };
}
function isConnectionExpired(lastActivity, timeoutSeconds = websocket_1.WebSocketConfig.CONNECTION_TIMEOUT) {
    const lastActivityTime = new Date(lastActivity).getTime();
    const currentTime = Date.now();
    return (currentTime - lastActivityTime) > (timeoutSeconds * 1000);
}
//# sourceMappingURL=websocket.utils.js.map