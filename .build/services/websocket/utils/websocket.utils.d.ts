import { WSMessage, WSErrorResponse, WSSuccessResponse, WSMessageType } from '../types/websocket.types';
import { WebSocketErrorCode } from '../config/websocket';
export declare function isValidWebSocketMessage(message: any): message is WSMessage;
export declare function createWebSocketErrorResponse(message: string, code?: WebSocketErrorCode, details?: Record<string, any>): WSErrorResponse;
export declare function createWebSocketResponse(type: WSMessageType, content: string, conversationId: string, metadata?: Record<string, any>): WSSuccessResponse;
export declare function isConnectionExpired(lastActivity: string, timeoutSeconds?: number): boolean;
//# sourceMappingURL=websocket.utils.d.ts.map