import { 
  WSMessage, 
  WSErrorResponse, 
  WSSuccessResponse, 
  WSMessageType 
} from '../types/websocket.types';
import { WebSocketConfig, WebSocketErrorCode } from '../config/websocket';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('WebSocketUtils');

export function isValidWebSocketMessage(message: any): message is WSMessage {
  try {
    return (
      message &&
      typeof message.type === 'string' &&
      typeof message.content === 'string' &&
      typeof message.conversationId === 'string' &&
      typeof message.timestamp === 'string'
    );
  } catch (error) {
    logger.error('Invalid WebSocket message format', { error, message });
    return false;
  }
}

export function createWebSocketErrorResponse(
  message: string,
  code: WebSocketErrorCode = WebSocketConfig.ERROR_CODES.SERVER_ERROR,
  details?: Record<string, any>
): WSErrorResponse {
  const response: WSErrorResponse = {
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

export function createWebSocketResponse(
  type: WSMessageType,
  content: string,
  conversationId: string,
  metadata?: Record<string, any>
): WSSuccessResponse {
  return {
    type,
    content,
    conversationId,
    timestamp: new Date().toISOString(),
    metadata
  };
}

export function isConnectionExpired(lastActivity: string, timeoutSeconds: number = WebSocketConfig.CONNECTION_TIMEOUT): boolean {
  const lastActivityTime = new Date(lastActivity).getTime();
  const currentTime = Date.now();
  return (currentTime - lastActivityTime) > (timeoutSeconds * 1000);
}