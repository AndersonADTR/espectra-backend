import { WSMessage } from '../types/websocket.types';
export declare class WebSocketService {
    private readonly apiGatewayClient;
    private readonly dynamoDbClient;
    private readonly connectionService;
    private readonly logger;
    private readonly metrics;
    private readonly connectionsTableName;
    private readonly apiGatewayEndpoint;
    constructor();
    getUserIdFromConversation(conversationId: string): Promise<string | null>;
    getConnectionIdFromUserId(userId: string): Promise<string | null>;
    sendMessage(connectionId: string, message: WSMessage | any): Promise<boolean>;
    sendMessageToConversation(conversationId: string, message: WSMessage | any): Promise<boolean>;
    sendMessageToUser(userId: string, message: WSMessage | any, guaranteedDelivery?: boolean): Promise<number>;
    broadcastMessage(message: WSMessage | any, userIds?: string[]): Promise<number>;
    getUserIdFromConnection(connectionId: string): Promise<string | null>;
}
//# sourceMappingURL=websocket.service.d.ts.map