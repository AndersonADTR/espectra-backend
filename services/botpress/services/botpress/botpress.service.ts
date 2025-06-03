import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { Logger } from '@shared/utils/logger';
import { TokenManagementService } from '../token/token-management.service';
import { ConversationContextService } from '../context/conversation-context.service';
import { BotpressMessageTransformer } from './transformers/message-transformer.service';
import { ConversationStatus, ConversationType } from '@services/botpress/types/conversation-context.types';
import { HandoffService } from '../handoff/handoff.service';
import { HandoffReason } from '../handoff/handoff-detection.service';
import { UserService } from '../user/user.service';

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

export interface BotpressUserCreate {
  user: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  },
  key: string;
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
  private readonly userService: UserService;
  private readonly defaultHeaders: Record<string, string>;

  constructor() {
    this.logger = new Logger('BotpressApiClient');
    this.userService = UserService.getInstance();

    // Extract webhook ID from the Botpress API URL
    // URL format: https://chat.botpress.cloud/{webhookId}
    const botpressApiUrl = process.env.BOTPRESS_API_URL;

    this.defaultHeaders = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
      // Chat API doesn't use Authorization header, uses x-user-key instead
    };

    this.axios = axios.create({
      baseURL: botpressApiUrl,//`https://chat.botpress.cloud/a3d58c2c-c0bb-4db7-b344-9d87b18316ea`,//`https://chat.botpress.cloud/${this.webhookUrl}`,
      timeout: 10000, // 10 seconds
      headers: this.defaultHeaders
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
        let retryCount = 0;

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
   * @param conversationId Conversation ID
   * @param message Message text or object
   * @param type Message type (text, document, image, etc.)
   * @param userKey User key from Botpress
   * @returns Botpress response
   */
  public async sendMessage(
    conversationId: string,
    message: string | BotpressMessage,
    type: string,
    userKey: string
  ): Promise<BotpressResponse> {
    try {
      // Transform message to Chat API format

      // TODO: Crear lógica para el tipo de mensaje
      const messagePayload = {
        'text': message,
        'type': type
      }

      // Configurar headers con la clave de usuario si se proporciona userId
      const config: AxiosRequestConfig = {};

      if (userKey) {
        config.headers = {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        };
        this.logger.debug('Using dynamic user key for Chat API request', { userKey });
      } else {
        this.logger.warn('Botpress user key not found for user', { userKey });
        throw new Error(`User key not found for user: ${userKey}`);
      }

      // Chat API expects: POST /messages with { conversationId, payload }
      const response = await this.axios.post('/messages', {
        conversationId,
        payload: messagePayload
      }, config);

      return response.data;
    } catch (error) {
      this.logger.error('Error sending message to Chat API', {
        error,
        conversationId,
        userKey: userKey || 'not_provided'
      });
      throw error;
    }
  }

  /**
   * Creates a new user in Botpress
   * @param userId User ID
   * @param name User name
   * @returns Botpress user creation response
   */
  public async createUser(userId: string, name: string): Promise<BotpressUserCreate> {
    try {
      // Para la creación de usuarios no necesitamos x-user-key
      const response = await this.axios.post('/users', {
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          id: userId,
          name: name
        }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Error creating user in Botpress', { error, userId });
      throw error;
    }
  }

  /**
   * Lists all conversations for a user using Chat API
   * @param userKey User key from Botpress
   * @returns List of conversations
   */
  public async listConversations(userKey: string): Promise<any> {
    try {
      const response = await this.axios.get('/conversations', {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error listing conversations from Chat API', { error, userKey });
      throw error;
    }
  }

  /**
   * Gets a specific conversation using Chat API
   * @param conversationId Conversation ID
   * @param userId User ID to get their x-user-key
   * @returns Conversation details
   */
  public async getConversation(conversationId: string, userId: string): Promise<any> {
    try {
      const userKey = await this.userService.getBotpressUserKey(userId);
      if (!userKey) {
        throw new Error(`User key not found for user: ${userId}`);
      }

      const response = await this.axios.get(`/conversations/${conversationId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting conversation from Chat API', { error, conversationId, userId });
      throw error;
    }
  }

  /**
   * Creates a new conversation using Chat API
   * @param userKey User key from Botpress
   * @returns Created conversation
   */
  public async createConversation(userKey: string): Promise<any> {
    try {
      const response = await this.axios.post('/conversations', {}, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error creating conversation in Chat API', { error, userKey });
      throw error;
    }
  }

  /**
   * Gets or creates a conversation using Chat API
   * @param userId User ID to get their x-user-key
   * @param integrationName Optional integration name
   * @returns Conversation (existing or newly created)
   */
  public async getOrCreateConversation(userId: string, integrationName?: string): Promise<any> {
    try {
      const userKey = await this.userService.getBotpressUserKey(userId);
      if (!userKey) {
        throw new Error(`User key not found for user: ${userId}`);
      }

      const payload: any = {};
      if (integrationName) {
        payload.integrationName = integrationName;
      }

      const response = await this.axios.post('/conversations/get-or-create', payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting or creating conversation in Chat API', { error, userId });
      throw error;
    }
  }

  /**
   * Lists messages from a conversation using Chat API
   * @param conversationId Conversation ID
   * @param userKey User key from Botpress
   * @returns List of messages
   */
  public async listMessages(conversationId: string, userKey: string): Promise<any> {
    try {
      

      const response = await this.axios.get(`/conversations/${conversationId}/messages`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error listing messages from Chat API', { error, conversationId, userKey });
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
   * @param userKey User key from Botpress
   * @param message Message text or object
   * @param type Message type (text, document, image, etc.)
   * @param conversationId Optional conversation ID (will be generated if not provided)
   * @param verifyConversationExists
   * @returns Processed response
   */
  public async sendMessage(
    userKey: string,
    message: string | BotpressMessage,
    type: string,
    conversationId?: string,
  ): Promise<BotpressResponse> {
    // Generate conversation ID if not provided
    const actualConversationId = conversationId || `conv-${userKey}-${Date.now()}`;

    try {
      // Estimate token usage
      const estimatedTokens = this.messageTransformer.estimateTokenCount(message);

      // Check if user has enough tokens
      const hasTokens = await this.tokenService.checkTokenAvailability(userKey, estimatedTokens);
      if (!hasTokens) {
        throw new Error('Insufficient tokens for this operation');
      }

      // Get conversation context
      let context = await this.contextService.getContext(actualConversationId);

      // Create new context if it doesn't exist
      if (!context) {
        context = {
          conversationId: actualConversationId,
          userId: userKey,
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
        actualConversationId,
        message,
        type,
        userKey // Pasar el userId para obtener la clave de usuario
      );

      // Consume tokens based on actual usage
      const tokensUsed = response.tokens?.total || estimatedTokens;
      await this.tokenService.consumeTokens(userKey, tokensUsed);

      // Verificar si se necesita handoff basado en la respuesta
      const handoffService = HandoffService.getInstance();
      await handoffService.processMessage(
        actualConversationId,
        userKey,
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
      this.logger.error('Error in Botpress service', { error, userKey, conversationId: actualConversationId });
      throw error;
    }
  }

  /**
   * Creates a new user in Botpress
   * @param userId User ID
   * @param name User name
   * @returns Botpress user creation response
   */
  public async createBotpressUser(userId: string, name: string): Promise<BotpressUserCreate> {
    try {
      const user = await this.apiClient.createUser(userId, name);
      this.logger.info('Botpress user created successfully', {
        user: user.user,
        key: user.key
      });
      return user;
    } catch (error) {
      this.logger.error('Error creating Botpress user', { error, userId });
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
      context
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

  /**
   * Checks if user has an active concierge conversation
   * @param userId User ID
   * @returns Active conversation or null
   */
  public async getActiveConciergeConversation(userKey: string): Promise<any> {
    try {
      // First check our local context for active conversations
      const contexts = await this.contextService.listUserContexts(userKey);
      const activeContext = contexts.find(ctx =>
        ctx.status === ConversationStatus.ACTIVE &&
        ctx.type === ConversationType.BOT
      );

      if (activeContext) {
        this.logger.info('Found active concierge conversation in local context', {
          userKey,
          conversationId: activeContext.conversationId
        });
        return activeContext;
      }

      // If no local active conversation, check Botpress Chat API
      try {
        const botpressConversations = await this.apiClient.listConversations(userKey);
        if (botpressConversations.conversations && botpressConversations.conversations.length > 0) {
          // Get the most recent conversation
          const recentConversation = botpressConversations.conversations[0];

          // Create local context for this conversation if it doesn't exist
          const existingContext = await this.contextService.getContext(recentConversation.id);
          if (!existingContext) {
            const newContext = {
              conversationId: recentConversation.id,
              userId: userKey,
              status: ConversationStatus.ACTIVE,
              type: ConversationType.BOT,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastActivity: Date.now(),
              messages: []
            };
            await this.contextService.saveContext(newContext);
            return newContext;
          }
          return existingContext;
        }
      } catch (error) {
        this.logger.warn('Error checking Botpress conversations, will create new one', { error, userKey });
      }

      return null;
    } catch (error) {
      this.logger.error('Error checking for active concierge conversation', { error, userKey });
      throw error;
    }
  }

  /**
   * Creates a new concierge conversation
   * @param userKey User key from Botpress
   * @returns New conversation context
   */
  public async createConciergeConversation(userKey: string): Promise<any> {
    try {
      // Create conversation in Botpress using Chat API
      const botpressConversation = await this.apiClient.createConversation(userKey);

      // Create local context
      const context = {
        conversationId: botpressConversation.conversation.id,
        userId: userKey,
        status: ConversationStatus.ACTIVE,
        type: ConversationType.BOT,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivity: Date.now(),
        messages: []
      };

      await this.contextService.saveContext(context);

      this.logger.info('Created new concierge conversation', {
        userKey,
        conversationId: context.conversationId
      });

      return context;
    } catch (error) {
      this.logger.error('Error creating concierge conversation', { error, userKey });
      throw error;
    }
  }

  /**
   * Gets conversation messages from Botpress Chat API
   * @param userKey User key from Botpress
   * @param conversationId Conversation ID
   * @returns Messages from Botpress
   */
  public async getConversationMessages(userKey: string, conversationId: string): Promise<any> {
    try {
      // Verify user owns this conversation
      const context = await this.contextService.getContext(conversationId);
      if (!context || context.userId !== userKey) {
        throw new Error('Conversation not found or access denied');
      }

      // Get messages from Botpress Chat API
      const botpressMessages = await this.apiClient.listMessages(conversationId, userKey);

      // Update local context with any new messages
      if (botpressMessages.messages && botpressMessages.messages.length > 0) {
        const contextMessages = botpressMessages.messages.map((msg: any) => ({
          role: msg.direction === 'incoming' ? 'user' : 'assistant',
          content: msg.payload?.text || JSON.stringify(msg.payload),
          timestamp: new Date(msg.createdAt).getTime()
        }));

        await this.contextService.updateContext(conversationId, {
          messages: contextMessages,
          updatedAt: Date.now()
        });
      }

      return botpressMessages;
    } catch (error) {
      this.logger.error('Error getting conversation messages', { error, userKey, conversationId });
      throw error;
    }
  }

  /**
   * Opens a session for a conversation (marks as active)
   * @param userId User ID
   * @param conversationId Conversation ID
   */
  public async openSession(userId: string, conversationId: string): Promise<void> {
    try {
      const context = await this.contextService.getContext(conversationId);
      if (!context || context.userId !== userId) {
        throw new Error('Conversation not found or access denied');
      }

      await this.contextService.updateContext(conversationId, {
        status: ConversationStatus.ACTIVE,
        lastActivity: Date.now(),
        updatedAt: Date.now()
      });

      this.logger.info('Session opened for conversation', { userId, conversationId });
    } catch (error) {
      this.logger.error('Error opening session', { error, userId, conversationId });
      throw error;
    }
  }

  /**
   * Closes a session for a conversation (marks as inactive)
   * @param userId User ID
   * @param conversationId Conversation ID
   */
  public async closeSession(userId: string, conversationId: string): Promise<void> {
    try {
      const context = await this.contextService.getContext(conversationId);
      if (!context || context.userId !== userId) {
        throw new Error('Conversation not found or access denied');
      }

      await this.contextService.updateContext(conversationId, {
        status: ConversationStatus.INACTIVE,
        lastActivity: Date.now(),
        updatedAt: Date.now()
      });

      this.logger.info('Session closed for conversation', { userId, conversationId });
    } catch (error) {
      this.logger.error('Error closing session', { error, userId, conversationId });
      throw error;
    }
  }
}