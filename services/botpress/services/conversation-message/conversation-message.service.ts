// services/botpress/services/conversation-message/conversation-message.service.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
  BatchWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { Logger } from '@shared/utils/logger';
import { 
  ConversationMessageModel, 
  ConversationMessageData, 
  PaginatedMessages
} from '../../models/conversation-message.model';

export class ConversationMessageService {
  private static instance: ConversationMessageService;
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly tableName: string;
  private readonly defaultPageSize = 30;

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamodb = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true
      }
    });
    this.logger = new Logger('ConversationMessageService');
    this.tableName = process.env.CONVERSATION_MESSAGES_TABLE || 
      `${process.env.RESOURCE_PREFIX}-conversation-messages`;
  }

  public static getInstance(): ConversationMessageService {
    if (!ConversationMessageService.instance) {
      ConversationMessageService.instance = new ConversationMessageService();
    }
    return ConversationMessageService.instance;
  }

  /**
   * Guarda un nuevo mensaje en la conversación
   */
  async saveMessage(messageData: ConversationMessageData): Promise<ConversationMessageModel> {
    try {
      const message = new ConversationMessageModel(messageData);
      
      this.logger.info('Saving conversation message', {
        messageId: message.messageId,
        conversationId: message.conversationId,
        role: message.role,
        type: message.type
      });

      await this.dynamodb.send(new PutCommand({
        TableName: this.tableName,
        Item: message.toDynamoDB()
      }));

      this.logger.info('Conversation message saved successfully', {
        messageId: message.messageId,
        conversationId: message.conversationId
      });

      return message;
    } catch (error) {
      this.logger.error('Error saving conversation message', {
        error,
        messageData
      });
      throw error;
    }
  }

  /**
   * Obtiene mensajes de una conversación con paginación
   */
  async getMessages(
    conversationId: string,
    limit: number = this.defaultPageSize,
    nextToken?: string
  ): Promise<PaginatedMessages> {
    try {
      this.logger.info('Getting conversation messages', {
        conversationId,
        limit,
        hasNextToken: !!nextToken
      });

      const queryParams: any = {
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId
        },
        Limit: limit,
        ScanIndexForward: false // Orden descendente por timestamp (más recientes primero)
      };

      if (nextToken) {
        queryParams.ExclusiveStartKey = JSON.parse(
          Buffer.from(nextToken, 'base64').toString('utf-8')
        );
      }

      const result = await this.dynamodb.send(new QueryCommand(queryParams));

      const messages = (result.Items || []).map(item => 
        ConversationMessageModel.fromDynamoDB(item)
      );

      const hasMore = !!result.LastEvaluatedKey;
      const nextTokenValue = hasMore 
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      // ✅ Verificar que los mensajes estén ordenados correctamente (más recientes primero)
      if (messages.length > 1) {
        const isCorrectlyOrdered = messages.every((msg, index) => {
          if (index === 0) return true;
          return msg.timestamp <= messages[index - 1].timestamp;
        });

        this.logger.debug('Message ordering verification for pagination', {
          conversationId,
          messageCount: messages.length,
          isCorrectlyOrdered,
          firstTimestamp: messages[0]?.timestamp,
          lastTimestamp: messages[messages.length - 1]?.timestamp,
          hasMore
        });

        if (!isCorrectlyOrdered) {
          this.logger.warn('Messages are not correctly ordered! Sorting manually...', {
            conversationId
          });
          // Ordenar manualmente como fallback
          messages.sort((a, b) => b.timestamp - a.timestamp);
        }
      }

      this.logger.info('Conversation messages retrieved', {
        conversationId,
        messageCount: messages.length,
        hasMore,
        orderVerified: true
      });

      return {
        messages,
        pagination: {
          nextToken: nextTokenValue,
          hasMore,
          pageSize: limit
        }
      };
    } catch (error) {
      this.logger.error('Error getting conversation messages', {
        error,
        conversationId,
        limit
      });
      throw error;
    }
  }

  /**
   * Obtiene un mensaje específico por ID
   */
  async getMessage(messageId: string): Promise<ConversationMessageModel | null> {
    try {
      const result = await this.dynamodb.send(new GetCommand({
        TableName: this.tableName,
        Key: { messageId }
      }));

      if (!result.Item) {
        return null;
      }

      return ConversationMessageModel.fromDynamoDB(result.Item);
    } catch (error) {
      this.logger.error('Error getting message', { error, messageId });
      throw error;
    }
  }

  /**
   * Obtiene mensajes desde un timestamp específico
   */
  async getMessagesSince(
    conversationId: string,
    sinceTimestamp: number
  ): Promise<ConversationMessageModel[]> {
    try {
      this.logger.info('Getting messages since timestamp', {
        conversationId,
        sinceTimestamp
      });

      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId AND #timestamp > :sinceTimestamp',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':sinceTimestamp': sinceTimestamp
        },
        ScanIndexForward: false // ✅ CORREGIDO: Orden descendente (más recientes primero)
      }));

      const messages = (result.Items || []).map(item => 
        ConversationMessageModel.fromDynamoDB(item)
      );

      this.logger.info('Messages since timestamp retrieved', {
        conversationId,
        sinceTimestamp,
        messageCount: messages.length
      });

      // ✅ Verificar que los mensajes estén ordenados correctamente (más recientes primero)
      if (messages.length > 1) {
        const isCorrectlyOrdered = messages.every((msg, index) => {
          if (index === 0) return true;
          return msg.timestamp <= messages[index - 1].timestamp;
        });

        this.logger.debug('Message ordering verification', {
          conversationId,
          messageCount: messages.length,
          isCorrectlyOrdered,
          firstTimestamp: messages[0]?.timestamp,
          lastTimestamp: messages[messages.length - 1]?.timestamp
        });
      }

      return messages;
    } catch (error) {
      this.logger.error('Error getting messages since timestamp', {
        error,
        conversationId,
        sinceTimestamp
      });
      throw error;
    }
  }

  /**
   * Elimina todos los mensajes de una conversación
   */
  async deleteConversationMessages(conversationId: string): Promise<void> {
    try {
      this.logger.info('Deleting all messages for conversation', { conversationId });

      // Primero obtener todos los messageIds
      const messages = await this.getAllConversationMessages(conversationId);
      
      if (messages.length === 0) {
        this.logger.info('No messages to delete', { conversationId });
        return;
      }

      // Eliminar en lotes de 25 (límite de DynamoDB)
      const batchSize = 25;
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        
        await this.dynamodb.send(new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: batch.map(message => ({
              DeleteRequest: {
                Key: { messageId: message.messageId }
              }
            }))
          }
        }));
      }

      this.logger.info('All conversation messages deleted', {
        conversationId,
        deletedCount: messages.length
      });
    } catch (error) {
      this.logger.error('Error deleting conversation messages', {
        error,
        conversationId
      });
      throw error;
    }
  }

  /**
   * Obtiene todos los mensajes de una conversación (sin paginación)
   * Usado internamente para operaciones como eliminación
   */
  private async getAllConversationMessages(conversationId: string): Promise<ConversationMessageModel[]> {
    const allMessages: ConversationMessageModel[] = [];
    let nextToken: string | undefined;

    do {
      const result = await this.getMessages(conversationId, 100, nextToken);
      allMessages.push(...result.messages);
      nextToken = result.pagination.nextToken;
    } while (nextToken);

    return allMessages;
  }

  /**
   * Cuenta el número total de mensajes en una conversación
   */
  async getMessageCount(conversationId: string): Promise<number> {
    try {
      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId
        },
        Select: 'COUNT'
      }));

      return result.Count || 0;
    } catch (error) {
      this.logger.error('Error counting messages', { error, conversationId });
      throw error;
    }
  }

  /**
   * Verifica si un mensaje ya existe por su botpressMessageId en una conversación específica
   * VERSIÓN ULTRA-ROBUSTA ANTI-DUPLICADOS
   */
  async messageExistsInConversation(conversationId: string, botpressMessageId: string): Promise<boolean> {
    try {
      if (!botpressMessageId || botpressMessageId.trim() === '') {
        this.logger.warn('🚫 DUPLICATE CHECK: Cannot check - empty botpressMessageId', {
          conversationId,
          botpressMessageId
        });
        return false;
      }

      this.logger.info('🔍 DUPLICATE CHECK: Starting verification', {
        conversationId,
        botpressMessageId,
        tableName: this.tableName
      });

      // ✅ ESTRATEGIA ROBUSTA: Usar Query en ConversationIndex con FilterExpression
      // Esto es más eficiente que Scan y más confiable
      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'attribute_exists(botpressMessageId) AND botpressMessageId = :botpressMessageId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':botpressMessageId': botpressMessageId
        },
        Select: 'COUNT',
        //Limit: 1
      }));

      const exists = (result.Count || 0) > 0;

      this.logger.info('🔍 DUPLICATE CHECK: Verification result', {
        conversationId,
        botpressMessageId,
        exists,
        count: result.Count || 0,
        scannedCount: result.ScannedCount || 0
      });

      return exists;
    } catch (error) {
      this.logger.error('❌ DUPLICATE CHECK: Error during verification', {
        error: (error as Error).message,
        conversationId,
        botpressMessageId
      });

      // En caso de error, intentar método alternativo
      return await this.messageExistsAlternativeMethod(conversationId, botpressMessageId);
    }
  }

  /**
   * Método alternativo para verificar existencia de mensaje
   * Usa getMessageByBotpressId como fallback
   */
  private async messageExistsAlternativeMethod(conversationId: string, botpressMessageId: string): Promise<boolean> {
    try {
      this.logger.warn('🔄 DUPLICATE CHECK: Using alternative method', {
        conversationId,
        botpressMessageId
      });

      const existingMessage = await this.getMessageByBotpressId(conversationId, botpressMessageId);
      const exists = existingMessage !== null;

      this.logger.info('🔄 DUPLICATE CHECK: Alternative method result', {
        conversationId,
        botpressMessageId,
        exists,
        foundMessageId: existingMessage?.messageId
      });

      return exists;
    } catch (error) {
      this.logger.error('❌ DUPLICATE CHECK: Alternative method failed', {
        error: (error as Error).message,
        conversationId,
        botpressMessageId
      });

      // Si todo falla, ser conservador y prevenir duplicados
      return true;
    }
  }

  /**
   * Guarda un mensaje solo si no existe (evita duplicados)
   * ESTRATEGIA ROBUSTA ANTI-DUPLICADOS
   * @returns ConversationMessageModel si se guardó o ya existía, null si hubo error
   */
  async saveMessageIfNotExists(messageData: ConversationMessageData): Promise<ConversationMessageModel | null> {
    try {
      this.logger.info('🔍 ANTI-DUPLICATE: Attempting to save message if not exists', {
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role,
        hasContent: !!messageData.content,
        timestamp: messageData.timestamp
      });

      // ✅ VALIDACIÓN CRÍTICA: Si tiene botpressMessageId, verificar que no exista
      if (messageData.botpressMessageId && messageData.botpressMessageId.trim() !== '') {
        this.logger.info('🔍 ANTI-DUPLICATE: Starting duplicate check', {
          conversationId: messageData.conversationId,
          botpressMessageId: messageData.botpressMessageId,
          role: messageData.role
        });

        // DOBLE VERIFICACIÓN para máxima seguridad
        const exists = await this.messageExistsInConversation(
          messageData.conversationId,
          messageData.botpressMessageId
        );

        if (exists) {
          this.logger.warn('🚫 ANTI-DUPLICATE: DUPLICATE DETECTED - Message already exists, ABORTING save', {
            botpressMessageId: messageData.botpressMessageId,
            conversationId: messageData.conversationId,
            role: messageData.role,
            action: 'DUPLICATE_PREVENTED'
          });

          // Retornar el mensaje existente
          const existingMessage = await this.getMessageByBotpressId(
            messageData.conversationId,
            messageData.botpressMessageId
          );

          if (existingMessage) {
            this.logger.info('🔍 ANTI-DUPLICATE: Returning existing message instead', {
              messageId: existingMessage.messageId,
              botpressMessageId: messageData.botpressMessageId,
              existingRole: existingMessage.role,
              existingTimestamp: existingMessage.timestamp
            });
            return existingMessage;
          } else {
            this.logger.error('❌ ANTI-DUPLICATE: Exists check returned true but getMessageByBotpressId returned null', {
              conversationId: messageData.conversationId,
              botpressMessageId: messageData.botpressMessageId
            });
            // Retornar null para indicar que no se guardó
            return null;
          }
        } else {
          this.logger.info('✅ ANTI-DUPLICATE: No duplicate found, safe to save', {
            conversationId: messageData.conversationId,
            botpressMessageId: messageData.botpressMessageId,
            role: messageData.role
          });
        }
      } else {
        this.logger.warn('⚠️ ANTI-DUPLICATE: No botpressMessageId provided, cannot prevent duplicates', {
          conversationId: messageData.conversationId,
          role: messageData.role,
          hasContent: !!messageData.content
        });
      }

      // Si no existe, guardarlo
      this.logger.info('💾 ANTI-DUPLICATE: Saving NEW message', {
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role,
        action: 'SAVING_NEW'
      });

      const savedMessage = await this.saveMessage(messageData);

      this.logger.info('✅ ANTI-DUPLICATE: Message saved successfully', {
        messageId: savedMessage.messageId,
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role
      });

      return savedMessage;
    } catch (error) {
      this.logger.error('❌ ANTI-DUPLICATE: Error saving message if not exists', {
        error,
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role
      });
      throw error;
    }
  }

  /**
   * Obtiene un mensaje por su botpressMessageId en una conversación específica
   * VERSIÓN MEJORADA PARA ANTI-DUPLICADOS
   */
  async getMessageByBotpressId(conversationId: string, botpressMessageId: string): Promise<ConversationMessageModel | null> {
    try {
      if (!botpressMessageId || botpressMessageId.trim() === '') {
        this.logger.debug('🔍 GET MESSAGE: Empty botpressMessageId provided', {
          conversationId
        });
        return null;
      }

      this.logger.debug('🔍 GET MESSAGE: Searching for message by Botpress ID', {
        conversationId,
        botpressMessageId
      });

      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'BotpressConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'attribute_exists(botpressMessageId) AND botpressMessageId = :botpressMessageId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':botpressMessageId': botpressMessageId
        },
        //Limit: 1
      }));

      if (result.Items && result.Items.length > 0) {
        const message = ConversationMessageModel.fromDynamoDB(result.Items[0]);
        this.logger.info('✅ GET MESSAGE: Found existing message by Botpress ID', {
          messageId: message.messageId,
          botpressMessageId,
          role: message.role,
          timestamp: message.timestamp
        });
        return message;
      }

      this.logger.debug('🔍 GET MESSAGE: No message found by Botpress ID', {
        conversationId,
        botpressMessageId,
        scannedCount: result.ScannedCount || 0
      });
      return null;
    } catch (error) {
      this.logger.error('❌ GET MESSAGE: Error getting message by Botpress ID', {
        error: (error as Error).message,
        conversationId,
        botpressMessageId
      });
      throw error;
    }
  }

  /**
   * Obtiene el timestamp del último mensaje sincronizado desde Botpress
   */
  async getLastSyncTimestamp(conversationId: string): Promise<number> {
    try {
      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'attribute_exists(botpressMessageId)',
        ExpressionAttributeValues: {
          ':conversationId': conversationId
        },
        ScanIndexForward: false, // Orden descendente
        //Limit: 1
      }));

      if (result.Items && result.Items.length > 0) {
        return result.Items[0].timestamp;
      }

      return 0; // Si no hay mensajes sincronizados, empezar desde el principio
    } catch (error) {
      this.logger.error('Error getting last sync timestamp', {
        error,
        conversationId
      });
      return 0;
    }
  }

  /**
   * Obtiene mensajes duplicados por botpressMessageId en una conversación
   * Útil para debugging y limpieza
   */
  async findDuplicateMessages(conversationId: string): Promise<{
    botpressMessageId: string;
    count: number;
    messageIds: string[];
  }[]> {
    try {
      this.logger.info('Finding duplicate messages', { conversationId });

      // Obtener todos los mensajes de la conversación
      const allMessages = await this.getAllConversationMessages(conversationId);

      // Agrupar por botpressMessageId
      const messageGroups = new Map<string, ConversationMessageModel[]>();

      for (const message of allMessages) {
        if (message.botpressMessageId) {
          if (!messageGroups.has(message.botpressMessageId)) {
            messageGroups.set(message.botpressMessageId, []);
          }
          messageGroups.get(message.botpressMessageId)!.push(message);
        }
      }

      // Encontrar duplicados
      const duplicates: {
        botpressMessageId: string;
        count: number;
        messageIds: string[];
      }[] = [];

      for (const [botpressMessageId, messages] of messageGroups) {
        if (messages.length > 1) {
          duplicates.push({
            botpressMessageId,
            count: messages.length,
            messageIds: messages.map(m => m.messageId)
          });
        }
      }

      this.logger.info('Duplicate messages found', {
        conversationId,
        duplicateGroups: duplicates.length,
        totalDuplicates: duplicates.reduce((sum, d) => sum + d.count - 1, 0)
      });

      return duplicates;
    } catch (error) {
      this.logger.error('Error finding duplicate messages', {
        error,
        conversationId
      });
      throw error;
    }
  }

  /**
   * Elimina mensajes duplicados manteniendo solo el más reciente
   * USAR CON CUIDADO - Esta operación es irreversible
   */
  async removeDuplicateMessages(conversationId: string): Promise<{
    duplicatesRemoved: number;
    duplicateGroups: number;
  }> {
    try {
      this.logger.warn('Starting duplicate message removal', { conversationId });

      const duplicates = await this.findDuplicateMessages(conversationId);
      let totalRemoved = 0;

      for (const duplicate of duplicates) {
        // Obtener los mensajes duplicados
        const messages: ConversationMessageModel[] = [];
        for (const messageId of duplicate.messageIds) {
          const message = await this.getMessage(messageId);
          if (message) {
            messages.push(message);
          }
        }

        // Ordenar por timestamp (más reciente primero)
        messages.sort((a, b) => b.timestamp - a.timestamp);

        // Mantener el más reciente, eliminar el resto
        const toKeep = messages[0];
        const toRemove = messages.slice(1);

        this.logger.info('Removing duplicate messages', {
          botpressMessageId: duplicate.botpressMessageId,
          keeping: toKeep.messageId,
          removing: toRemove.map(m => m.messageId)
        });

        // Eliminar duplicados
        for (const message of toRemove) {
          await this.dynamodb.send(new DeleteCommand({
            TableName: this.tableName,
            Key: { messageId: message.messageId }
          }));
          totalRemoved++;
        }
      }

      this.logger.warn('Duplicate message removal completed', {
        conversationId,
        duplicateGroups: duplicates.length,
        duplicatesRemoved: totalRemoved
      });

      return {
        duplicatesRemoved: totalRemoved,
        duplicateGroups: duplicates.length
      };
    } catch (error) {
      this.logger.error('Error removing duplicate messages', {
        error,
        conversationId
      });
      throw error;
    }
  }

  /**
   * Método de emergencia para limpiar duplicados por botpressMessageId
   * Usar solo si hay problemas persistentes de duplicados
   */
  async emergencyCleanDuplicates(conversationId: string): Promise<{
    duplicatesFound: number;
    duplicatesRemoved: number;
  }> {
    try {
      this.logger.warn('🚨 EMERGENCY CLEANUP: Starting duplicate cleanup', {
        conversationId
      });

      // Obtener todos los mensajes de la conversación
      const allMessages = await this.getAllConversationMessages(conversationId);

      // Agrupar por botpressMessageId
      const messageGroups = new Map<string, ConversationMessageModel[]>();
      let messagesWithoutBotpressId = 0;

      for (const message of allMessages) {
        if (message.botpressMessageId && message.botpressMessageId.trim() !== '') {
          if (!messageGroups.has(message.botpressMessageId)) {
            messageGroups.set(message.botpressMessageId, []);
          }
          messageGroups.get(message.botpressMessageId)!.push(message);
        } else {
          messagesWithoutBotpressId++;
        }
      }

      let duplicatesFound = 0;
      let duplicatesRemoved = 0;

      // Procesar cada grupo de mensajes con el mismo botpressMessageId
      for (const [botpressMessageId, messages] of messageGroups) {
        if (messages.length > 1) {
          duplicatesFound += messages.length - 1;

          this.logger.warn('🚨 EMERGENCY CLEANUP: Found duplicates', {
            botpressMessageId,
            duplicateCount: messages.length,
            messageIds: messages.map(m => m.messageId)
          });

          // Mantener el más reciente (por timestamp)
          messages.sort((a, b) => b.timestamp - a.timestamp);
          const toKeep = messages[0];
          const toRemove = messages.slice(1);

          // Eliminar duplicados
          for (const message of toRemove) {
            try {
              await this.dynamodb.send(new DeleteCommand({
                TableName: this.tableName,
                Key: { messageId: message.messageId }
              }));
              duplicatesRemoved++;

              this.logger.info('🗑️ EMERGENCY CLEANUP: Removed duplicate', {
                messageId: message.messageId,
                botpressMessageId,
                keptMessageId: toKeep.messageId
              });
            } catch (deleteError) {
              this.logger.error('❌ EMERGENCY CLEANUP: Failed to remove duplicate', {
                error: deleteError,
                messageId: message.messageId,
                botpressMessageId
              });
            }
          }
        }
      }

      this.logger.warn('🚨 EMERGENCY CLEANUP: Cleanup completed', {
        conversationId,
        totalMessages: allMessages.length,
        messagesWithoutBotpressId,
        duplicatesFound,
        duplicatesRemoved
      });

      return {
        duplicatesFound,
        duplicatesRemoved
      };
    } catch (error) {
      this.logger.error('❌ EMERGENCY CLEANUP: Failed', {
        error,
        conversationId
      });
      throw error;
    }
  }
}
