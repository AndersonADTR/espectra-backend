// services/sse/types/sse.types.ts

/**
 * Representa una conexión SSE activa
 */
export interface SSEConnection {
  userId: string;
  conversationId: string;
  userKey: string;
  connectionId: string;
  lastActivity: string;
  status: 'ACTIVE' | 'RECONNECTING' | 'CLOSED';
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Evento recibido desde Botpress SSE
 */
export interface BotpressSSEEvent {
  type: 'message' | 'typing' | 'error' | 'status' | 'conversation_end';
  conversationId: string;
  data: any;
  timestamp: string;
  messageId?: string;
  userId?: string;
}

/**
 * Evento enviado al cliente via SSE
 */
export interface ClientSSEEvent {
  id: string;
  event: string;
  data: string;
  retry?: number;
}

/**
 * Mensaje transformado para envío al cliente
 */
export interface SSEMessage {
  type: 'BOT_RESPONSE' | 'AGENT_MESSAGE' | 'HANDOFF_STATUS' | 'TOKEN_ALERT' | 'ERROR' | 'STATUS';
  conversationId: string;
  content: any;
  timestamp: string;
  messageId?: string;
  metadata?: Record<string, any>;
}

/**
 * Estado de conexión SSE con Botpress
 */
export interface BotpressSSEConnectionState {
  conversationId: string;
  userKey: string;
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'RECONNECTING';
  lastActivity: string;
  reconnectAttempts: number;
  eventSource?: EventSource;
}

/**
 * Configuración para reconexión SSE
 */
export interface SSEReconnectConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

/**
 * Resultado de sincronización de mensajes perdidos
 */
export interface MessageSyncResult {
  success: boolean;
  messagesSynced: number;
  lastMessageId?: string;
  error?: string;
}

/**
 * Estadísticas de conexiones SSE
 */
export interface SSEConnectionStats {
  activeConnections: number;
  totalConnections: number;
  reconnections: number;
  errors: number;
  averageConnectionDuration: number;
}
