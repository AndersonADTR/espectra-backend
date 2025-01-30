import { WSConnectionStatus, WSConnection, WSMetadata } from '../types/websocket.types';

export class Connection implements WSConnection {
  readonly connectionId: string;
  readonly userId: string;
  timestamp: string;
  status: WSConnectionStatus;
  metadata?: WSMetadata;
  readonly ttl?: number;

  constructor(data: WSConnection) {
    this.connectionId = data.connectionId;
    this.userId = data.userId;
    this.timestamp = data.timestamp;
    this.status = data.status;
    this.metadata = data.metadata;
    this.ttl = this.calculateTTL();
  }

  static create(data: WSConnection): Connection {
    return new Connection(data);
  }

  static createFromRequest(
    connectionId: string, 
    userId: string, 
    metadata?: Record<string, any>
  ): Connection {
    const now = new Date().toISOString();
    return new Connection({
      connectionId,
      userId,
      timestamp: now,
      status: 'CONNECTED',
      metadata: {
        userAgent: metadata?.['User-Agent'],
        platform: metadata?.platform,
        createdAt: now,
        lastActivity: now
      }
    });
  }

  updateStatus(status: WSConnectionStatus): void {
    this.status = status;
    this.timestamp = new Date().toISOString();
    this.updateLastActivity();
  }

  updateLastActivity(): void {
    if (this.metadata) {
      this.metadata.lastActivity = new Date().toISOString();
    }
  }

  isActive(): boolean {
    return this.status === 'CONNECTED' || this.status === 'IN_PROGRESS';
  }

  private calculateTTL(): number {
    // 24 horas + tiempo actual en segundos
    return Math.floor(Date.now() / 1000) + (24 * 60 * 60);
  }
}