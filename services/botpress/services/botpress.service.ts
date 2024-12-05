// services/botpress/services/botpress.service.ts

import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Logger } from '@shared/utils/logger';
import { ChatMessage, ChatResponse, HandoffRequest, HandoffResponse } from '../types/chat.types';
import { BotpressServiceError } from '../utils/errors';
import { MetricsService } from '@shared/utils/metrics';
import { 
  BOTPRESS_CONFIG, 
  CHAT_CONFIG, 
  MONITORING_CONFIG,
  ERROR_CODES,
  DEFAULT_HEADERS 
} from '../config/config';

export class BotpressService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly client: AxiosInstance;

  constructor() {
    this.logger = new Logger('BotpressService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    
    this.client = axios.create({
      baseURL: BOTPRESS_CONFIG.webhookUrl,
      timeout: CHAT_CONFIG.REQUEST_TIMEOUT,
      headers: {
        ...DEFAULT_HEADERS,
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig & { metadata?: any }) => {
        const requestId = Math.random().toString(36).substring(7);
        this.logger.info('Outgoing request to Botpress', {
          requestId,
          method: config.method,
          url: config.url
        });

        // Add request timing
        config.metadata = { startTime: Date.now(), requestId };
        return config;
      },
      (error) => {
        this.logger.error('Request configuration error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const { startTime, requestId } = response.config.data || {};
        if (startTime) {
          const duration = Date.now() - startTime;
          this.metrics.recordLatency('BotpressRequestDuration', duration);
          
          this.logger.info('Botpress request completed', {
            requestId,
            duration,
            status: response.status
          });
        }
        return response;
      },
      (error) => {
        const { startTime, requestId } = error.config?.metadata || {};
        if (startTime) {
          const duration = Date.now() - startTime;
          this.metrics.incrementCounter('BotpressErrors');
          
          this.logger.error('Botpress request failed', {
            requestId,
            duration,
            error: error.message,
            status: error.response?.status
          });
        }
        
        throw this.handleError(error);
      }
    );
  }

  private handleError(error: any): Error {
    if (error.response) {
      // La petición fue realizada y el servidor respondió con un código de error
      return new BotpressServiceError(
        ERROR_CODES.CHAT.MESSAGE_FAILED,
        `Botpress request failed with status ${error.response.status}`,
        error.response.data
      );
    } else if (error.request) {
      // La petición fue realizada pero no se recibió respuesta
      return new BotpressServiceError(
        ERROR_CODES.SYSTEM.NETWORK_ERROR,
        'No response received from Botpress',
        { request: error.request }
      );
    } else {
      // Error en la configuración de la petición
      return new BotpressServiceError(
        ERROR_CODES.SYSTEM.CONFIG_ERROR,
        'Error configuring Botpress request',
        { message: error.message }
      );
    }
  }

  async sendMessage(message: ChatMessage): Promise<ChatResponse> {
    try {
      this.logger.info('Sending message to Botpress', {
        conversationId: message.conversationId,
        userId: message.userId
      });

      const response = await this.client.post('', message);
      
      this.metrics.incrementCounter('BotpressMessages');
      
      this.logger.info('Message sent successfully', {
        conversationId: message.conversationId,
        responseLength: response.data.responses?.length || 0
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to send message', {
        error,
        conversationId: message.conversationId
      });
      throw error;
    }
  }

  async initiateHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    try {
      this.logger.info('Initiating handoff request', {
        conversationId: request.conversation_id,
        userId: request.userId
      });

      const response = await this.client.post('/handoff', request);
      
      this.metrics.incrementCounter('BotpressHandoffs');
      
      this.logger.info('Handoff initiated successfully', {
        conversationId: request.conversation_id,
        status: response.data.status
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to initiate handoff', {
        error,
        conversationId: request.conversation_id
      });
      throw error;
    }
  }

  async checkBotHealth(): Promise<boolean> {
    try {
      await this.client.get('/status');
      this.metrics.recordMetric('BotpressHealth', 1);
      return true;
    } catch (error) {
      this.metrics.recordMetric('BotpressHealth', 0);
      this.logger.error('Bot health check failed', { error });
      return false;
    }
  }
}