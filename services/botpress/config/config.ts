// services/botpress/config/config.ts

/**
 * Configuración de monitoreo y métricas para el sistema SPECTRUM
 */
export const MONITORING_CONFIG = {
    /**
     * Configuración de métricas en CloudWatch
     */
    METRICS: {
      // Namespace para métricas en CloudWatch
      NAMESPACE: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
      
      // Dimensiones predeterminadas para todas las métricas
      DEFAULT_DIMENSIONS: {
        Service: process.env.SERVICE_NAME || 'spectrum',
        Environment: process.env.STAGE || 'dev',
        Component: 'Concierge'
      },
      
      // Configuración de muestreo para métricas de alto volumen
      SAMPLING: {
        // Porcentaje de muestras a recolectar (1.0 = 100%)
        MESSAGE_RATE: parseFloat(process.env.METRICS_SAMPLING_RATE || '1.0'),
        TOKEN_USAGE_RATE: parseFloat(process.env.TOKEN_USAGE_SAMPLING_RATE || '1.0')
      }
    },
    
    /**
     * Configuración para el sistema de alertas
     */
    ALERTS: {
      // Tópicos SNS para notificaciones
      SNS_TOPICS: {
        CRITICAL: process.env.SNS_TOPIC_CRITICAL || '',
        HIGH: process.env.SNS_TOPIC_HIGH || '',
        MEDIUM: process.env.SNS_TOPIC_MEDIUM || '',
        LOW: process.env.SNS_TOPIC_LOW || ''
      },
      
      // Umbrales de alertas
      THRESHOLDS: {
        // Porcentaje de uso de tokens que desencadena alertas
        TOKEN_USAGE_ALERT: parseInt(process.env.TOKEN_USAGE_ALERT_THRESHOLD || '80'),
        // Tasa de error máxima aceptable
        ERROR_RATE_THRESHOLD: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.05'),
        // Latencia máxima aceptable en ms
        LATENCY_THRESHOLD: parseInt(process.env.LATENCY_THRESHOLD || '1000')
      }
    },
    
    /**
     * Configuración para el sistema de handoff
     */
    HANDOFF: {
      // Prioridad predeterminada para solicitudes de handoff
      DEFAULT_PRIORITY: parseInt(process.env.HANDOFF_DEFAULT_PRIORITY || '5'),
      
      // Umbral de confianza para solicitar handoff automático
      CONFIDENCE_THRESHOLD: parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4'),
      
      // Tiempo máximo de espera para asignación (segundos)
      MAX_QUEUE_TIME: parseInt(process.env.HANDOFF_MAX_QUEUE_TIME || '300'),
      
      // Tiempo de inactividad antes de finalizar un handoff automáticamente (segundos)
      INACTIVITY_TIMEOUT: parseInt(process.env.HANDOFF_INACTIVITY_TIMEOUT || '600')
    },
    
    // TODO: Add SSE configuration in Phase 2
    // WebSocket configuration removed as part of migration to SSE
    
    /**
     * Configuración para la integración con Botpress
     */
    BOTPRESS: {
      // Tiempo de espera para solicitudes a Botpress (milisegundos)
      TIMEOUT: parseInt(process.env.BOTPRESS_TIMEOUT || '5000'),
      
      // Número máximo de reintentos para solicitudes fallidas
      MAX_RETRIES: parseInt(process.env.BOTPRESS_MAX_RETRIES || '3'),
      
      // Intervalo base para backoff exponencial (milisegundos)
      RETRY_INTERVAL: parseInt(process.env.BOTPRESS_RETRY_INTERVAL || '500')
    }
  };
  
  /**
   * Configuración de planes y límites de tokens
   */
  export const PLAN_CONFIG = {
    TOKEN_LIMITS: {
      basic: parseInt(process.env.TOKEN_LIMIT_BASIC || '1000'),
      pro: parseInt(process.env.TOKEN_LIMIT_PRO || '2000'),
      business: parseInt(process.env.TOKEN_LIMIT_BUSINESS || '4000'),
      enterprise: parseInt(process.env.TOKEN_LIMIT_ENTERPRISE || '8000')
    },
    
    // Porcentaje a partir del cual se envía alerta de uso
    ALERT_THRESHOLD: parseInt(process.env.TOKEN_ALERT_THRESHOLD || '80'),
    
    // Permitir exceder límite en ciertos planes
    ALLOW_OVERAGE: {
      basic: false,
      pro: true,
      business: true,
      enterprise: true
    },
    
    // Costo por token adicional (en centavos)
    OVERAGE_COST: {
      basic: 0.002,
      pro: 0.0015,
      business: 0.001,
      enterprise: 0.0008
    }
  };
  
  /**
   * Configuración de seguridad
   */
  export const SECURITY_CONFIG = {
    // TTL para tokens en blacklist (segundos)
    TOKEN_BLACKLIST_TTL: parseInt(process.env.TOKEN_BLACKLIST_TTL || '86400'),
    
    // Niveles de rate limiting (solicitudes por minuto)
    RATE_LIMITS: {
      DEFAULT: parseInt(process.env.RATE_LIMIT_DEFAULT || '60'),
      HIGH: parseInt(process.env.RATE_LIMIT_HIGH || '300'),
      MESSAGE: parseInt(process.env.RATE_LIMIT_MESSAGE || '120')
    },
    
    // Habilitación de validación de webhook
    VERIFY_WEBHOOK_SIGNATURE: process.env.VERIFY_WEBHOOK_SIGNATURE !== 'false'
  };
  
  // Exportar todos los bloques de configuración juntos
  export default {
    MONITORING: MONITORING_CONFIG,
    PLAN: PLAN_CONFIG,
    SECURITY: SECURITY_CONFIG
  };

  /**
   * Configuración de handoff
   */
  export const HANDOFF_CONFIG = {
    // Prioridad predeterminada para solicitudes de handoff
    DEFAULT_PRIORITY: parseInt(process.env.HANDOFF_DEFAULT_PRIORITY || '5'),

    // Umbral de confianza para solicitar handoff automático
    CONFIDENCE_THRESHOLD: parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4'),

    // Tiempo máximo de espera para asignación (segundos)
    MAX_QUEUE_TIME: parseInt(process.env.HANDOFF_MAX_QUEUE_TIME || '300'),

    // Tiempo de inactividad antes de finalizar un handoff automáticamente (segundos)
    INACTIVITY_TIMEOUT: parseInt(process.env.HANDOFF_INACTIVITY_TIMEOUT || '600'),

    // Número máximo de intentos para asignar un agente
    MAX_ASSIGNMENT_ATTEMPTS: parseInt(process.env.HANDOFF_MAX_ASSIGNMENT_ATTEMPTS || '3'),

    // Tiempo de espera entre intentos de asignación (segundos)
    ASSIGNMENT_ATTEMPT_TIMEOUT: parseInt(process.env.HANDOFF_ASSIGNMENT_ATTEMPT_TIMEOUT || '30'),

    // Tiempo de espera para finalizar un handoff (segundos)
    HANDOFF_TIMEOUT: parseInt(process.env.HANDOFF_TIMEOUT || '600')
  };