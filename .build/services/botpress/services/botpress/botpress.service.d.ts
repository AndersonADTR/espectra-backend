export interface BotpressMessage {
    type: string;
    payload: {
        text?: string;
        attachments?: Array<{
            type: string;
            payload: any;
        }>;
        [key: string]: any;
    };
    metadata?: Record<string, any>;
}
export interface BotpressUserCreate {
    user: {
        id: string;
        name: string;
        createdAt: string;
        updatedAt: string;
    };
    key: string;
}
export interface BotpressResponse {
    messages: BotpressMessage[];
    conversationId: string;
    tokens: {
        input: number;
        output: number;
        total: number;
    };
    metadata?: Record<string, any>;
}
export declare class BotpressApiClient {
    private readonly axios;
    private readonly logger;
    private readonly maxRetries;
    private readonly userService;
    private readonly defaultHeaders;
    constructor();
    private setupInterceptors;
    sendMessage(conversationId: string, message: string | BotpressMessage, userId?: string): Promise<BotpressResponse>;
    createUser(userId: string, name: string): Promise<BotpressUserCreate>;
    listConversations(userKey: string): Promise<any>;
    getConversation(conversationId: string, userId: string): Promise<any>;
    createConversation(userKey: string): Promise<any>;
    getOrCreateConversation(userId: string, integrationName?: string): Promise<any>;
    listMessages(conversationId: string, userId: string): Promise<any>;
}
export declare class BotpressService {
    private static instance;
    private readonly apiClient;
    private readonly tokenService;
    private readonly contextService;
    private readonly messageTransformer;
    private readonly logger;
    private constructor();
    static getInstance(): BotpressService;
    sendMessage(userId: string, message: string | BotpressMessage, conversationId?: string, verifyConversationExists?: boolean): Promise<BotpressResponse>;
    createBotpressUser(userId: string, name: string): Promise<BotpressUserCreate>;
    getConversationHistory(userId: string, conversationId: string): Promise<any>;
    initiateHandoff(userId: string, conversationId: string): Promise<void>;
    listUserConversations(userId: string): Promise<any[]>;
    getActiveConciergeConversation(userKey: string): Promise<any>;
    createConciergeConversation(userKey: string): Promise<any>;
    getConversationMessages(userId: string, conversationId: string): Promise<any>;
    openSession(userId: string, conversationId: string): Promise<void>;
    closeSession(userId: string, conversationId: string): Promise<void>;
}
//# sourceMappingURL=botpress.service.d.ts.map