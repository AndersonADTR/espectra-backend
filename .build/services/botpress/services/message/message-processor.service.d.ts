export interface ProcessedMessage {
    messageId: string;
    conversationId: string;
    userId: string;
    content: any;
    timestamp: string;
    type: string;
    metadata?: Record<string, any>;
}
export interface IncomingMessage {
    userId: string;
    connectionId?: string;
    conversationId?: string;
    content: string | any;
    type?: string;
    metadata?: Record<string, any>;
}
export declare class MessageProcessorService {
    private static instance;
    private readonly contextService;
    private readonly tokenService;
    private readonly botpressService;
    private readonly websocketService;
    private readonly handoffDetectionService;
    private readonly messageTransformer;
    private readonly logger;
    private readonly metrics;
    private constructor();
    static getInstance(): MessageProcessorService;
    processIncomingMessage(message: IncomingMessage): Promise<ProcessedMessage>;
    private validateMessage;
    private checkForHandoff;
}
//# sourceMappingURL=message-processor.service.d.ts.map