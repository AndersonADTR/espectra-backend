import { APIGatewayProxyHandler } from 'aws-lambda';
import { BotpressChatService } from '../services/chat/botpress-chat.service';
import { ChatSessionService } from '../services/chat/chat-session.service';
import { WebSocketService } from '../../websocket/services/websocket.service';
import { MessageQueueService } from '../services/queue/message-queue.service';
import { BaseService } from '../services/base/base.service';
import { ChatMessage } from '../types/chat.types';

class ChatEventHandler extends BaseService {
  private readonly chatService: BotpressChatService;
  private readonly sessionService: ChatSessionService;
  private readonly wsService: WebSocketService;
  private readonly queueService: MessageQueueService;

  constructor() {
    super('ChatEventHandler');
    this.chatService = new BotpressChatService();
    this.sessionService = new ChatSessionService();
    this.wsService = new WebSocketService();
    this.queueService = new MessageQueueService();
  }

  async handleMessage(event: any): Promise<any> {
    try {
      const message: ChatMessage = JSON.parse(event.body);
      const startTime = Date.now();

      // Verificar y actualizar sesión
      await this.sessionService.updateSession(message.metadata?.sessionId!, message);

      // Encolar mensaje para procesamiento
      await this.queueService.enqueueMessage({
        id: `msg_${Date.now()}`,
        type: 'message',
        payload: message,
        metadata: {
          userId: message.userId,
          timestamp: new Date().toISOString()
        }
      });

      // Enviar indicador de recibido al cliente
      await this.wsService.sendToUser(message.userId, {
        type: 'MESSAGE_RECEIVED',
        content: '',
        conversationId: message.conversationId,
        timestamp: new Date().toISOString()
      });

      this.metrics.recordLatency('MessageHandlingTime', Date.now() - startTime);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Message queued for processing' })
      };
    } catch (error) {
      this.handleError(error, 'Failed to handle chat message');
    }
  }

  async handleTyping(event: any): Promise<any> {
    try {
      const { userId, conversationId } = JSON.parse(event.body);
      
      await this.wsService.sendToUser(userId, {
        type: 'TYPING_INDICATOR',
        content: '',
        conversationId,
        timestamp: new Date().toISOString()
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Typing indicator sent' })
      };
    } catch (error) {
      this.handleError(error, 'Failed to handle typing indicator');
    }
  }
}

const handler = new ChatEventHandler();

export const handleMessage: APIGatewayProxyHandler = async (event) => {
  return handler.handleMessage(event);
};

export const handleTyping: APIGatewayProxyHandler = async (event) => {
  return handler.handleTyping(event);
};