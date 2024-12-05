// utils/websocket.utils.ts

import { WSMessage, WSErrorResponse } from '../types/websocket.types';

export function isValidWebSocketMessage(message: any): message is WSMessage {
  return (
    message &&
    typeof message.action === 'string' &&
    message.payload !== undefined
  );
}

export function createWebSocketErrorResponse(error: string, code?: number): WSErrorResponse {
  return {
    message: error,
    code: (code ?? 400).toString(),
    type: 'ERROR',
    timestamp: new Date().toISOString()
  };
}