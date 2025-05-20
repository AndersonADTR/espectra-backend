import { WSConnectionStatus, WSConnection, WSMetadata } from '../types/websocket.types';
export declare class Connection implements WSConnection {
    readonly connectionId: string;
    readonly userId: string;
    timestamp: string;
    status: WSConnectionStatus;
    metadata?: WSMetadata;
    readonly ttl?: number;
    constructor(data: WSConnection);
    static create(data: WSConnection): Connection;
    static createFromRequest(connectionId: string, userId: string, metadata?: Record<string, any>): Connection;
    updateStatus(status: WSConnectionStatus): void;
    updateLastActivity(): void;
    isActive(): boolean;
    private calculateTTL;
}
//# sourceMappingURL=connection.d.ts.map