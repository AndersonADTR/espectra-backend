// models/connection.ts

import { WSConnectionStatus, WSConnection } from '../types/websocket.types';

export class Connection implements WSConnection {
  connectionId: string;
  userId: string;
  timestamp: string;
  status: WSConnectionStatus;
  metadata?: {
    userAgent?: string;
    lastActivity?: string;
    platform?: string;
  };

  constructor(data: WSConnection) {
    this.connectionId = data.connectionId;
    this.userId = data.userId;
    this.timestamp = data.timestamp;
    this.status = data.status;
    this.metadata = data.metadata;
  }

  static create(data: WSConnection): Connection {
    return new Connection(data);
  }

  static createFromRequest(connectionId: string, userId: string, metadata?: Record<string, any>): Connection {
    return new Connection({
      connectionId,
      userId,
      timestamp: new Date().toISOString(),
      status: 'CONNECTED',
      metadata: {
        userAgent: metadata?.['User-Agent'],
        platform: metadata?.platform,
      },
    });
  }

  updateStatus(status: WSConnectionStatus): void {
    this.status = status;
    this.timestamp = new Date().toISOString();
  }

  updateLastActivity(): void {
    if (this.metadata) {
      this.metadata.lastActivity = new Date().toISOString();
    }
  }
}