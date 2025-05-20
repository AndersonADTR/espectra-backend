export interface Session {
    sessionId: string;
    userId: string;
    createdAt: string;
    expiresAt: string;
    lastActivity: string;
    metadata: Record<string, any>;
    status: SessionStatus;
}
export declare enum SessionStatus {
    ACTIVE = "ACTIVE",
    EXPIRED = "EXPIRED",
    TERMINATED = "TERMINATED"
}
export declare class SessionService {
    private readonly logger;
    private readonly cache;
    private readonly dynamodb;
    private readonly metrics;
    private readonly tableName;
    private readonly observability;
    constructor();
    createSession(userId: string, metadata?: Record<string, any>): Promise<Session>;
    getUserActiveSessions(userId: string): Promise<Session[]>;
    getSession(sessionId: string): Promise<Session>;
    updateSession(sessionId: string, metadata: Record<string, any>): Promise<Session>;
    terminateSession(sessionId: string): Promise<void>;
    extendSession(sessionId: string): Promise<Session>;
    terminateAllUserSessions(userId: string): Promise<void>;
    cleanupExpiredSessions(): Promise<void>;
}
//# sourceMappingURL=session.service.d.ts.map