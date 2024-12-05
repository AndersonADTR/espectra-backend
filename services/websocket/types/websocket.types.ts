// services/websocket/types/websocket.types.ts

export interface WSConnection {
  connectionId: string;
  userId: string;
  timestamp: string;
  status: WSConnectionStatus;
  metadata?: {
    userAgent?: string;
    lastActivity?: string;
    platform?: string;
  };
}
  
export interface WSMessage {
  type: WSMessageType;
  content: string;
  conversationId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}
  
export type WSConnectionStatus = 'CONNECTED' | 'IN_PROGRESS' | 'DISCONNECTED';

export type WSMessageType = 
  | 'USER_MESSAGE'
  | 'BOT_RESPONSE'
  | 'HANDOFF_REQUEST'
  | 'HANDOFF_ACCEPTED'
  | 'HANDOFF_REJECTED'
  | 'HANDOFF_STARTED'
  | 'HANDOFF_COMPLETED'
  | 'HANDOFF_STATUS'
  | 'SYSTEM_MESSAGE'
  | 'TYPING_INDICATOR'
  | 'READ_RECEIPT'
  | 'MESSAGE_DELIVERED'
  | 'MESSAGE_READ'
  | 'ERROR';

export interface WSErrorResponse {
  type: 'ERROR';
  code: string;
  message: string;
  timestamp: string;
  conversationId?: string;
}

export interface WSSuccessResponse {
  type: WSMessageType;
  content: string;
  conversationId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}