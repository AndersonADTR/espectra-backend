import { ConversationStatus, ConversationType } from '../../types/conversation-context.types';
export interface ConversationContext {
    conversationId: string;
    userId: string;
    status: ConversationStatus;
    type: ConversationType;
    createdAt: number;
    updatedAt: number;
    lastActivity: number;
    messages: Array<{
        role: 'user' | 'assistant' | 'system' | 'advisor';
        content: string;
        timestamp: number;
        metadata?: Record<string, any>;
    }>;
    botpressContext?: Record<string, any>;
    handoffContext?: {
        handoffCount: number;
        lastAdvisorId?: string;
        lastHandoffReason?: string;
        lastHandoffTimestamp?: number;
    };
    metadata?: Record<string, any>;
    ttl?: number;
}
export declare class ConversationContextService {
    private static instance;
    private readonly dynamoDbClient;
    private readonly cacheService;
    private readonly logger;
    private readonly metrics;
    private readonly tableName;
    private readonly cacheKeyPrefix;
    private readonly defaultTtl;
    private constructor();
    static getInstance(): ConversationContextService;
    getContext(conversationId: string): Promise<ConversationContext | null>;
    saveContext(context: ConversationContext): Promise<ConversationContext>;
    updateContext(conversationId: string, updates: Partial<ConversationContext>): Promise<ConversationContext>;
    deleteContext(conversationId: string): Promise<boolean>;
    listUserContexts(userId: string): Promise<ConversationContext[]>;
    searchConversations(criteria: {
        userId?: string;
        status?: ConversationStatus | ConversationStatus[];
        type?: ConversationType | ConversationType[];
        startDate?: number;
        endDate?: number;
        limit?: number;
        lastEvaluatedKey?: Record<string, any>;
    }): Promise<{
        items: ConversationContext[];
        lastEvaluatedKey?: Record<string, any>;
    }>;
    updateStatus(conversationId: string, status: ConversationStatus): Promise<ConversationContext>;
    updateHandoffContext(conversationId: string, handoffContext: ConversationContext['handoffContext']): Promise<ConversationContext>;
    addMessage(conversationId: string, message: {
        role: 'user' | 'assistant' | 'system' | 'advisor';
        content: string;
        timestamp?: number;
    }): Promise<ConversationContext>;
}
//# sourceMappingURL=conversation-context.service.d.ts.map