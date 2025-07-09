// services/botpress/services/conversation-message/conversation-message.service.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand
} from "@aws-sdk/lib-dynamodb";
import { Logger } from '@shared/utils/logger';
import { 
  ConversationMessageModel, 
  ConversationMessageData, 
  PaginatedMessages,
  MessageRole,
  MessageType
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
   */
  async messageExistsInConversation(conversationId: string, botpressMessageId: string): Promise<boolean> {
    try {
      if (!botpressMessageId) {
        return false; // Si no hay botpressMessageId, no podemos verificar duplicados
      }

      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'botpressMessageId = :botpressMessageId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':botpressMessageId': botpressMessageId
        },
        Select: 'COUNT',
        Limit: 1
      }));

      const exists = (result.Count || 0) > 0;

      this.logger.debug('Message existence check', {
        conversationId,
        botpressMessageId,
        exists
      });

      return exists;
    } catch (error) {
      this.logger.error('Error checking if message exists in conversation', {
        error,
        conversationId,
        botpressMessageId
      });
      return false; // En caso de error, permitir el guardado para no perder mensajes
    }
  }

  /**
   * Guarda un mensaje solo si no existe (evita duplicados)
   * Estrategia robusta de prevención de duplicados
   */
  async saveMessageIfNotExists(messageData: ConversationMessageData): Promise<ConversationMessageModel | null> {
    try {
      this.logger.debug('Attempting to save message if not exists', {
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role,
        hasContent: !!messageData.content
      });

      // Si tiene botpressMessageId, verificar que no exista en esta conversación
      if (messageData.botpressMessageId) {
        const exists = await this.messageExistsInConversation(
          messageData.conversationId,
          messageData.botpressMessageId
        );

        if (exists) {
          this.logger.info('Message already exists, skipping save', {
            botpressMessageId: messageData.botpressMessageId,
            conversationId: messageData.conversationId,
            role: messageData.role
          });

          // Retornar el mensaje existente
          const existingMessage = await this.getMessageByBotpressId(
            messageData.conversationId,
            messageData.botpressMessageId
          );
          return existingMessage;
        }
      }

      // Si no existe, guardarlo
      this.logger.info('Saving new message', {
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId,
        role: messageData.role
      });

      return await this.saveMessage(messageData);
    } catch (error) {
      this.logger.error('Error saving message if not exists', {
        error,
        conversationId: messageData.conversationId,
        botpressMessageId: messageData.botpressMessageId
      });
      throw error;
    }
  }

  /**
   * Obtiene un mensaje por su botpressMessageId en una conversación específica
   */
  async getMessageByBotpressId(conversationId: string, botpressMessageId: string): Promise<ConversationMessageModel | null> {
    try {
      if (!botpressMessageId) {
        return null;
      }

      this.logger.debug('Getting message by Botpress ID', {
        conversationId,
        botpressMessageId
      });

      const result = await this.dynamodb.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ConversationIndex',
        KeyConditionExpression: 'conversationId = :conversationId',
        FilterExpression: 'botpressMessageId = :botpressMessageId',
        ExpressionAttributeValues: {
          ':conversationId': conversationId,
          ':botpressMessageId': botpressMessageId
        },
        Limit: 1
      }));

      if (result.Items && result.Items.length > 0) {
        const message = ConversationMessageModel.fromDynamoDB(result.Items[0]);
        this.logger.debug('Found existing message by Botpress ID', {
          messageId: message.messageId,
          botpressMessageId,
          role: message.role
        });
        return message;
      }

      this.logger.debug('No message found by Botpress ID', {
        conversationId,
        botpressMessageId
      });
      return null;
    } catch (error) {
      this.logger.error('Error getting message by Botpress ID', {
        error,
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
        Limit: 1
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
}
