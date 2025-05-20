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
    getOrCreateConversation(conversationId: string, userId?: string): Promise<any>;
    sendMessage(conversationId: string, message: string | BotpressMessage, userId?: string): Promise<BotpressResponse>;
    createUser(userId: string, name: string): Promise<BotpressUserCreate>;
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
}
//# sourceMappingURL=botpress.service.d.ts.map