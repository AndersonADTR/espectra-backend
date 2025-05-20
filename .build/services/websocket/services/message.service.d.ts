import { WSMessage } from '../types/websocket.types';
import { Connection } from '../models/connection';
export interface MessageQueueItem {
    userId: string;
    connectionId: string;
    message: WSMessage;
    attempts: number;
    nextRetry?: number;
}
export interface HandoffRequest {
    conversationId: string;
    userId: string;
    message: string;
    metadata: Record<string, any>;
    timestamp: string;
    priority: number;
}
export declare class MessageService {
    private static instance;
    private readonly logger;
    private readonly metrics;
    private readonly connectionService;
    private readonly botpressService;
    private readonly webSocketService;
    private readonly contextService;
    private readonly tokenService;
    private readonly conversationsService;
    private readonly messageQueue;
    private readonly MAX_RETRY_ATTEMPTS;
    private readonly RETRY_DELAY_MS;
    private retryInterval;
    constructor();
    static getInstance(): MessageService;
    getConnectionById(connectionId: string): Promise<Connection | null>;
    updateConnectionStatus(connectionId: string, status: string): Promise<void>;
    sendMessage(connectionId: string, message: WSMessage, guaranteedDelivery?: boolean): Promise<void>;
    broadcastMessage(message: WSMessage, userIds?: string[], guaranteedDelivery?: boolean): Promise<void>;
    processUserMessage(connection: Connection, message: WSMessage): Promise<string>;
    notifyHumanAgent(connection: Connection, message: WSMessage): Promise<void>;
    handleAgentResponse(connectionId: string, message: WSMessage): Promise<void>;
    private initiateHandoff;
    private estimateTokenRequirement;
    private isHandoffRequest;
    private isInHandoffState;
    private calculateHandoffPriority;
    private getAvailableAdvisors;
    private queueMessageForRetry;
    private startMessageQueueProcessor;
    private processMessageQueue;
    cleanup(): void;
}
//# sourceMappingURL=message.service.d.ts.map