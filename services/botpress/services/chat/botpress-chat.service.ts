// services/botpress/services/chat/botpress-chat.service.ts

import axios, { AxiosInstance } from 'axios';
import { BOTPRESS_CONFIG } from 'services/botpress/config/config';
import { BotpressError } from 'services/botpress/utils/errors';
import { 
  ChatMessage, 
  ChatResponse, 
  ConversationContext,
  ProcessMessageRequest 
} from 'services/botpress/types/chat.types';
import { BaseService } from '../base/base.service';

export class BotpressChatService extends BaseService {

  private readonly requestTimeout = 10000;
  private readonly client: AxiosInstance;

  constructor() {
    super('BotpressChatService');
    
    this.client = axios.create({
      baseURL: BOTPRESS_CONFIG.webhookUrl,
      timeout: this.requestTimeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        const requestId = Math.random().toString(36).substring(7);
        this.logger.info('Outgoing request to Botpress', {
          requestId,
          url: config.url
        });
        return config;
      },
      (error) => {
        this.logger.error('Request configuration error', { error });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.metrics.recordLatency('BotpressResponseTime', Date.now() - response.config.data?.startTime);
        return response;
      },
      (error) => {
        this.metrics.incrementCounter('BotpressErrors');
        this.logger.error('Botpress request failed', { error });
        throw new BotpressError('Failed to communicate with Botpress', error);
      }
    );
  }

  async sendMessage(message: ChatMessage): Promise<ChatResponse> {
    try {
      const startTime = Date.now();
      
      const response = await this.client.post('', {
        conversation_id: message.conversationId,
        message: message.text,
        userId: message.userId,
        metadata: message.metadata
      });

      this.metrics.incrementCounter('BotpressMessages');
      this.metrics.recordLatency('BotpressProcessingTime', Date.now() - startTime);

      this.logger.info('Message sent successfully to Botpress', {
        conversationId: message.conversationId,
        userId: message.userId
      });

      return this.processResponse(response.data);
    } catch (error) {
      this.handleError(error, 'Failed to send message to Botpress', {
        operationName: 'SendMessage',
        conversationId: message.conversationId,
        userId: message.userId
      });
    }
  }

  async processMessage(request: ProcessMessageRequest): Promise<ChatResponse> {
    try {
      this.logger.info('Processing message', {
        conversationId: request.conversationId,
        userId: request.userId
      });
  
      const message: ChatMessage = {
        conversationId: request.conversationId,
        message: request.text,
        userId: request.userId,
        metadata: {
          ...request.metadata,
          timestamp: new Date().toISOString()
        },
        text: undefined
      };
  
      const response = await this.sendMessage(message);
  
      this.metrics.incrementCounter('ProcessedMessages');
      this.metrics.recordLatency('MessageProcessingTime', Date.now());
  
      return response;
    } catch (error) {
      this.handleError(error, 'Failed to process message', {
        operationName: 'ProcessMessage',
        conversationId: request.conversationId,
        userId: request.userId
      });
    }
  }

  private processResponse(response: any): ChatResponse {
    // Verificar si la respuesta indica necesidad de human handoff
    const needsHandoff = this.checkForHandoff(response);
    
    return {
        responses: response.responses.map((r: any) => ({
            message: r.message,
            conversation_id: r.conversation_id,
            type: r.type,
            tags: r.tags,
            metadata: {
                handoff: {
                    requested: r.metadata?.handoff?.requested,
                    reason: r.metadata?.handoff?.reason
                },
                confidence: r.metadata?.confidence,
                context: r.metadata?.context
            }
        }))
    }
  }

  private checkForHandoff(response: any): boolean {
    return response.responses.some((r: any) => (
      r.type === 'handoff' ||
      r.tags?.includes('handoff') ||
      r.metadata?.handoff?.requested ||
      r.confidence < BOTPRESS_CONFIG.HANDOFF_CONFIDENCE_THRESHOLD
    ));
  }

  async getConversationContext(conversationId: string): Promise<ConversationContext> {
    try {
      const response = await this.client.get(`/conversations/${conversationId}/context`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to get conversation context', {
        operationName: 'GetConversationContext',
        conversationId
      });
    }
  }

  async updateConversationContext(
    conversationId: string, 
    context: Partial<ConversationContext>
  ): Promise<void> {
    try {
      await this.client.post(`/conversations/${conversationId}/context`, context);
      
      this.logger.info('Conversation context updated', {
        conversationId,
        contextKeys: Object.keys(context)
      });
    } catch (error) {
      this.handleError(error, 'Failed to update conversation context', {
        operationName: 'UpdateConversationContext',
        conversationId
      });
    }
  }
}