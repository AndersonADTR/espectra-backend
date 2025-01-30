// services/botpress/handlers/chat-session.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ChatSessionService } from '../services/chat/chat-session.service';
import { WebSocketService } from '../../websocket/services/websocket.service';
import { BaseService } from '../services/base/base.service';

class ChatSessionHandler extends BaseService {
  private readonly sessionService: ChatSessionService;
  private readonly wsService: WebSocketService;

  constructor() {
    super('ChatSessionHandler');
    this.sessionService = new ChatSessionService();
    this.wsService = new WebSocketService();
  }

  async startSession(event: any): Promise<any> {
    try {
      const { userId, conversationId } = JSON.parse(event.body || '{}');
      
      if (!userId || !conversationId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Missing required fields' })
        };
      }

      const session = await this.sessionService.createSession(userId, conversationId);

      await this.wsService.sendToUser(userId, {
        type: 'SESSION_STARTED',
        content: 'Chat session started',
        conversationId,
        timestamp: new Date().toISOString(),
        metadata: {
          sessionId: session.sessionId
        }
      });

      return {
        statusCode: 200,
        body: JSON.stringify(session)
      };
    } catch (error) {
      this.handleError(error, 'Failed to start chat session');
    }
  }

  async endSession(event: any): Promise<any> {
    try {
      const { sessionId } = JSON.parse(event.body || '{}');
      
      if (!sessionId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Session ID is required' })
        };
      }

      await this.sessionService.endSession(sessionId);

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Session ended successfully' })
      };
    } catch (error) {
      this.handleError(error, 'Failed to end chat session');
    }
  }
}

const handler = new ChatSessionHandler();

export const startSession: APIGatewayProxyHandler = async (event) => {
  return handler.startSession(event);
};

export const endSession: APIGatewayProxyHandler = async (event) => {
  return handler.endSession(event);
};