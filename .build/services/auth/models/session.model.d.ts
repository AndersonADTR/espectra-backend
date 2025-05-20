export declare enum SessionStatus {
    ACTIVE = "ACTIVE",
    EXPIRED = "EXPIRED",
    TERMINATED = "TERMINATED"
}
export interface SessionAttributes {
    sessionId: string;
    userId: string;
    createdAt: string;
    expiresAt: string;
    lastActivity: string;
    status: SessionStatus;
    metadata?: Record<string, any>;
}
export declare class SessionModel {
    private readonly dynamodb;
    private readonly logger;
    private readonly tableName;
    constructor();
    create(session: SessionAttributes): Promise<SessionAttributes>;
    get(sessionId: string): Promise<SessionAttributes | null>;
    update(sessionId: string, updates: Partial<SessionAttributes>): Promise<SessionAttributes>;
    queryByUser(userId: string, status?: SessionStatus): Promise<SessionAttributes[]>;
}
//# sourceMappingURL=session.model.d.ts.map