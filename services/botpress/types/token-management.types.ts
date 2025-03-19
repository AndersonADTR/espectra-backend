// services/botpress/types/token-management.types.ts

/**
 * Planes disponibles en la plataforma
 */
export enum UserPlan {
    BASIC = 'basic',
    PRO = 'pro',
    BUSINESS = 'business',
    ENTERPRISE = 'enterprise'
}
  
/**
 * Interfaz que define el registro de uso de tokens
 */
export interface TokenUsage {
    // Clave compuesta en DynamoDB: userId + date
    userId: string;
    date: string;

    // Información del plan
    planType: UserPlan;
    dailyLimit: number;

    // Consumo actual
    totalTokens: number;
    remainingTokens: number;

    // Marcas de tiempo
    lastUpdated: string;
    resetTimestamp: string;

    // Alertas y estado
    alertsSent: string[];  // timestamps de las alertas enviadas
    overageCount: number;  // veces que ha excedido el límite
    overageTokens: number; // tokens consumidos después del límite

    // Información adicional
    metadata?: {
        lastConversationId?: string;
        lastMessageTokens?: number;
        overageCost?: number;
        billable?: boolean;
        channel?: string;
        customData?: Record<string, any>;
    };

    // Time-to-live para expiración automática en DynamoDB
    ttl?: number;
}

/**
 * Resultado de una operación de consumo de tokens
 */
export interface TokenConsumptionResult {
    // Registro actualizado del uso de tokens
    usage: TokenUsage;

    // Indica si hay suficientes tokens disponibles
    hasRemainingTokens: boolean;

    // Si se han consumido tokens en overage (más allá del límite)
    overage: boolean;

    // Si se acaba de enviar una alerta
    alertTriggered: boolean;

    // Porcentaje de uso actual
    usagePercentage: number;
}

/**
 * Configuración para envío de alertas de uso de tokens
 */
export interface TokenAlertConfig {
    // Umbrales para las alertas (porcentajes)
    thresholds: number[];

    // Canales disponibles para alertas
    channels: ('email' | 'push' | 'sms' | 'in-app')[];

    // Si se debe enviar una alerta cuando se alcanza el límite
    alertOnLimit: boolean;

    // Si se debe enviar una alerta cuando se entra en overage
    alertOnOverage: boolean;

    // Tiempo mínimo entre alertas (en horas)
    minTimeBetweenAlerts: number;
}

/**
 * Interfaz para estadísticas históricas de uso de tokens
 */
export interface TokenUsageStats {
    // Estadísticas básicas
    dailyAverage: number;
    peakUsage: number;
    totalDays: number;

    // Distribución por días de la semana
    dayOfWeekDistribution: Record<string, number>;

    // Distribución por horas
    hourlyDistribution: Record<string, number>;

    // Tendencia (porcentaje de cambio respecto a periodo anterior)
    trend: number;

    // Datos adicionales
    overageDays: number;
    averageOverage: number;
    alertFrequency: number;
}

/**
 * Opciones para consulta de historial de uso de tokens
 */
export interface TokenHistoryOptions {
    // Fecha de inicio para la consulta
    startDate: string;

    // Fecha de fin para la consulta
    endDate: string;

    // Si se deben incluir estadísticas calculadas
    includeStats?: boolean;

    // Si se deben agrupar por día, semana o mes
    groupBy?: 'day' | 'week' | 'month';

    // Filtros adicionales
    filters?: {
        minUsage?: number;
        maxUsage?: number;
        hasOverage?: boolean;
    };
}