// services/sse/config/sse.config.ts
// SPECTRUM - Configuración de polling para content creators

import { SSEReconnectConfig } from '../types/sse.types';

/**
 * SPECTRUM - Configuración de polling optimizado para content creators
 */
export const SPECTRUM_POLLING_CONFIG = {
  POLLING_INTERVAL: 2000, // 2 segundos - perfecto para content creation
  CONNECTION_TIMEOUT: 300000, // 5 minutos
  RETRY_INTERVAL: 3000, // 3 segundos
  MAX_RETRIES: 5, // Más reintentos para mejor UX móvil
  HEADERS: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'X-Spectrum-Platform': 'content-creators',
    'X-Polling-Interval': '2000'
  }
} as const;

/**
 * Configuración para conexiones SSE con Botpress
 */
export const SSE_BOTPRESS_CONFIG = {
  RECONNECT_DELAY: 1000, // 1 segundo inicial
  MAX_RECONNECT_ATTEMPTS: 5,
  TIMEOUT: 30000, // 30 segundos
  BASE_URL: process.env.BOTPRESS_API_URL || 'https://api.botpress.cloud',
  LISTEN_ENDPOINT: '/v1/chat/conversations/{conversationId}/listen',
  GET_MESSAGES_ENDPOINT: '/v1/chat/conversations/{conversationId}/messages'
} as const;

/**
 * Configuración de reconexión con backoff exponencial
 */
export const SSE_RECONNECT_CONFIG: SSEReconnectConfig = {
  maxAttempts: 5,
  baseDelay: 1000, // 1 segundo
  maxDelay: 30000, // 30 segundos máximo
  backoffMultiplier: 2
};

/**
 * Configuración de limpieza y mantenimiento
 */
export const SSE_CLEANUP_CONFIG = {
  INACTIVE_CONNECTION_TIMEOUT: 600000, // 10 minutos
  CLEANUP_INTERVAL: 300000, // 5 minutos
  MAX_CONNECTIONS_PER_USER: 3, // Máximo 3 conexiones por usuario
  CONNECTION_STATS_INTERVAL: 60000 // 1 minuto
} as const;

/**
 * Configuración de logging y métricas
 */
export const SSE_MONITORING_CONFIG = {
  LOG_LEVEL: process.env.SSE_LOG_LEVEL || 'info',
  METRICS_NAMESPACE: process.env.METRICS_NAMESPACE || 'Spectrum/SSE',
  ENABLE_DETAILED_LOGGING: process.env.STAGE === 'dev',
  PERFORMANCE_MONITORING: true
} as const;

/**
 * Configuración de rate limiting
 */
export const SSE_RATE_LIMIT_CONFIG = {
  MAX_CONNECTIONS_PER_IP: 10,
  MAX_EVENTS_PER_MINUTE: 60,
  BURST_LIMIT: 10,
  WINDOW_SIZE: 60000 // 1 minuto
} as const;

/**
 * Obtiene la configuración completa de SSE
 */
export function getSSEConfig() {
  return {
    client: SSE_CLIENT_CONFIG,
    botpress: SSE_BOTPRESS_CONFIG,
    reconnect: SSE_RECONNECT_CONFIG,
    cleanup: SSE_CLEANUP_CONFIG,
    monitoring: SSE_MONITORING_CONFIG,
    rateLimit: SSE_RATE_LIMIT_CONFIG
  };
}

/**
 * Valida la configuración de SSE
 */
export function validateSSEConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.BOTPRESS_API_URL) {
    errors.push('BOTPRESS_API_URL environment variable is required');
  }

  if (SSE_CLIENT_CONFIG.CONNECTION_TIMEOUT < SSE_CLIENT_CONFIG.HEARTBEAT_INTERVAL) {
    errors.push('CONNECTION_TIMEOUT must be greater than HEARTBEAT_INTERVAL');
  }

  if (SSE_RECONNECT_CONFIG.maxDelay < SSE_RECONNECT_CONFIG.baseDelay) {
    errors.push('maxDelay must be greater than baseDelay');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
