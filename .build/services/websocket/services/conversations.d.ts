import { WSMessage } from '../types/websocket.types';
import { Connection } from '../models/connection';
export declare class ConversationsService {
    private static instance;
    private readonly logger;
    private readonly metrics;
    private readonly botpressService;
    private readonly contextService;
    constructor();
    static getInstance(): ConversationsService;
    createConversation(userId: string, initialMessage?: string, metadata?: Record<string, any>): Promise<string>;
    createConversationFromConnection(connection: Connection, initialMessage?: string): Promise<{
        conversationId: string;
        welcomeMessage: WSMessage;
    }>;
    getUserActiveConversations(userId: string): Promise<any[]>;
    getOrCreateConversation(userId: string, metadata?: Record<string, any>): Promise<{
        conversationId: string;
        isNew: boolean;
    }>;
    getOrCreateConversationFromConnection(connection: Connection): Promise<{
        conversationId: string;
        welcomeMessage: WSMessage;
        isNew: boolean;
    }>;
}
//# sourceMappingURL=conversations.d.ts.map