// shared/config/config.service.ts

import { Logger } from '@shared/utils/logger';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ConfigService {
  private static instance: ConfigService;
  private static logger: Logger;
  private readonly configs: Map<string, any>;

  private constructor() {
    this.configs = new Map();
    ConfigService.logger = new Logger('ConfigService');
    this.loadConfigurations();
  }

  private loadConfigurations(): void {
    // Cargar configuraciones base
    const baseConfigs = {
      AWS_REGION: process.env.REGION || 'us-east-1',
      STAGE: process.env.STAGE || 'dev',
      SERVICE_NAME: process.env.SERVICE_NAME || 'espectra-backend',
      
      // Configuraciones de Auth
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
      TOKEN_EXPIRATION: process.env.TOKEN_EXPIRATION || '1h',
      REFRESH_TOKEN_EXPIRATION: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
      
      // Configuraciones de Rate Limiting
      RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW || '15m',
      RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || '100',
      
      // Configuraciones de Cache
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      CACHE_TTL: process.env.CACHE_TTL || '3600',
      
      // Configuraciones de Seguridad
      PASSWORD_SALT_ROUNDS: process.env.PASSWORD_SALT_ROUNDS || '10',
      
      // Configuraciones de Logging
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      XRAY_ENABLED: process.env.XRAY_ENABLED === 'true'
    };

    // Cargar las configuraciones en el Map
    Object.entries(baseConfigs).forEach(([key, value]) => {
      this.configs.set(key, value);
    });

    // Validar configuraciones críticas
    this.validateCriticalConfigs();
  }

  private validateCriticalConfigs(): void {
    const criticalConfigs = [
      'COGNITO_USER_POOL_ID',
      'COGNITO_CLIENT_ID',
    ];

    for (const config of criticalConfigs) {
      if (!this.configs.get(config)) {
        const error = `Missing critical configuration: ${config}`;
        ConfigService.logger.error(error);
        throw new ConfigurationError(error);
      }
    }
  }

  private static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  static get<T>(key: string, defaultValue?: T): T {
    const value = this.getInstance().configs.get(key);
    if (value === undefined && defaultValue === undefined) {
      const error = `Configuration ${key} not found and no default value provided`;
      this.logger.warn(error);
    }
    return value ?? defaultValue as T;
  }

  static getRequired<T>(key: string): T {
    const value = this.getInstance().configs.get(key);
    if (value === undefined) {
      const error = `Required configuration ${key} not found`;
      this.logger.error(error);
      throw new ConfigurationError(error);
    }
    return value as T;
  }

  static set(key: string, value: any): void {
    this.getInstance().configs.set(key, value);
    this.logger.info(`Configuration ${key} updated`);
  }

  static has(key: string): boolean {
    return this.getInstance().configs.has(key);
  }

  static getAll(): Record<string, any> {
    return Object.fromEntries(this.getInstance().configs);
  }
}

export const config = ConfigService;