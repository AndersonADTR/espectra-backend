// services/botpress/services/message-handler.service.ts

import { BotpressChatService } from './chat/botpress-chat.service';
import { TokenManagementService } from './token/token-management.service';
import { ConversationContextService } from './context/conversation-context.service';
import { WebSocketService } from '../../websocket/services/websocket.service';
import { CHAT_API_CONFIG, MESSAGE_TEMPLATES } from '../config/chat-api.config';
import { BaseService } from './base/base.service';
import { ChatMessage, ChatResponse } from '../types/chat.types';
import { WSMessage } from '../../websocket/types/websocket.types';

export class MessageHandlerService extends BaseService {
  private readonly chatService: BotpressChatService;
  private readonly tokenService: TokenManagementService;
  private readonly contextService: ConversationContextService;
  private readonly wsService: WebSocketService;

  constructor() {
    super('MessageHandlerService');
    this.chatService = new BotpressChatService();
    this.tokenService = new TokenManagementService();
    this.contextService = new ConversationContextService();
    this.wsService = new WebSocketService();
  }

  async handleIncomingMessage(wsMessage: WSMessage): Promise<void> {
    const startTime = Date.now();

    try {
      // Validación de tokens
      await this.tokenService.validateAndTrackTokens(
        wsMessage.metadata?.userId,
        this.calculateTokens(wsMessage.content),
        wsMessage.metadata?.planType || 'basic'
      );

      // Preparar mensaje para Botpress
      const chatMessage: ChatMessage = {
        message: wsMessage.content,
        conversationId: wsMessage.conversationId,
        userId: wsMessage.metadata?.userId,
        metadata: {
          timestamp: new Date().toISOString(),
          context: await this.getConversationContext(wsMessage.conversationId),
          ...wsMessage.metadata
        }
      };

      // Enviar mensaje a Botpress
      const response = await this.chatService.sendMessage(chatMessage);

      // Actualizar contexto
      await this.updateContext(wsMessage.conversationId, response);

      // Procesar y enviar respuestas
      await this.handleBotResponse(response, wsMessage);

      // Métricas
      const duration = Date.now() - startTime;
      this.metrics.recordLatency('MessageProcessingTime', duration);
      this.metrics.incrementCounter('MessagesProcessed');

    } catch (error) {
      this.handleError(error, 'Failed to process message', {
        operationName: 'handleIncomingMessage',
        conversationId: wsMessage.conversationId
      });

      // Notificar error al cliente
      await this.wsService.sendMessage(wsMessage.metadata?.connectionId, {
        type: 'ERROR',
        content: MESSAGE_TEMPLATES.ERROR,
        conversationId: wsMessage.conversationId,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async handleBotResponse(response: ChatResponse, originalMessage: WSMessage): Promise<void> {
    const connectionId = originalMessage.metadata?.connectionId;
    if (!connectionId) return;

    for (const botResponse of response.responses) {
      // Enviar indicador de escritura
      await this.wsService.sendMessage(connectionId, {
        type: 'TYPING_INDICATOR',
        content: '',
        conversationId: originalMessage.conversationId,
        timestamp: new Date().toISOString()
      });

      // Pequeña pausa para simular escritura
      await new Promise(resolve => setTimeout(resolve, 500));

      // Enviar respuesta
      await this.wsService.sendMessage(connectionId, {
        type: botResponse.type === 'handoff' ? 'HANDOFF_STATUS' : 'BOT_RESPONSE',
        content: botResponse.message,
        conversationId: originalMessage.conversationId,
        timestamp: new Date().toISOString(),
        metadata: botResponse.metadata
      });
    }
  }

  private async getConversationContext(conversationId: string): Promise<Record<string, any>> {
    const context = await this.contextService.getContext(conversationId);
    return context || {};
  }

  private async updateContext(conversationId: string, response: ChatResponse): Promise<void> {
    const context = await this.contextService.getContext(conversationId);
    const messageCount = (context?.messageCount || 0) + 1;

    await this.contextService.updateContext(conversationId, {
      lastInteraction: new Date().toISOString(),
      messageCount,
      handoffRequested: response.responses.some(r => r.type === 'handoff'),
    });
  }

  private calculateTokens(content: string): number {
    // Implementación básica: 1 token por cada 4 caracteres
    return Math.ceil(content.length / 4);
  }
}