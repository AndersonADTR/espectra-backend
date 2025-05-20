export declare enum HandoffStatus {
    PENDING = "PENDING",
    ASSIGNED = "ASSIGNED",
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    TIMEOUT = "TIMEOUT"
}
export declare enum AdvisorStatus {
    AVAILABLE = "AVAILABLE",
    BUSY = "BUSY",
    AWAY = "AWAY",
    OFFLINE = "OFFLINE"
}
export interface HandoffRequest {
    handoffId: string;
    conversationId: string;
    userId: string;
    status: HandoffStatus;
    reason: string;
    createdAt: string;
    updatedAt: string;
    assignedAdvisorId?: string;
    priorityLevel: number;
    metadata?: Record<string, any>;
}
export interface AdvisorState {
    advisorId: string;
    name: string;
    status: AdvisorStatus;
    activeHandoffs: number;
    lastActivityAt: string;
    skills: string[];
    metadata?: Record<string, any>;
}
export declare class AdvisorQueueService {
    private static instance;
    private readonly dynamoDbClient;
    private readonly sqsClient;
    private readonly eventBridgeClient;
    private readonly logger;
    private readonly metrics;
    private readonly handoffTableName;
    private readonly advisorTableName;
    private readonly handoffQueueUrl;
    private readonly eventBusName;
    private constructor();
    static getInstance(): AdvisorQueueService;
    createHandoffRequest(conversationId: string, userId: string, reason: string, priorityLevel?: number, metadata?: Record<string, any>): Promise<HandoffRequest>;
    getAdvisorInfo(advisorId: string): Promise<AdvisorState>;
    getHandoffRequest(handoffId: string): Promise<HandoffRequest | null>;
    updateHandoffStatus(handoffId: string, status: HandoffStatus, advisorId?: string): Promise<HandoffRequest>;
    getPendingHandoffs(limit?: number): Promise<HandoffRequest[]>;
    getAvailableAdvisors(): Promise<AdvisorState[]>;
    updateAdvisorStatus(advisorId: string, status: AdvisorStatus): Promise<AdvisorState>;
    assignNextHandoff(): Promise<{
        handoff: HandoffRequest;
        advisor: AdvisorState;
    } | null>;
}
//# sourceMappingURL=advisor-queue.service.d.ts.map