// services/botpress/services/context/conversation-context.service.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CacheService } from '@shared/services/cache/cache.service';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { ConversationStatus, ConversationType } from '../../types/conversation-context.types';

export interface ConversationContext {
  conversationId: string;
  userId: string;
  status: ConversationStatus;
  type: ConversationType;
  createdAt: number;
  updatedAt: number;
  lastActivity: number;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'advisor';
    content: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }>;
  botpressContext?: Record<string, any>;
  handoffContext?: {
    handoffCount: number;
    lastAdvisorId?: string;
    lastHandoffReason?: string;
    lastHandoffTimestamp?: number;
  };
  metadata?: Record<string, any>;
  ttl?: number;
}

export class ConversationContextService {
  private static instance: ConversationContextService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly cacheService: CacheService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly tableName: string;
  private readonly cacheKeyPrefix: string = 'conversation:';
  private readonly defaultTtl: number = 30 * 24 * 60 * 60; // 30 días en segundos

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        // Eliminar valores undefined de los objetos
        removeUndefinedValues: true,
        // Convertir valores vacíos (strings, sets, listas) a null
        convertEmptyValues: true
      }
    });
    this.cacheService = CacheService.getInstance();
    this.logger = new Logger('ConversationContextService');
    this.metrics = new MetricsService('ConversationContext');
    this.tableName = process.env.CONTEXT_TABLE || `${process.env.SERVICE_NAME}-${process.env.STAGE}-conversation-context-table`;
  }

  public static getInstance(): ConversationContextService {
    if (!ConversationContextService.instance) {
      ConversationContextService.instance = new ConversationContextService();
    }
    return ConversationContextService.instance;
  }

  /**
   * Obtiene el contexto de una conversación
   * @param conversationId ID de la conversación
   * @returns Contexto de la conversación o null si no existe
   */
  public async getContext(conversationId: string): Promise<ConversationContext | null> {
    const startTime = Date.now();

    try {
      // Intentar obtener de caché primero
      const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
      const cachedContext = await this.cacheService.get<ConversationContext>(cacheKey);

      if (cachedContext) {
        this.logger.debug('Context retrieved from cache', { conversationId });
        this.metrics.incrementCounter('CacheHit');
        this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
        return cachedContext;
      }

      this.metrics.incrementCounter('CacheMiss');

      // Si no está en caché, obtener de DynamoDB
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.tableName,
        Key: { conversationId }
      }));

      if (!result.Item) {
        this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
        return null;
      }

      const context = result.Item as ConversationContext;

      // Actualizar el caché para futuras peticiones
      await this.cacheService.set(cacheKey, context, { ttl: 900 }); // 15 minutos TTL

      this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
      return context;
    } catch (error) {
      this.logger.error('Error retrieving conversation context', { error, conversationId });
      this.metrics.incrementCounter('ContextRetrievalErrors');
      this.metrics.recordLatency('ContextRetrievalLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Guarda un nuevo contexto de conversación
   * @param context Contexto a guardar
   * @returns El contexto guardado
   */
  public async saveContext(context: ConversationContext): Promise<ConversationContext> {
    const startTime = Date.now();

    try {
      const timestamp = Date.now();
      const contextToSave: ConversationContext = {
        ...context,
        createdAt: context.createdAt || timestamp,
        updatedAt: timestamp,
        lastActivity: timestamp,
        status: context.status || ConversationStatus.ACTIVE,
        type: context.type || ConversationType.BOT,
        ttl: Math.floor(timestamp / 1000) + this.defaultTtl
      };

      await this.dynamoDbClient.send(new PutCommand({
        TableName: this.tableName,
        Item: contextToSave
      }));

      // Actualizar caché
      const cacheKey = `${this.cacheKeyPrefix}${context.conversationId}`;
      await this.cacheService.set(cacheKey, contextToSave, { ttl: 900 }); // 15 minutos TTL

      this.metrics.incrementCounter('ContextSaved');
      this.metrics.recordLatency('ContextSaveLatency', Date.now() - startTime);

      return contextToSave;
    } catch (error) {
      this.logger.error('Error saving conversation context', { error, conversationId: context.conversationId });
      this.metrics.incrementCounter('ContextSaveErrors');
      this.metrics.recordLatency('ContextSaveLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Actualiza un contexto existente
   * @param conversationId ID de la conversación
   * @param updates Actualizaciones parciales
   * @returns El contexto actualizado
   */
  public async updateContext(conversationId: string, updates: Partial<ConversationContext>): Promise<ConversationContext> {
    const startTime = Date.now();

    try {
      const timestamp = Date.now();

      // Excluir propiedades que no se deben actualizar directamente
      const { conversationId: id, createdAt, ttl, updatedAt, lastActivity, ...validUpdates } = updates as any;

      // Construir expresión de actualización dinámicamente
      const updateExpressionParts: string[] = ['#updatedAt = :updatedAt, #lastActivity = :lastActivity'];
      const expressionAttributeValues: Record<string, any> = {
        ':updatedAt': timestamp,
        ':lastActivity': timestamp
      };

      const expressionAttributeNames: Record<string, string> = {
        '#updatedAt': 'updatedAt',
        '#lastActivity': 'lastActivity'
      };

      Object.entries(validUpdates).forEach(([key, value]) => {
        if (value !== undefined) {
          updateExpressionParts.push(`#${key} = :${key}`);
          expressionAttributeValues[`:${key}`] = value;
          expressionAttributeNames[`#${key}`] = key;
        }
      });

      const updateExpression = `set ${updateExpressionParts.join(', ')}`;

      const result = await this.dynamoDbClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { conversationId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        throw new Error(`Failed to update conversation context: ${conversationId}`);
      }

      const updatedContext = result.Attributes as ConversationContext;

      // Actualizar caché
      const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
      await this.cacheService.set(cacheKey, updatedContext, { ttl: 900 }); // 15 minutos TTL

      this.metrics.incrementCounter('ContextUpdated');
      this.metrics.recordLatency('ContextUpdateLatency', Date.now() - startTime);

      return updatedContext;
    } catch (error) {
      this.logger.error('Error updating conversation context', { error, conversationId });
      this.metrics.incrementCounter('ContextUpdateErrors');
      this.metrics.recordLatency('ContextUpdateLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Elimina un contexto de conversación
   * @param conversationId ID de la conversación
   * @returns true si se eliminó correctamente
   */
  public async deleteContext(conversationId: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      await this.dynamoDbClient.send(new DeleteCommand({
        TableName: this.tableName,
        Key: { conversationId }
      }));

      // Eliminar de caché
      const cacheKey = `${this.cacheKeyPrefix}${conversationId}`;
      await this.cacheService.delete(cacheKey);

      this.metrics.incrementCounter('ContextDeleted');
      this.metrics.recordLatency('ContextDeleteLatency', Date.now() - startTime);

      return true;
    } catch (error) {
      this.logger.error('Error deleting conversation context', { error, conversationId });
      this.metrics.incrementCounter('ContextDeleteErrors');
      this.metrics.recordLatency('ContextDeleteLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Lista todos los contextos de un usuario
   * @param userId ID del usuario
   * @returns Lista de contextos
   */
  public async listUserContexts(userId: string): Promise<ConversationContext[]> {
    const startTime = Date.now();

    try {
      // Asumir que hay un GSI sobre userId
      const result = await this.dynamoDbClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }));

      this.metrics.recordLatency('ContextListLatency', Date.now() - startTime);
      return (result.Items || []) as ConversationContext[];
    } catch (error) {
      this.logger.error('Error listing user conversation contexts', { error, userId });
      this.metrics.incrementCounter('ContextListErrors');
      this.metrics.recordLatency('ContextListLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Busca conversaciones por criterios
   * @param criteria Criterios de búsqueda
   * @returns Lista de conversaciones que cumplen los criterios
   */
  public async searchConversations(criteria: {
    userId?: string;
    status?: ConversationStatus | ConversationStatus[];
    type?: ConversationType | ConversationType[];
    startDate?: number;
    endDate?: number;
    limit?: number;
    lastEvaluatedKey?: Record<string, any>;
  }): Promise<{ items: ConversationContext[]; lastEvaluatedKey?: Record<string, any> }> {
    const startTime = Date.now();

    try {
      // Esta implementación asume que hay GSIs apropiados configurados
      // Para implementaciones avanzadas, considerar escaneos filtrados o múltiples queries

      let filterExpressions: string[] = [];
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};

      // Determinar si usamos GSI o tabla principal basado en criterios
      let indexName: string | undefined;
      let keyConditionExpression: string;

      if (criteria.userId) {
        indexName = 'UserIdIndex';
        keyConditionExpression = 'userId = :userId';
        expressionAttributeValues[':userId'] = criteria.userId;
      } else {
        // Fallback a scan si no hay criterios de índice
        throw new Error('At least one key condition is required');
      }

      // Añadir filtros adicionales
      if (criteria.status) {
        if (Array.isArray(criteria.status)) {
          const statusFilters = criteria.status.map((s, i) => `:status${i}`);
          filterExpressions.push(`#status IN (${statusFilters.join(', ')})`);
          expressionAttributeNames['#status'] = 'status';
          criteria.status.forEach((s, i) => {
            expressionAttributeValues[`:status${i}`] = s;
          });
        } else {
          filterExpressions.push('#status = :status');
          expressionAttributeNames['#status'] = 'status';
          expressionAttributeValues[':status'] = criteria.status;
        }
      }

      if (criteria.type) {
        if (Array.isArray(criteria.type)) {
          const typeFilters = criteria.type.map((t, i) => `:type${i}`);
          filterExpressions.push(`#type IN (${typeFilters.join(', ')})`);
          expressionAttributeNames['#type'] = 'type';
          criteria.type.forEach((t, i) => {
            expressionAttributeValues[`:type${i}`] = t;
          });
        } else {
          filterExpressions.push('#type = :type');
          expressionAttributeNames['#type'] = 'type';
          expressionAttributeValues[':type'] = criteria.type;
        }
      }

      if (criteria.startDate && criteria.endDate) {
        filterExpressions.push('createdAt BETWEEN :startDate AND :endDate');
        expressionAttributeValues[':startDate'] = criteria.startDate;
        expressionAttributeValues[':endDate'] = criteria.endDate;
      } else if (criteria.startDate) {
        filterExpressions.push('createdAt >= :startDate');
        expressionAttributeValues[':startDate'] = criteria.startDate;
      } else if (criteria.endDate) {
        filterExpressions.push('createdAt <= :endDate');
        expressionAttributeValues[':endDate'] = criteria.endDate;
      }

      const queryParams: any = {
        TableName: this.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: criteria.limit || 20
      };

      if (filterExpressions.length > 0) {
        queryParams.FilterExpression = filterExpressions.join(' AND ');
        queryParams.ExpressionAttributeNames = expressionAttributeNames;
      }

      if (criteria.lastEvaluatedKey) {
        queryParams.ExclusiveStartKey = criteria.lastEvaluatedKey;
      }

      const result = await this.dynamoDbClient.send(new QueryCommand(queryParams));

      this.metrics.recordLatency('ContextSearchLatency', Date.now() - startTime);

      return {
        items: (result.Items || []) as ConversationContext[],
        lastEvaluatedKey: result.LastEvaluatedKey
      };
    } catch (error) {
      this.logger.error('Error searching conversations', { error, criteria });
      this.metrics.incrementCounter('ContextSearchErrors');
      this.metrics.recordLatency('ContextSearchLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Actualiza el estado de una conversación
   * @param conversationId ID de la conversación
   * @param status Nuevo estado
   * @returns Contexto actualizado
   */
  public async updateStatus(conversationId: string, status: ConversationStatus): Promise<ConversationContext> {
    return this.updateContext(conversationId, { status });
  }

  /**
   * Actualiza el contexto de handoff de una conversación
   * @param conversationId ID de la conversación
   * @param handoffContext Información del handoff
   * @returns Contexto actualizado
   */
  public async updateHandoffContext(
    conversationId: string,
    handoffContext: ConversationContext['handoffContext']
  ): Promise<ConversationContext> {
    return this.updateContext(conversationId, { handoffContext });
  }

  /**
   * Añade un mensaje al historial de la conversación
   * @param conversationId ID de la conversación
   * @param message Mensaje a añadir
   * @returns Contexto actualizado
   */
  public async addMessage(
    conversationId: string,
    message: {
      role: 'user' | 'assistant' | 'system' | 'advisor';
      content: string;
      timestamp?: number;
    }
  ): Promise<ConversationContext> {
    const context = await this.getContext(conversationId);

    if (!context) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newMessage = {
      ...message,
      timestamp: message.timestamp || Date.now()
    };

    const messages = [...context.messages, newMessage];

    return this.updateContext(conversationId, {
      messages,
      lastActivity: newMessage.timestamp
    });
  }
}