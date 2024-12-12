// services/websocket/types/connection.types.ts
export interface WebSocketConnectionState {
    connectionId: string;
    userId: string;
    status: 'connected' | 'disconnected' | 'reconnecting';
    lastUpdated: string;
    metadata?: {
      inHandoff?: boolean;
      lastDisconnection?: string;
      reconnected?: boolean;
      previousStates?: Array<{
        timestamp: string;
        event: string;
      }>;
      [key: string]: any;
    };
    context?: Record<string, any>;
  }