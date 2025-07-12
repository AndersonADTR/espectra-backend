import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { Logger } from '@shared/utils/logger';
import { TokenManagementService } from '../token/token-management.service';
import { ConversationContextService } from '../context/conversation-context.service';
import { ConversationMessageService } from '../conversation-message/conversation-message.service';
import { BotpressSyncService } from '../sync/botpress-sync.service';
import { BotpressMessageTransformer } from './transformers/message-transformer.service';
import { ConversationStatus, ConversationType, ConversationContext } from '@services/botpress/types/conversation-context.types';
import { HandoffService } from '../handoff/handoff.service';
import { HandoffReason } from '../handoff/handoff-detection.service';
import { UserService } from '../user/user.service';
import { MessageRole } from '../../models/conversation-message.model';

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

  /**
   * Deletes a conversation from Botpress
   * @param conversationId Conversation ID
   * @param userKey User key from Botpress
   * @returns Deleted conversation object
   */
  public async deleteConversation(
    conversationId: string,
    userKey: string
  ): Promise<any> {
    try {
      this.logger.info('Deleting conversation from Botpress', {
        conversationId,
        userKey: userKey.substring(0, 10) + '...'
      });

      const response = await this.axios.delete(`/conversations/${conversationId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      this.logger.info('Conversation deleted from Botpress successfully', {
        conversationId,
        deletedConversation: response.data
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error deleting conversation from Botpress', {
        error,
        conversationId,
        userKey: userKey.substring(0, 10) + '...'
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
  private readonly messageService: ConversationMessageService;
  private readonly syncService: BotpressSyncService;
  private readonly messageTransformer: BotpressMessageTransformer;
  private readonly logger: Logger;

  private constructor() {
    this.apiClient = new BotpressApiClient();
    this.tokenService = TokenManagementService.getInstance();
    this.contextService = ConversationContextService.getInstance();
    this.messageService = ConversationMessageService.getInstance();
    this.syncService = BotpressSyncService.getInstance();
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
   * @param userBotpressId User's Botpress ID for role identification
   * @returns Processed response
   */
  public async sendMessage(
    userKey: string,
    message: string | BotpressMessage,
    type: string,
    conversationId?: string
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
          messageCount: 0
        };
        await this.contextService.saveContext(context);
      }

      // ✅ NUEVA ESTRATEGIA: NO guardar mensaje del usuario aquí
      // El mensaje se guardará en el próximo polling junto con la respuesta del bot
      // Esto garantiza orden cronológico correcto y evita duplicados

      this.logger.info('📤 SEND MESSAGE: Sending to Botpress only (no local save)', {
        conversationId: actualConversationId,
        userKey: userKey.substring(0, 10) + '...',
        messageLength: typeof message === 'string' ? message.length : JSON.stringify(message).length,
        strategy: 'POLLING_CAPTURE'
      });

      // Send message to Botpress
      this.logger.info('📤 SEND MESSAGE: Calling Botpress API', {
        conversationId: actualConversationId,
        userKey: userKey.substring(0, 10) + '...'
      });

      const response = await this.apiClient.sendMessage(
        actualConversationId,
        message,
        type,
        userKey
      );

      this.logger.info('✅ SEND MESSAGE: Botpress API response received', {
        conversationId: actualConversationId,
        hasMessages: response.messages && response.messages.length > 0,
        messageCount: response.messages?.length || 0
      });

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

      // ✅ NUEVA ESTRATEGIA: NO guardar NINGÚN mensaje aquí
      // Tanto el mensaje del usuario como las respuestas del bot se capturarán en polling
      // Esto garantiza orden cronológico perfecto y cero duplicados

      const currentTimestamp = Date.now();

      // Solo actualizar el contexto para indicar actividad
      await this.contextService.updateContext(actualConversationId, {
        lastActivity: currentTimestamp,
        updatedAt: currentTimestamp,
        status: 'ACTIVE' as any
      });

      this.logger.info('✅ SEND MESSAGE: Message sent successfully, will be captured in next polling', {
        conversationId: actualConversationId,
        botResponseCount: response.messages?.length || 0,
        strategy: 'POLLING_CAPTURE_ALL',
        tokensUsed
      });

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
        messageCount: context.messageCount || 0,
        lastMessageId: context.lastMessageId,
        lastMessageTimestamp: context.lastMessageTimestamp
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
              messageCount: 0
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
   * Gets conversation messages from local store only (OPTIMIZED STRATEGY)
   * No synchronization with Botpress - super fast response
   * @param userKey User key from Botpress
   * @param conversationId Conversation ID
   * @param userBotpressId User's Botpress ID (not used but kept for compatibility)
   * @param limit Number of messages to return
   * @param nextToken Pagination token
   * @returns Paginated messages from our local store
   */
  public async getConversationMessages(
    userKey: string,
    conversationId: string,
    limit: number = 30,
    nextToken?: string
  ): Promise<any> {
    try {
      // Validate conversation context
      const context = await this.contextService.getContext(conversationId);
      if (!context) {
        this.logger.warn('Conversation context not found', {
          conversationId,
          userKey: userKey.substring(0, 10) + '...'
        });
        throw new Error('Conversation not found');
      }

      this.logger.info('Getting messages from local store only (optimized)', {
        conversationId,
        userKey: userKey.substring(0, 10) + '...',
        limit,
        hasNextToken: !!nextToken
      });

      // ✅ OPTIMIZACIÓN: Solo leer desde nuestra tabla (súper rápido)
      const messages = await this.messageService.getMessages(conversationId, limit, nextToken);

      this.logger.info('Messages retrieved from local store', {
        conversationId,
        messageCount: messages.messages.length,
        hasMore: messages.pagination.hasMore,
        source: 'LOCAL_ONLY'
      });

      // Actualizar contexto con información del último mensaje si hay mensajes
      if (messages.messages.length > 0) {
        const lastMessage = messages.messages[0]; // Primer mensaje (más reciente)
        await this.contextService.updateContext(conversationId, {
          lastMessageId: lastMessage.messageId,
          lastMessageTimestamp: lastMessage.timestamp,
          messageCount: await this.messageService.getMessageCount(conversationId),
          updatedAt: Date.now()
        });
      }

      return {
        messages: messages.messages.map(msg => msg.toJSON()),
        pagination: messages.pagination,
        source: 'local_store',
        cached: true // Indica que viene de cache local
      };

    } catch (error) {
      this.logger.error('Error getting conversation messages from local store', {
        error,
        userKey: userKey.substring(0, 10) + '...',
        conversationId
      });
      throw error;
    }
  }

  /**
   * Gets new messages with intelligent synchronization (OPTIMIZED STRATEGY)
   * Only synchronizes when polling - perfect for real-time updates
   * Returns only the LATEST messages to keep polling simple and fast
   * @param userKey User key from Botpress
   * @param conversationId Conversation ID
   * @param userBotpressId User's Botpress ID for role identification
   * @param sinceTimestamp Timestamp to get messages since
   * @param roleFilter Filter by message role (optional)
   * @param maxMessages Maximum number of messages to return (default: 5)
   * @returns Latest new messages since timestamp
   */
  public async getNewMessages(
    userKey: string,
    conversationId: string,
    userBotpressId: string,
    sinceTimestamp?: number,
    roleFilter?: MessageRole,
    maxMessages: number = 5
  ): Promise<any> {
    try {
      // Validate conversation context
      const context = await this.contextService.getContext(conversationId);
      if (!context) {
        this.logger.warn('Conversation context not found for polling', {
          conversationId,
          userKey: userKey.substring(0, 10) + '...'
        });
        throw new Error('Conversation not found');
      }

      this.logger.info('Starting intelligent sync for polling', {
        conversationId,
        userKey: userKey.substring(0, 10) + '...',
        userBotpressId,
        sinceTimestamp,
        roleFilter,
        strategy: 'POLLING_SYNC'
      });

      // ✅ OPTIMIZACIÓN: Solo sincronizar cuando se hace polling
      // Esto captura las respuestas del bot que llegaron después del último poll
      const syncResult = await this.syncService.syncNewMessages(
        conversationId,
        userKey,
        userBotpressId,
        this.apiClient,
        sinceTimestamp
      );

      this.logger.info('Intelligent sync completed for polling', {
        conversationId,
        syncResult,
        strategy: 'POLLING_SYNC'
      });

      // Obtener mensajes nuevos desde nuestra tabla
      const since = sinceTimestamp || 0;
      const newMessages = await this.messageService.getMessagesSince(conversationId, since);

      // Filtrar por rol si se especifica (típicamente solo BOT para polling)
      let filteredMessages = roleFilter
        ? newMessages.filter(msg => msg.role === roleFilter)
        : newMessages;

      // ✅ OPTIMIZACIÓN: Limitar a los últimos N mensajes para polling eficiente
      // Ordenar por timestamp descendente y tomar solo los más recientes
      filteredMessages = filteredMessages
        .sort((a, b) => b.timestamp - a.timestamp) // Más recientes primero
        .slice(0, maxMessages); // Tomar solo los últimos N

      this.logger.info('Latest messages retrieved for polling', {
        conversationId,
        totalNewMessages: newMessages.length,
        filteredMessages: filteredMessages.length,
        maxMessages,
        roleFilter,
        syncedNewMessages: syncResult.newMessages,
        strategy: 'LATEST_MESSAGES_ONLY'
      });

      return {
        messages: filteredMessages.map(msg => msg.toJSON()),
        timestamp: new Date().toISOString(),
        hasMore: newMessages.length > maxMessages, // Indica si hay más mensajes disponibles
        totalAvailable: newMessages.length,
        returned: filteredMessages.length,
        maxMessages,
        sync: {
          newMessages: syncResult.newMessages,
          duplicatesSkipped: syncResult.duplicatesSkipped,
          strategy: 'polling_sync_latest'
        }
      };

    } catch (error) {
      this.logger.error('Error getting new messages for polling', {
        error,
        userKey: userKey.substring(0, 10) + '...',
        conversationId,
        sinceTimestamp
      });
      throw error;
    }
  }

  /**
   * Performs initial synchronization for a conversation (OPTIONAL)
   * Use only when you need to backfill messages from Botpress
   * @param userKey User key from Botpress
   * @param conversationId Conversation ID
   * @param userBotpressId User's Botpress ID for role identification
   * @returns Sync result
   */
  public async performInitialSync(
    userKey: string,
    conversationId: string,
    userBotpressId: string
  ): Promise<any> {
    try {
      this.logger.info('Starting initial conversation sync', {
        conversationId,
        userKey: userKey.substring(0, 10) + '...',
        userBotpressId,
        strategy: 'INITIAL_SYNC'
      });

      // Verificar si ya tenemos mensajes
      const messageCount = await this.messageService.getMessageCount(conversationId);

      if (messageCount > 0) {
        this.logger.info('Conversation already has messages, skipping initial sync', {
          conversationId,
          messageCount
        });
        return {
          skipped: true,
          reason: 'already_has_messages',
          messageCount
        };
      }

      // Realizar sincronización completa solo si no hay mensajes
      const syncResult = await this.syncService.syncAllMessages(
        conversationId,
        userKey,
        userBotpressId,
        this.apiClient
      );

      this.logger.info('Initial sync completed', {
        conversationId,
        syncResult,
        strategy: 'INITIAL_SYNC'
      });

      return {
        performed: true,
        syncResult,
        strategy: 'initial_sync'
      };

    } catch (error) {
      this.logger.error('Error performing initial sync', {
        error,
        userKey: userKey.substring(0, 10) + '...',
        conversationId
      });
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

  /**
   * Deletes a conversation (inactivates locally and deletes from Botpress)
   * @param userKey User key from Botpress
   * @param conversationId Conversation ID
   * @param reason Optional reason for deletion
   * @returns Deletion result
   */
  public async deleteConversation(
    userKey: string,
    conversationId: string,
    reason?: string
  ): Promise<{
    localInactivation: any;
    botpressDeletion: any;
    success: boolean;
  }> {
    let localInactivation: any = null;
    let botpressDeletion: any = null;

    try {
      this.logger.info('Starting conversation deletion process', {
        conversationId,
        userKey: userKey.substring(0, 10) + '...',
        reason
      });

      // 1. Verificar que la conversación existe, está activa Y pertenece al usuario
      const context = await this.contextService.getContext(conversationId);
      if (!context) {
        throw new Error('Conversation not found');
      }

      if (context.userId !== userKey) {
        throw new Error('Access denied to conversation');
      }

      if (context.status === ConversationStatus.INACTIVE) {
        throw new Error('Conversation is already inactive or does not exist');
      }

      // 2. Inactivar la conversación en nuestra tabla (soft delete)
      this.logger.info('Inactivating conversation locally', {
        conversationId
      });

      localInactivation = await this.contextService.inactivateConversation(
        conversationId,
        reason
      );

      this.logger.info('Conversation inactivated locally', {
        conversationId,
        newStatus: localInactivation.status
      });

      // 3. Eliminar la conversación de Botpress (hard delete)
      this.logger.info('Deleting conversation from Botpress', {
        conversationId
      });

      try {
        botpressDeletion = await this.apiClient.deleteConversation(
          conversationId,
          userKey
        );

        this.logger.info('Conversation deleted from Botpress', {
          conversationId,
          botpressResponse: botpressDeletion
        });

        // 4. Actualizar metadata para indicar que se eliminó de Botpress
        await this.contextService.updateContext(conversationId, {
          metadata: {
            ...localInactivation.metadata,
            deletedFromBotpress: true,
            botpressDeletionTimestamp: Date.now()
          }
        });

      } catch (botpressError) {
        this.logger.error('Failed to delete from Botpress, reverting local changes', {
          botpressError,
          conversationId
        });

        // Revertir la inactivación local
        await this.contextService.updateContext(conversationId, {
          status: ConversationStatus.ACTIVE,
          metadata: {
            ...context.metadata,
            revertedInactivation: true,
            revertedAt: Date.now(),
            revertReason: 'Botpress deletion failed'
          }
        });

        throw new Error(`Failed to delete conversation from Botpress: ${(botpressError as Error).message}`);
      }

      this.logger.info('Conversation deletion process completed successfully', {
        conversationId,
        reason
      });

      return {
        localInactivation,
        botpressDeletion,
        success: true
      };

    } catch (error) {
      this.logger.error('Error during conversation deletion process', {
        error,
        conversationId,
        userKey: userKey.substring(0, 10) + '...',
        reason
      });

      throw error;
    }
  }
}