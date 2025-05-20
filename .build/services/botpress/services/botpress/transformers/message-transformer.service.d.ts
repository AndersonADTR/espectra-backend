export interface InternalMessage {
    type: string;
    content: string;
    metadata?: Record<string, any>;
}
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
export declare class BotpressMessageTransformer {
    private readonly logger;
    constructor();
    toBotpressFormat(message: string | InternalMessage): BotpressMessage;
    fromBotpressFormat(message: BotpressMessage): InternalMessage;
    estimateTokenCount(message: string | InternalMessage | BotpressMessage): number;
}
//# sourceMappingURL=message-transformer.service.d.ts.map