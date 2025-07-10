// services/botpress/services/sync/botpress-sync.service.ts

import { Logger } from '@shared/utils/logger';
import { ConversationMessageService } from '../conversation-message/conversation-message.service';
import { MessageRole, MessageType } from '../../models/conversation-message.model';

export interface BotpressMessage {
  id: string;
  createdAt: string;
  payload: {
    text?: string;
    type?: string;
    [key: string]: any;
  };
  userId: string;
  conversationId: string;
}

export interface BotpressMessagesResponse {
  messages: BotpressMessage[];
  meta?: {
    nextToken?: string;
  };
}

export interface SyncResult {
  totalSynced: number;
  newMessages: number;
  duplicatesSkipped: number;
  errors: number;
}

export class BotpressSyncService {
  private static instance: BotpressSyncService;
  private readonly logger: Logger;
  private readonly messageService: ConversationMessageService;

  private constructor() {
    this.logger = new Logger('BotpressSyncService');
    this.messageService = ConversationMessageService.getInstance();
  }

  public static getInstance(): BotpressSyncService {
    if (!BotpressSyncService.instance) {
      BotpressSyncService.instance = new BotpressSyncService();
    }
    return BotpressSyncService.instance;
  }

  /**
   * Sincroniza TODOS los mensajes de una conversación desde Botpress
   * Maneja paginación automáticamente
   */
  async syncAllMessages(
    conversationId: string,
    userKey: string,
    userBotpressId: string,
    botpressApiClient: any
  ): Promise<SyncResult> {
    this.logger.info('Starting full message sync', {
      conversationId,
      userKey: userKey.substring(0, 10) + '...',
      userBotpressId
    });

    let totalSynced = 0;
    let newMessages = 0;
    let duplicatesSkipped = 0;
    let errors = 0;
    let nextToken: string | undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        this.logger.debug('Fetching messages page', {
          conversationId,
          nextToken: nextToken ? 'present' : 'none'
        });

        // Llamar a Botpress API con paginación
        const response = await this.fetchBotpressMessages(
          conversationId,
          userKey,
          botpressApiClient,
          nextToken
        );

        if (!response.messages || response.messages.length === 0) {
          this.logger.info('No more messages to sync', { conversationId });
          break;
        }

        // Procesar mensajes de esta página
        const pageResult = await this.processBotpressMessages(
          response.messages,
          conversationId,
          userKey,
          userBotpressId
        );

        totalSynced += pageResult.processed;
        newMessages += pageResult.newMessages;
        duplicatesSkipped += pageResult.duplicatesSkipped;
        errors += pageResult.errors;

        // Verificar si hay más páginas
        nextToken = response.meta?.nextToken;
        hasMore = !!nextToken;

        this.logger.debug('Page processed', {
          conversationId,
          pageMessages: response.messages.length,
          pageNewMessages: pageResult.newMessages,
          pageDuplicates: pageResult.duplicatesSkipped,
          hasMore
        });
      }

      this.logger.info('Full message sync completed', {
        conversationId,
        totalSynced,
        newMessages,
        duplicatesSkipped,
        errors
      });

      return { totalSynced, newMessages, duplicatesSkipped, errors };

    } catch (error) {
      this.logger.error('Error during full message sync', {
        error,
        conversationId,
        totalSynced,
        newMessages,
        duplicatesSkipped,
        errors
      });
      throw error;
    }
  }

  /**
   * Sincroniza solo mensajes nuevos desde un timestamp específico
   */
  async syncNewMessages(
    conversationId: string,
    userKey: string,
    userBotpressId: string,
    botpressApiClient: any,
    sinceTimestamp?: number
  ): Promise<SyncResult> {
    this.logger.info('Starting incremental message sync', {
      conversationId,
      userKey: userKey.substring(0, 10) + '...',
      sinceTimestamp
    });

    try {
      // Si no se proporciona timestamp, obtener el último sincronizado
      const lastSync = sinceTimestamp || await this.messageService.getLastSyncTimestamp(conversationId);
      
      this.logger.debug('Using sync timestamp', {
        conversationId,
        lastSync,
        provided: !!sinceTimestamp
      });

      // Obtener todos los mensajes (necesario porque Botpress no filtra por fecha)
      const syncResult = await this.syncAllMessages(
        conversationId,
        userKey,
        userBotpressId,
        botpressApiClient
      );

      // Filtrar solo los mensajes nuevos se hace automáticamente por saveMessageIfNotExists
      this.logger.info('Incremental message sync completed', {
        conversationId,
        syncResult
      });

      return syncResult;

    } catch (error) {
      this.logger.error('Error during incremental message sync', {
        error,
        conversationId,
        sinceTimestamp
      });
      throw error;
    }
  }

  /**
   * Obtiene mensajes de Botpress API con manejo de paginación
   */
  private async fetchBotpressMessages(
    conversationId: string,
    userKey: string,
    botpressApiClient: any,
    nextToken?: string
  ): Promise<BotpressMessagesResponse> {
    try {
      // Construir URL con nextToken si existe
      let url = `/conversations/${conversationId}/messages`;
      if (nextToken) {
        url += `?nextToken=${encodeURIComponent(nextToken)}`;
      }

      const response = await botpressApiClient.axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-key': userKey
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error fetching messages from Botpress', {
        error,
        conversationId,
        hasNextToken: !!nextToken
      });
      throw error;
    }
  }

  /**
   * Procesa una lista de mensajes de Botpress y los guarda en nuestra tabla
   */
  private async processBotpressMessages(
    messages: BotpressMessage[],
    conversationId: string,
    userKey: string,
    userBotpressId: string
  ): Promise<{
    processed: number;
    newMessages: number;
    duplicatesSkipped: number;
    errors: number;
  }> {
    let processed = 0;
    let newMessages = 0;
    let duplicatesSkipped = 0;
    let errors = 0;

    for (const msg of messages) {
      try {
        // ✅ CORRECCIÓN: Determinar el rol del mensaje comparando con userBotpressId
        const role = msg.userId === userBotpressId ? MessageRole.USER : MessageRole.BOT;

        this.logger.info('Processing Botpress message', {
          botpressMessageId: msg.id,
          msgUserId: msg.userId,
          userBotpressId: userBotpressId,
          identifiedRole: role,
          isUserMessage: msg.userId === userBotpressId,
          createdAt: msg.createdAt,
          hasText: !!msg.payload?.text
        });

        // Extraer contenido del payload
        const content = msg.payload?.text || JSON.stringify(msg.payload);

        // Intentar guardar el mensaje (con verificación de duplicados)
        const savedMessage = await this.messageService.saveMessageIfNotExists({
          conversationId: conversationId,
          userId: userKey, // userKey es para el contexto (botpressUserKeyId)
          role: role, // ✅ Rol correctamente identificado
          type: MessageType.TEXT,
          content: content,
          timestamp: new Date(msg.createdAt).getTime(),
          botpressMessageId: msg.id // ✅ Clave única para prevenir duplicados
        });

        processed++;

        // ✅ ESTRATEGIA SIMPLE Y CONFIABLE:
        // saveMessageIfNotExists maneja toda la lógica internamente
        // Solo necesitamos verificar si retornó un mensaje o null

        if (savedMessage && savedMessage.messageId) {
          // Si retornó un mensaje con ID, asumimos que la operación fue exitosa
          // (puede ser nuevo o existente, pero saveMessageIfNotExists ya lo manejó)

          // Para estadísticas, verificar si el mensaje tiene timestamp muy reciente
          const now = Date.now();
          const messageAge = now - savedMessage.timestamp;
          const isLikelyNew = messageAge < 5000; // Menos de 5 segundos = probablemente nuevo

          if (isLikelyNew) {
            newMessages++;
            this.logger.info('✅ SYNC: Message processed (likely NEW)', {
              botpressMessageId: msg.id,
              role,
              messageId: savedMessage.messageId,
              msgUserId: msg.userId,
              userBotpressId: userBotpressId,
              isUserMessage: msg.userId === userBotpressId,
              messageAge,
              action: 'LIKELY_NEW'
            });
          } else {
            duplicatesSkipped++;
            this.logger.info('🔄 SYNC: Message processed (likely EXISTING)', {
              botpressMessageId: msg.id,
              role,
              messageId: savedMessage.messageId,
              messageAge,
              action: 'LIKELY_EXISTING'
            });
          }
        } else {
          // saveMessageIfNotExists retornó null - error o duplicado prevenido
          duplicatesSkipped++;
          this.logger.warn('⚠️ SYNC: Message save returned null', {
            botpressMessageId: msg.id,
            role,
            conversationId,
            action: 'SAVE_FAILED_OR_DUPLICATE'
          });
        }

      } catch (error) {
        errors++;
        this.logger.error('Error processing individual message', {
          error,
          botpressMessageId: msg.id,
          conversationId
        });
      }
    }

    return { processed, newMessages, duplicatesSkipped, errors };
  }
}
