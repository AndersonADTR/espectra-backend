import { Connection } from '../models/connection';
import { WSConnectionStatus } from '../types/websocket.types';
export declare class ConnectionService {
    private readonly logger;
    private readonly metrics;
    private readonly ddb;
    private readonly tableName;
    constructor();
    createConnection(connectionId: string, userId: string, metadata?: Record<string, any>): Promise<Connection>;
    getConnection(connectionId: string): Promise<Connection | null>;
    saveConnection(connection: Connection): Promise<void>;
    updateConnectionStatus(connectionId: string, status: WSConnectionStatus): Promise<void>;
    deleteConnection(connectionId: string): Promise<void>;
    getConnectionsByUserId(userId: string): Promise<Connection[]>;
}
//# sourceMappingURL=connection.service.d.ts.map