// services/botpress/services/token/token-management.service.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { CacheService } from '@shared/services/cache/cache.service';
import { TokenUsage, UserPlan } from '../../types/token-management.types';
import { BusinessMetricsService } from '@services/metrics/business-metrics.service';
import { AnomalyDetectionService } from '@services/metrics/anomaly-detection.service';

export class TokenManagementService {
  private static instance: TokenManagementService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly eventBridgeClient: EventBridgeClient;
  private readonly cacheService: CacheService;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly tableName: string;
  private readonly usersTableName: string;
  private readonly eventBusName: string;
  private readonly tokenLimits: Record<string, number>;
  private readonly cacheKeyPrefix: string = 'token-usage:';
  private readonly cacheTtl: number = 300; // 5 minutos

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
    this.eventBridgeClient = new EventBridgeClient({});
    this.cacheService = CacheService.getInstance();
    this.logger = new Logger('TokenManagementService');
    this.metrics = new MetricsService('TokenManagement');

    this.tableName = process.env.TOKEN_TABLE || `${process.env.RESOURCE_PREFIX}-token-usage-table`;
    this.usersTableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
    this.eventBusName = process.env.EVENT_BUS_NAME || `${process.env.RESOURCE_PREFIX}-event-bus`;

    // Configurar límites de tokens por plan
    this.tokenLimits = {
      [UserPlan.BASIC]: parseInt(process.env.TOKEN_LIMIT_BASIC || '1000'),
      [UserPlan.PRO]: parseInt(process.env.TOKEN_LIMIT_PRO || '2000'),
      [UserPlan.BUSINESS]: parseInt(process.env.TOKEN_LIMIT_BUSINESS || '4000'),
      [UserPlan.ENTERPRISE]: parseInt(process.env.TOKEN_LIMIT_ENTERPRISE || '8000')
    };
  }

  public static getInstance(): TokenManagementService {
    if (!TokenManagementService.instance) {
      TokenManagementService.instance = new TokenManagementService();
    }
    return TokenManagementService.instance;
  }

  /**
   * Obtiene el uso actual de tokens para un usuario
   * @param userId ID del usuario
   * @returns Información de uso de tokens
   */
  public async getUserTokenUsage(userId: string): Promise<TokenUsage> {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;

    try {
      // Intentar obtener de caché primero
      const cachedUsage = await this.cacheService.get<TokenUsage>(cacheKey);

      if (cachedUsage) {
        this.metrics.incrementCounter('TokenUsageCacheHit');
        this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
        return cachedUsage;
      }

      this.metrics.incrementCounter('TokenUsageCacheMiss');

      // Obtener de DynamoDB si no está en caché
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.tableName,
        Key: {
          userId,
          date: today
        }
      }));

      // Si existe un registro para hoy, devolverlo
      if (result.Item) {
        const usage = result.Item as TokenUsage;

        // Guardar en caché
        await this.cacheService.set(cacheKey, usage, { ttl: this.cacheTtl });

        this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
        return usage;
      }

      // Si no existe, crear un nuevo registro
      const userPlan = await this.getUserPlan(userId);
      const limit = this.tokenLimits[userPlan] || this.tokenLimits[UserPlan.BASIC];

      const newUsage: TokenUsage = {
        userId,
        date: today,
        planType: userPlan,
        dailyLimit: limit,
        totalTokens: 0,
        remainingTokens: limit,
        lastUpdated: new Date().toISOString(),
        resetTimestamp: this.getNextResetTimestamp(),
        alertsSent: [],
        overageCount: 0,
        overageTokens: 0
      };

      // Guardar el nuevo registro
      await this.dynamoDbClient.send(new PutCommand({
        TableName: this.tableName,
        Item: newUsage
      }));

      // Guardar en caché
      await this.cacheService.set(cacheKey, newUsage, { ttl: this.cacheTtl });

      this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
      return newUsage;
    } catch (error) {
      this.logger.error('Error getting user token usage', { error, userId });
      this.metrics.incrementCounter('TokenUsageRetrievalErrors');
      this.metrics.recordLatency('TokenUsageRetrievalLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Consume tokens de un usuario
   * @param userId ID del usuario
   * @param tokenCount Cantidad de tokens a consumir
   * @returns Resultado de la operación con información actualizada
   */
  public async consumeTokens(userId: string, tokenCount: number): Promise<{
    usage: TokenUsage;
    hasRemainingTokens: boolean;
    overage: boolean;
    alertTriggered: boolean;
    usagePercentage: number;
  }> {
    const startTime = Date.now();

    if (tokenCount <= 0) {
      throw new Error('Token count must be positive');
    }

    try {
      // Obtener uso actual
      const currentUsage = await this.getUserTokenUsage(userId);

      // Calcular nuevos valores
      const hasRemainingTokens = currentUsage.remainingTokens >= tokenCount;
      const actualTokensToConsume = hasRemainingTokens ? tokenCount : currentUsage.remainingTokens;

      const updatedUsage: TokenUsage = {
        ...currentUsage,
        totalTokens: currentUsage.totalTokens + actualTokensToConsume,
        remainingTokens: Math.max(0, currentUsage.remainingTokens - actualTokensToConsume),
        lastUpdated: new Date().toISOString()
      };

      // Si se consume más de lo disponible, registrar overage
      const overage = !hasRemainingTokens;
      if (overage) {
        const overageTokens = tokenCount - actualTokensToConsume;
        updatedUsage.overageCount = (currentUsage.overageCount || 0) + 1;
        updatedUsage.overageTokens = (currentUsage.overageTokens || 0) + overageTokens;

        // Actualizar metadata si existe
        if (updatedUsage.metadata) {
          updatedUsage.metadata.overageCost = this.calculateOverageCost(
            updatedUsage.overageTokens,
            updatedUsage.planType
          );
        } else {
          updatedUsage.metadata = {
            overageCost: this.calculateOverageCost(
              updatedUsage.overageTokens,
              updatedUsage.planType
            )
          };
        }
      }

      // Actualizar en DynamoDB
      await this.dynamoDbClient.send(new PutCommand({
        TableName: this.tableName,
        Item: updatedUsage
      }));

      // Actualizar caché
      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;
      await this.cacheService.set(cacheKey, updatedUsage, { ttl: this.cacheTtl });

      // Calcular porcentaje de uso
      const usagePercentage = ((updatedUsage.dailyLimit - updatedUsage.remainingTokens) / updatedUsage.dailyLimit) * 100;

      // Verificar umbrales y enviar alertas si es necesario
      const alertTriggered = await this.checkThresholds(updatedUsage, usagePercentage);

      this.metrics.incrementCounter('TokensConsumed', actualTokensToConsume);
      if (overage) {
        this.metrics.incrementCounter('TokenOverages');
      }
      this.metrics.recordLatency('TokenConsumptionLatency', Date.now() - startTime);

      // Reportar como métrica de negocio
      const metricsService = BusinessMetricsService.getInstance();
      await metricsService.trackTokenUsage(
        userId,
        tokenCount,
        updatedUsage.planType,
        updatedUsage.metadata?.lastConversationId
      );

      // Verificar anomalías en el uso de tokens
      if (tokenCount > 0) {
        const anomalyService = AnomalyDetectionService.getInstance();
        await anomalyService.evaluateMetric(
          'TokensUsed',
          tokenCount,
          { userId, plan: updatedUsage.planType }
        );
      }

      return {
        usage: updatedUsage,
        hasRemainingTokens,
        overage,
        alertTriggered,
        usagePercentage
      };
    } catch (error) {
      this.logger.error('Error consuming tokens', { error, userId, tokenCount });
      this.metrics.incrementCounter('TokenConsumptionErrors');
      this.metrics.recordLatency('TokenConsumptionLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Verifica si hay suficientes tokens disponibles
   * @param userId ID del usuario
   * @param requiredTokens Tokens requeridos
   * @returns true si hay suficientes tokens disponibles
   */
  public async checkTokenAvailability(userId: string, requiredTokens: number): Promise<boolean> {
    try {
      const usage = await this.getUserTokenUsage(userId);
      const available = usage.remainingTokens >= requiredTokens;

      if (!available) {
        this.metrics.incrementCounter('InsufficientTokenChecks');
      }

      return available;
    } catch (error) {
      this.logger.error('Error checking token availability', { error, userId, requiredTokens });
      this.metrics.incrementCounter('TokenAvailabilityCheckErrors');
      throw error;
    }
  }

  /**
   * Resetea los tokens diarios para un usuario
   * @param userId ID del usuario
   * @returns Información de uso actualizada
   */
  public async resetDailyTokens(userId: string): Promise<TokenUsage> {
    const startTime = Date.now();
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      // Obtener plan del usuario
      const userPlan = await this.getUserPlan(userId);
      const limit = this.tokenLimits[userPlan] || this.tokenLimits[UserPlan.BASIC];

      // Crear nuevo registro de uso
      const newUsage: TokenUsage = {
        userId,
        date: date,
        planType: userPlan,
        dailyLimit: limit,
        totalTokens: 0,
        remainingTokens: limit,
        lastUpdated: new Date().toISOString(),
        resetTimestamp: this.getNextResetTimestamp(),
        alertsSent: [],
        overageCount: 0,
        overageTokens: 0
      };

      // Actualizar DynamoDB
      await this.dynamoDbClient.send(new PutCommand({
        TableName: this.tableName,
        Item: newUsage
      }));

      const today = new Date().toISOString().split('T')[0];
      const cacheKey = `${this.cacheKeyPrefix}${userId}:${today}`;
      await this.cacheService.set(cacheKey, newUsage, { ttl: this.cacheTtl });

      this.metrics.incrementCounter('TokensReset');
      this.metrics.recordLatency('TokenResetLatency', Date.now() - startTime);

      return newUsage;
    } catch (error) {
      this.logger.error('Error resetting daily tokens', { error, userId });
      this.metrics.incrementCounter('TokenResetErrors');
      this.metrics.recordLatency('TokenResetLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Obtiene el historial de uso de tokens de un usuario
   * @param userId ID del usuario
   * @param startDate Fecha de inicio (YYYY-MM-DD)
   * @param endDate Fecha de fin (YYYY-MM-DD)
   * @returns Historial de uso de tokens
   */
  public async getTokenUsageHistory(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<TokenUsage[]> {
    const startTime = Date.now();

    try {
      const result = await this.dynamoDbClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :userId AND #date BETWEEN :startDate AND :endDate',
        ExpressionAttributeNames: {
          '#date': 'date'
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':startDate': startDate,
          ':endDate': endDate
        }
      }));

      this.metrics.recordLatency('TokenHistoryRetrievalLatency', Date.now() - startTime);
      return (result.Items || []) as TokenUsage[];
    } catch (error) {
      this.logger.error('Error getting token usage history', { error, userId, startDate, endDate });
      this.metrics.incrementCounter('TokenHistoryRetrievalErrors');
      this.metrics.recordLatency('TokenHistoryRetrievalLatency', Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Verifica umbrales de alerta y envía eventos si es necesario
   * @param usage Información de uso actual
   * @param usagePercentage Porcentaje de uso
   * @returns true si se ha enviado alguna alerta
   */
  private async checkThresholds(usage: TokenUsage, usagePercentage: number): Promise<boolean> {
    try {
      // Definir umbrales y sus tipos
      const thresholds = [
        { percentage: 80, type: 'APPROACHING_LIMIT' },
        { percentage: 90, type: 'NEAR_LIMIT' },
        { percentage: 100, type: 'LIMIT_REACHED' }
      ];

      // Encontrar el umbral más alto que se ha cruzado
      const threshold = thresholds
        .filter(t => usagePercentage >= t.percentage)
        .sort((a, b) => b.percentage - a.percentage)[0];

      if (!threshold) {
        return false;
      }

      // Verificar si ya se ha enviado una alerta para este umbral hoy
      const alertId = `${threshold.type}_${usage.date}`;
      if (usage.alertsSent && usage.alertsSent.includes(alertId)) {
        return false;
      }

      // Enviar alerta via EventBridge
      const success = await this.sendTokenAlert(usage, usagePercentage, threshold.type);

      if (success) {
        // Actualizar lista de alertas enviadas
        const updatedAlertsSent = [...(usage.alertsSent || []), alertId];

        await this.dynamoDbClient.send(new UpdateCommand({
          TableName: this.tableName,
          Key: {
            userId: usage.userId,
            date: usage.date
          },
          UpdateExpression: 'SET alertsSent = :alertsSent',
          ExpressionAttributeValues: {
            ':alertsSent': updatedAlertsSent
          }
        }));

        // Actualizar caché
        const cacheKey = `${this.cacheKeyPrefix}${usage.userId}:${usage.date}`;
        await this.cacheService.get<TokenUsage>(cacheKey).then(cachedUsage => {
          if (cachedUsage) {
            cachedUsage.alertsSent = updatedAlertsSent;
            this.cacheService.set(cacheKey, cachedUsage, { ttl: this.cacheTtl });
          }
        });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking token thresholds', { error, userId: usage.userId });
      this.metrics.incrementCounter('TokenThresholdCheckErrors');
      return false;
    }
  }

  /**
   * Envía una alerta de tokens via EventBridge
   * @param usage Información de uso
   * @param usagePercentage Porcentaje de uso
   * @param alertType Tipo de alerta
   * @returns true si se ha enviado correctamente
   */
  private async sendTokenAlert(
    usage: TokenUsage,
    usagePercentage: number,
    alertType: string
  ): Promise<boolean> {
    try {
      const event = {
        Source: 'spectrum.token-service',
        DetailType: 'token-usage-alert',
        Detail: JSON.stringify({
          userId: usage.userId,
          usagePercentage,
          plan: usage.planType,
          remainingTokens: usage.remainingTokens,
          dailyLimit: usage.dailyLimit,
          alertType,
          timestamp: new Date().toISOString()
        }),
        EventBusName: this.eventBusName
      };

      await this.eventBridgeClient.send(new PutEventsCommand({
        Entries: [event]
      }));

      this.logger.info('Token alert sent', {
        userId: usage.userId,
        usagePercentage,
        alertType
      });

      this.metrics.incrementCounter('TokenAlertsSent');
      return true;
    } catch (error) {
      this.logger.error('Error sending token alert', { error, userId: usage.userId });
      this.metrics.incrementCounter('TokenAlertErrors');
      return false;
    }
  }

  /**
   * Calcula el costo estimado de tokens en overage
   * @param overageTokens Cantidad de tokens en overage
   * @param planType Tipo de plan
   * @returns Costo estimado en USD
   */
  private calculateOverageCost(overageTokens: number, planType: UserPlan): number {
    // Tasas ficticias por 1000 tokens, ajustar según política real
    const rates = {
      [UserPlan.BASIC]: 2.0,
      [UserPlan.PRO]: 1.8,
      [UserPlan.BUSINESS]: 1.5,
      [UserPlan.ENTERPRISE]: 1.0
    };

    const rate = rates[planType] || rates[UserPlan.BASIC];
    return (overageTokens / 1000) * rate;
  }

  /**
   * Obtiene el timestamp para el próximo reset de tokens
   * @returns Timestamp ISO 8601
   */
  private getNextResetTimestamp(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  /**
   * Obtiene el plan del usuario
   * @param userId ID del usuario
   * @returns Tipo de plan
   */
  private async getUserPlan(userId: string): Promise<UserPlan> {
    try {
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.usersTableName,
        Key: { userId }
      }));

      if (result.Item && result.Item.userType) {
        // Mapear userType a UserPlan
        switch (result.Item.userType.toLowerCase()) {
          case 'pro':
            return UserPlan.PRO;
          case 'business':
            return UserPlan.BUSINESS;
          case 'enterprise':
            return UserPlan.ENTERPRISE;
          default:
            return UserPlan.BASIC;
        }
      }

      return UserPlan.BASIC;
    } catch (error) {
      this.logger.error('Error getting user plan', { error, userId });
      this.metrics.incrementCounter('UserPlanRetrievalErrors');
      return UserPlan.BASIC;
    }
  }
}