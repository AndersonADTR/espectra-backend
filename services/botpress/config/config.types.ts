// services/botpress/config/config.types.ts

export type MetricsNamespace = 'Spectra/Botpress';

export type Environment = 'dev' | 'staging' | 'prod';

export interface MetricsConfig {
  NAMESPACE: MetricsNamespace;
  DIMENSIONS: {
    Environment: string;
    Service: string;
  };
}

export interface AlertsConfig {
  ERROR_RATE_THRESHOLD: number;
  LATENCY_THRESHOLD: number;
  HANDOFF_QUEUE_THRESHOLD: number;
}

export interface MonitoringConfig {
  METRICS: MetricsConfig;
  ALERTS: AlertsConfig;
}

export interface ChatConfig {
  REQUEST_TIMEOUT: number;
  MAX_RETRIES: number;
  RETRY_DELAY: number;
  MAX_MESSAGE_LENGTH: number;
}

export interface HandoffConfig {
  MAX_QUEUE_SIZE: number;
  MAX_WAIT_TIME: number;
  AUTO_REJECT_AFTER: number;
  DEFAULT_PRIORITY: 'low' | 'medium' | 'high';
}

export interface ErrorCodes {
  CHAT: {
    MESSAGE_FAILED: string;
    INVALID_MESSAGE: string;
    BOT_UNAVAILABLE: string;
  };
  HANDOFF: {
    QUEUE_FULL: string;
    TIMEOUT: string;
    REJECTED: string;
  };
  SYSTEM: {
    CONFIG_ERROR: string;
    NETWORK_ERROR: string;
  };
}

export interface LoggingConfig {
  LEVEL: string;
  SENSITIVE_FIELDS: string[];
  MAX_LOG_SIZE: number;
}