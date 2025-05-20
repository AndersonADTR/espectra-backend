export declare enum ConversationStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    TERMINATED = "TERMINATED",
    PENDING_HANDOFF = "PENDING_HANDOFF",
    WITH_ADVISOR = "WITH_ADVISOR"
}
export declare enum ConversationType {
    BOT = "BOT",
    ADVISOR = "ADVISOR",
    MIXED = "MIXED"
}
export interface ConversationContext {
    conversationId: string;
    userId: string;
    status: ConversationStatus;
    type: ConversationType;
    createdAt: string;
    updatedAt: string;
    lastActivity: string;
    lastMessage?: {
        content: string;
        sender: 'user' | 'bot' | 'advisor';
        timestamp: string;
    };
    botpressContext?: {
        variables: Record<string, any>;
        sessionId?: string;
        metadata?: Record<string, any>;
    };
    handoffContext?: {
        handoffCount: number;
        lastAdvisorId?: string;
        lastHandoffReason?: string;
        lastHandoffTimestamp?: string;
    };
    metadata?: {
        userPlan: string;
        topic?: string;
        referencedDocuments?: string[];
        channel?: string;
        primaryIntent?: string;
        tags?: string[];
        customData?: Record<string, any>;
    };
    ttl?: number;
}
export interface ConversationQueryOptions {
    limit?: number;
    nextToken?: string;
    filter?: {
        status?: ConversationStatus | ConversationStatus[];
        type?: ConversationType | ConversationType[];
        startDate?: string;
        endDate?: string;
    };
    sortDirection?: 'ASC' | 'DESC';
}
export interface ConversationQueryResult {
    conversations: ConversationContext[];
    nextToken?: string;
    totalCount?: number;
}
export type ConversationContextUpdates = Partial<Omit<ConversationContext, 'conversationId' | 'userId' | 'createdAt'>>;
//# sourceMappingURL=conversation-context.types.d.ts.map