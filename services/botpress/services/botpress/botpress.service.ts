import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from '@shared/utils/logger';
import { TokenManagementService } from '../token/token-management.service';
import { ConversationContextService } from '../context/conversation-context.service';
import { BotpressMessageTransformer } from './transformers/message-transformer.service';
import { ConversationStatus, ConversationType } from '@services/botpress/types/conversation-context.types';
import { HandoffService } from '../handoff/handoff.service';
import { HandoffReason } from '../handoff/handoff-detection.service';

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

export interface BotpressResponse {
  messages: BotpressMessage[];
  conversationId: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  metadata?: Record<string, any>;
}

export class BotpressApiClient {
  private readonly axios: AxiosInstance;
  private readonly logger: Logger;
  private readonly maxRetries: number = 3;

  constructor() {
    this.logger = new Logger('BotpressApiClient');
    
    this.axios = axios.create({
      baseURL: process.env.BOTPRESS_API_URL,
      timeout: 10000, // 10 seconds
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOTPRESS_API_KEY}`
      }
    });
    
    // Configure interceptors for error handling and retries
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Response interceptor for logging and error handling
    this.axios.interceptors.response.use(
      response => response,
      async (error: AxiosError) => {
        const config = error.config;
        
        // Add retry count to config if it doesn't exist
        if (!config) return Promise.reject(error);
        
        //@ts-ignore - Adding custom property to config
        let retryCount = retryCount || 0;
        
        this.logger.error('Botpress API error', {
          status: error.response?.status,
          url: config.url,
          method: config.method,
          // @ts-ignore
          retryCount: retryCount
        });
        
        // Retry on network errors or 5xx responses, up to maxRetries
        const shouldRetry = (
          !error.response || 
          (error.response.status >= 500 && error.response.status < 600)
        );
        
        // @ts-ignore
        if (shouldRetry && retryCount < this.maxRetries) {
          // @ts-ignore
          retryCount += 1;
          
          // Exponential backoff: 2^retry * 100ms * random factor
          const delay = Math.pow(2, retryCount) * 100 * (0.5 + Math.random());
          this.logger.info(`Retrying request after ${delay}ms`, { 
            url: config.url, 
            // @ts-ignore
            retryCount: retryCount 
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.axios(config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Sends a message to Botpress
   * @param userId User ID
   * @param conversationId Conversation ID
   * @param message Message text or object
   * @param context Optional conversation context
   * @returns Botpress response
   */
  public async sendMessage(
    userId: string,
    conversationId: string,
    message: string | BotpressMessage,
    context?: any
  ): Promise<BotpressResponse> {
    try {
      const messageObj = typeof message === 'string' 
        ? { type: 'text', payload: { text: message } } 
        : message;
      
      const response = await this.axios.post('/conversations/messages', {
        userId,
        conversationId,
        message: messageObj,
        context
      });
      
      return response.data;
    } catch (error) {
      this.logger.error('Error sending message to Botpress', { 
        error, 
        userId, 
        conversationId 
      });
      throw error;
    }
  }
}

export class BotpressService {
  private static instance: BotpressService;
  private readonly apiClient: BotpressApiClient;
  private readonly tokenService: TokenManagementService;
  private readonly contextService: ConversationContextService;
  private readonly messageTransformer: BotpressMessageTransformer;
  private readonly logger: Logger;

  private constructor() {
    this.apiClient = new BotpressApiClient();
    this.tokenService = TokenManagementService.getInstance();
    this.contextService = ConversationContextService.getInstance();
    this.messageTransformer = new BotpressMessageTransformer();
    this.logger = new Logger('BotpressService');
  }

  public static getInstance(): BotpressService {
    if (!BotpressService.instance) {
      BotpressService.instance = new BotpressService();
    }
    return BotpressService.instance;
  }

  /**
   * Sends a message to Botpress with token management and context handling
   * @param userId User ID
   * @param message Message text or object
   * @param conversationId Optional conversation ID (will be generated if not provided)
   * @returns Processed response
   */
  public async sendMessage(
    userId: string,
    message: string | BotpressMessage,
    conversationId?: string
  ): Promise<BotpressResponse> {
    // Generate conversation ID if not provided
    const actualConversationId = conversationId || `conv-${userId}-${Date.now()}`;
    
    try {
      // Estimate token usage
      const estimatedTokens = this.messageTransformer.estimateTokenCount(message);
      
      // Check if user has enough tokens
      const hasTokens = await this.tokenService.checkTokenAvailability(userId, estimatedTokens);
      if (!hasTokens) {
        throw new Error('Insufficient tokens for this operation');
      }
      
      // Get conversation context
      let context = await this.contextService.getContext(actualConversationId);
      
      // Create new context if it doesn't exist
      if (!context) {
        context = {
          conversationId: actualConversationId,
          userId: userId,
          status: ConversationStatus.ACTIVE,
          type: ConversationType.BOT,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastActivity: Date.now(),
          messages: []
        };
        await this.contextService.saveContext(context);
      }
      
      // Add user message to context
      const userMessage = {
        role: 'user',
        content: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: Date.now()
      };
      
      context.messages.push(userMessage as any);
      await this.contextService.updateContext(actualConversationId, { 
        messages: context.messages,
        updatedAt: Date.now()
      });
      
      // Send message to Botpress
      const response = await this.apiClient.sendMessage(
        userId,
        actualConversationId,
        message,
        context
      );
      
      // Consume tokens based on actual usage
      const tokensUsed = response.tokens.total || estimatedTokens;
      await this.tokenService.consumeTokens(userId, tokensUsed);
  
      // Verificar si se necesita handoff basado en la respuesta
      const handoffService = HandoffService.getInstance();
      await handoffService.processMessage(
        actualConversationId,
        userId,
        typeof message === 'string' ? message : JSON.stringify(message),
        response
      );
      
      // Update context with bot response
      if (response.messages && response.messages.length > 0) {
        for (const botMessage of response.messages) {
          const content = botMessage.type === 'text' && botMessage.payload.text
            ? botMessage.payload.text
            : JSON.stringify(botMessage);
            
          context.messages.push({
            role: 'assistant',
            content,
            timestamp: Date.now()
          } as any);
        }
        
        await this.contextService.updateContext(actualConversationId, { 
          messages: context.messages,
          updatedAt: Date.now()
        });
      }
      
      return response;
    } catch (error) {
      this.logger.error('Error in Botpress service', { error, userId, conversationId: actualConversationId });
      throw error;
    }
  }

  /**
   * Retrieves conversation history
   * @param userId User ID
   * @param conversationId Conversation ID
   * @returns Conversation context with messages
   */
  public async getConversationHistory(userId: string, conversationId: string): Promise<any> {
    try {
      const context = await this.contextService.getContext(conversationId);
      
      if (!context) {
        return null;
      }
      
      // Verify that the conversation belongs to the user
      if (context.userId !== userId) {
        this.logger.warn('User attempted to access conversation they do not own', { 
          userId, 
          conversationId, 
          ownerUserId: context.userId 
        });
        return null;
      }
      
      return context;
    } catch (error) {
      this.logger.error('Error retrieving conversation history', { error, userId, conversationId });
      throw error;
    }
  }

  /**
   * Initiates handoff to an agent
   * @param userId User ID
   * @param conversationId Conversation ID
   */
  public async initiateHandoff(userId: string, conversationId: string): Promise<void> {
    try {
      // Check if the conversation exists and belongs to the user
      const context = await this.contextService.getContext(conversationId);

      if (!context || context.userId !== userId) {
        this.logger.warn('User attempted to initiate handoff for a conversation they do not own', {
          userId,
          conversationId,
          ownerUserId: context?.userId
        });
        return;
      } 
      // Mark the conversation as in handoff
      await this.contextService.updateContext(conversationId, {
        status: ConversationStatus.WITH_ADVISOR,
        updatedAt: Date.now()
      });

      // Initiate handoff process
      const handoffService = HandoffService.getInstance();
      await handoffService.initiateHandoff(userId, conversationId, HandoffReason.COMPLEX_QUERY, 1);
    } catch (error) {
      this.logger.error('Error initiating handoff', { error, userId, conversationId });
      throw error;
    }
  }

  /**
   * Lists all conversations for a user
   * @param userId User ID
   * @returns Array of conversation summaries
   */
  public async listUserConversations(userId: string): Promise<any[]> {
    try {
      const contexts = await this.contextService.listUserContexts(userId);
      
      // Transform to a more client-friendly format
      return contexts.map(context => ({
        conversationId: context.conversationId,
        createdAt: context.createdAt,
        updatedAt: context.updatedAt,
        messageCount: context.messages.length,
        lastMessage: context.messages.length > 0 
          ? context.messages[context.messages.length - 1]
          : null
      }));
    } catch (error) {
      this.logger.error('Error listing user conversations', { error, userId });
      throw error;
    }
  }
}