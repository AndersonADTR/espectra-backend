// services/botpress/services/chat/botpress-chat.service.ts

import axios, { AxiosInstance } from 'axios';
import { CHAT_API_CONFIG, MESSAGE_TEMPLATES } from '../../config/chat-api.config';
import { BotpressError } from '../../utils/errors';
import { 
  ChatMessage, 
  ChatResponse, 
  HandoffRequest 
} from '../../types/chat.types';
import { BaseService } from '../base/base.service';
import { RetryHandlerService } from '../retry/retry-handler.service';
import { HANDOFF_CONFIG } from '@services/botpress/config/config';

export class BotpressChatService extends BaseService {
  private readonly client: AxiosInstance;
  private readonly retryHandler: RetryHandlerService;

  constructor() {
    super('BotpressChatService');
    
    this.client = axios.create({
      baseURL: CHAT_API_CONFIG.BASE_URL,
      timeout: CHAT_API_CONFIG.TIMEOUTS.REQUEST,
      headers: CHAT_API_CONFIG.HEADERS
    });

    this.retryHandler = new RetryHandlerService();
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        this.logger.info('Outgoing request to Botpress Chat API', {
          requestId,
          method: config.method,
          url: config.url
        });
        config.params = { startTime: Date.now(), requestId };
        return config;
      },
      (error) => {
        this.logger.error('Request configuration error', { error });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config.params?.startTime || 0);
        this.metrics.recordLatency('BotpressResponseTime', duration);
        return response;
      },
      (error) => {
        this.metrics.incrementCounter('BotpressErrors');
        throw new BotpressError('Chat API request failed', error);
      }
    );
  }

  async sendMessage(message: ChatMessage): Promise<ChatResponse> {
    return this.retryHandler.withRetry({
      execute: async () => {
        const response = await this.client.post('', {
          message: message.message,
          conversation_id: message.conversationId,
          userId: message.userId,
          metadata: {
            ...message.metadata,
            timestamp: new Date().toISOString()
          }
        });

        this.metrics.incrementCounter('MessagesSent');
        return this.processResponse(response.data);
      },
      onSuccess: async (result) => {
        if (this.shouldInitiateHandoff(result)) {
          await this.initiateHandoff({
            conversation_id: message.conversationId,
            userId: message.userId,
            message: message.message,
            timestamp: new Date().toISOString(),
            metadata: message.metadata,
            priority: HANDOFF_CONFIG.DEFAULT_PRIORITY
          });
        }
      },
      onFinalFailure: async (error) => {
        this.logger.error('Failed to send message after retries', {
          error,
          messageId: message.conversationId
        });
      }
    });
  }

  private processResponse(response: any): ChatResponse {
    return {
      responses: response.responses.map((r: any) => ({
        message: r.message,
        conversation_id: r.conversation_id,
        type: r.type,
        tags: r.tags,
        metadata: {
          handoff: r.metadata?.handoff,
          confidence: r.metadata?.confidence,
          context: r.metadata?.context
        }
      }))
    };
  }

  private shouldInitiateHandoff(response: ChatResponse): boolean {
    return response.responses.some(r => 
      r.type === CHAT_API_CONFIG.MESSAGE_TYPES.HANDOFF ||
      r.metadata?.handoff?.requested ||
      (r.metadata?.confidence && r.metadata.confidence < CHAT_API_CONFIG.HANDOFF.CONFIDENCE_THRESHOLD) ||
      this.containsHandoffTrigger(r.message)
    );
  }

  private containsHandoffTrigger(message: string): boolean {
    return CHAT_API_CONFIG.HANDOFF.AUTO_TRIGGER_PATTERNS.some(
      pattern => message.toLowerCase().includes(pattern)
    );
  }

  async initiateHandoff(request: HandoffRequest): Promise<void> {
    try {
      await this.client.post('/handoff', {
        conversation_id: request.conversation_id,
        userId: request.userId,
        message: request.message,
        metadata: request.metadata
      });

      this.metrics.incrementCounter('HandoffRequests');
      
      this.logger.info('Handoff initiated', {
        conversationId: request.conversation_id,
        userId: request.userId
      });
    } catch (error) {
      this.handleError(error as Error, 'Failed to initiate handoff', {
        operationName: 'InitiateHandoff',
        conversationId: request.conversation_id
      });
    }
  }
}