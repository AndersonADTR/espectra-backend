import { WebSocketErrorCode, WebSocketSystemMessageType } from '../config/websocket';

export interface WSMetadata {
  userAgent?: string;
  lastActivity?: string;
  platform?: string;
  createdAt?: string;
  inHandoff?: boolean;
  [key: string]: any;
}

export interface WSConnection {
  connectionId: string;
  userId: string;
  timestamp: string;
  status: WSConnectionStatus;
  metadata?: WSMetadata;
  ttl?: number;
}

export interface WSMessage {
  type: WSMessageType;
  content: string;
  conversationId: string;
  timestamp: string;
  metadata?: WSMetadata;
}

export type WSConnectionStatus = 'CONNECTED' | 'IN_PROGRESS' | 'DISCONNECTED';

export type WSMessageType =
  | 'USER_MESSAGE'
  | 'AGENT_MESSAGE'
  | 'BOT_RESPONSE'
  | 'SESSION_STARTED'
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
  | 'MESSAGE_RECEIVED'
  | 'ERROR'
  | WebSocketSystemMessageType;

export interface WSErrorResponse {
  type: 'ERROR';
  code: WebSocketErrorCode;
  message: string;
  timestamp: string;
  conversationId?: string;
  details?: Record<string, any>;
}

export interface WSSuccessResponse {
  type: WSMessageType;
  content: string;
  conversationId: string;
  timestamp: string;
  metadata?: WSMetadata;
}

export interface WSEvent {
  connectionId: string;
  timestamp: string;
  type: string;
  data?: any;
}