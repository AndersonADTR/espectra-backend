// services/botpress/services/health/botpress-health.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressChatService } from '../chat/botpress-chat.service';
import { BOTPRESS_CONFIG } from 'services/botpress/config/config';
import { BotpressError } from '../../utils/errors';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  components: {
    api: ComponentHealth;
    nlu: ComponentHealth;
    database: ComponentHealth;
  };
  lastChecked: string;
  details?: Record<string, any>;
}

interface ComponentHealth {
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  error?: string;
}

export class BotpressHealthService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly chatService: BotpressChatService;
  private healthCheckCache: HealthCheckResult | null = null;
  private readonly CACHE_TTL = 30000; // 30 segundos

  constructor() {
    this.logger = new Logger('BotpressHealthService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.chatService = new BotpressChatService();
  }

  async checkHealth(force: boolean = false): Promise<HealthCheckResult> {
    try {
      // Retornar resultado cacheado si está disponible y no se fuerza la actualización
      if (!force && this.healthCheckCache && 
          Date.now() - new Date(this.healthCheckCache.lastChecked).getTime() < this.CACHE_TTL) {
        return this.healthCheckCache;
      }

      const startTime = Date.now();
      const [apiHealth, nluHealth, databaseHealth] = await Promise.all([
        this.checkApiHealth(),
        this.checkNLUHealth(),
        this.checkDatabaseHealth()
      ]);

      const health: HealthCheckResult = {
        status: this.determineOverallStatus(apiHealth, nluHealth, databaseHealth),
        latency: Date.now() - startTime,
        components: {
          api: apiHealth,
          nlu: nluHealth,
          database: databaseHealth
        },
        lastChecked: new Date().toISOString()
      };

      // Actualizar caché
      this.healthCheckCache = health;

      // Registrar métricas
      this.recordHealthMetrics(health);

      this.logger.info('Health check completed', {
        status: health.status,
        latency: health.latency
      });

      return health;
    } catch (error) {
      this.logger.error('Health check failed', { error });
      throw new BotpressError('Failed to perform health check');
    }
  }

  private async checkApiHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      const pingResponse = await fetch(
        `${BOTPRESS_CONFIG.webhookUrl}/health`, 
        { method: 'GET' }
      );

      const latency = Date.now() - startTime;

      if (!pingResponse.ok) {
        return {
          status: 'degraded',
          latency,
          error: `HTTP ${pingResponse.status}`
        };
      }

      return {
        status: 'operational',
        latency
      };
    } catch (error) {
      return {
        status: 'down',
        error: (error as ComponentHealth).error
      };
    }
  }

  private async checkNLUHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      // Enviar un mensaje de prueba simple para verificar NLU
      const response = await this.chatService.sendMessage({
          conversationId: `health_${Date.now()}`,
          text: 'health_check',
          userId: 'system',
          conversation_id: 'health_conversation_id_check',
          message: 'health_message_check'
      });

      const latency = Date.now() - startTime;

      if (!response || !response.responses) {
        return {
          status: 'degraded',
          latency,
          error: 'Invalid NLU response'
        };
      }

      return {
        status: 'operational',
        latency
      };
    } catch (error) {
      return {
        status: 'down',
        error: (error as ComponentHealth).error
      };
    }
  }

  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    try {
      // Intentar una operación simple en DynamoDB
      const ddb = new DynamoDB({});
      await ddb.describeTable({
        TableName: process.env.CONVERSATION_CONTEXT_TABLE || ''
      });

      return {
        status: 'operational',
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'down',
        error: (error as ComponentHealth).error
      };
    }
  }

  private determineOverallStatus(
    apiHealth: ComponentHealth,
    nluHealth: ComponentHealth,
    databaseHealth: ComponentHealth
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const components = [apiHealth, nluHealth, databaseHealth];
    const downCount = components.filter(c => c.status === 'down').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;

    if (downCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  private recordHealthMetrics(health: HealthCheckResult): void {
    // Registrar estado general
    this.metrics.recordMetric(
      'BotpressHealth',
      health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0
    );

    // Registrar latencias
    this.metrics.recordLatency('BotpressApiLatency', health.components.api.latency || 0);
    this.metrics.recordLatency('BotpressNLULatency', health.components.nlu.latency || 0);
    this.metrics.recordLatency('BotpressDatabaseLatency', health.components.database.latency || 0);

    // Registrar estado de componentes individuales
    Object.entries(health.components).forEach(([component, status]) => {
      this.metrics.recordMetric(
        `Botpress${component.charAt(0).toUpperCase() + component.slice(1)}Status`,
        status.status === 'operational' ? 1 : status.status === 'degraded' ? 0.5 : 0
      );
    });
  }

  async getHealthReport(timeRange: { startDate: string; endDate: string }): Promise<{
    uptime: number;
    averageLatency: number;
    incidents: number;
    degradations: number;
  }> {
    try {
      // Implementar lógica para generar reporte de salud histórico
      // Esto requeriría una tabla adicional para almacenar los resultados de health checks

      return {
        uptime: 0,
        averageLatency: 0,
        incidents: 0,
        degradations: 0
      };
    } catch (error) {
      this.logger.error('Failed to generate health report', { error });
      throw new BotpressError('Failed to generate health report');
    }
  }
}