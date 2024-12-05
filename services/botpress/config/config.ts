// services/botpress/config/config.ts

import { BotpressConfig } from "services/botpress/types/chat.types";

// Configuración base de Botpress
export const BOTPRESS_CONFIG: BotpressConfig = {
  webhookUrl: process.env.BOTPRESS_WEBHOOK_URL || 'https://chat.botpress.cloud/a3d58c2c-c0bb-4db7-b344-9d87b18316ea',
  botId: process.env.BOTPRESS_BOT_ID || '187218ca-4f6d-4a78-a409-b374d3b714c1',
  workspaceId: process.env.BOTPRESS_WORKSPACE_ID || 'wkspace_01JDWDGCRZ2FTMTTBBEWW4YZGN',
  HANDOFF_CONFIDENCE_THRESHOLD: undefined
};

// Configuración de timeouts y reintentos
export const CHAT_CONFIG = {
  REQUEST_TIMEOUT: 10000, // 10 segundos
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 segundo
  MAX_MESSAGE_LENGTH: 1000,
} as const;

// Configuración de handoff
export const HANDOFF_CONFIG = {
  MAX_QUEUE_SIZE: 100,
  MAX_WAIT_TIME: 300000, // 5 minutos
  AUTO_REJECT_AFTER: 600000, // 10 minutos
  DEFAULT_PRIORITY: 'medium',
} as const;

// Configuración de monitoreo
export const MONITORING_CONFIG = {
  METRICS: {
    NAMESPACE: 'Spectra/Botpress',
    DIMENSIONS: {
      Environment: process.env.STAGE || 'dev',
      Service: 'ChatBot',
    },
  },
  ALERTS: {
    ERROR_RATE_THRESHOLD: 5, // 5% error rate
    LATENCY_THRESHOLD: 2000, // 2 segundos
    HANDOFF_QUEUE_THRESHOLD: 10, // 10 solicitudes en cola
  },
} as const;

// Validación de configuración al iniciar
export function validateConfig(): void {
  const requiredEnvVars = [
    'BOTPRESS_WEBHOOK_URL',
    'BOTPRESS_BOT_ID',
    'BOTPRESS_WORKSPACE_ID',
  ];

  const missingVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
}

// Configuración de errores específicos
export const ERROR_CODES = {
  CHAT: {
    MESSAGE_FAILED: 'CHAT_MESSAGE_FAILED',
    INVALID_MESSAGE: 'CHAT_INVALID_MESSAGE',
    BOT_UNAVAILABLE: 'CHAT_BOT_UNAVAILABLE',
  },
  HANDOFF: {
    QUEUE_FULL: 'HANDOFF_QUEUE_FULL',
    TIMEOUT: 'HANDOFF_TIMEOUT',
    REJECTED: 'HANDOFF_REJECTED',
  },
  SYSTEM: {
    CONFIG_ERROR: 'SYSTEM_CONFIG_ERROR',
    NETWORK_ERROR: 'SYSTEM_NETWORK_ERROR',
  },
} as const;

// URLs y endpoints
export const ENDPOINTS = {
  CHAT: '/message',
  HANDOFF: '/handoff',
  STATUS: '/status',
} as const;

// Headers por defecto
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': `SpectraBot/${process.env.npm_package_version || '1.0.0'}`,
} as const;

// Configuración de logging
export const LOGGING_CONFIG = {
  LEVEL: process.env.LOG_LEVEL || 'info',
  SENSITIVE_FIELDS: ['password', 'token', 'apiKey'],
  MAX_LOG_SIZE: 10000, // caracteres
} as const;