"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.ConfigService = exports.ConfigurationError = void 0;
const logger_1 = require("@shared/utils/logger");
class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
class ConfigService {
    static instance;
    static logger;
    configs;
    constructor() {
        this.configs = new Map();
        ConfigService.logger = new logger_1.Logger('ConfigService');
        this.loadConfigurations();
    }
    loadConfigurations() {
        const baseConfigs = {
            AWS_REGION: process.env.REGION || 'us-east-1',
            STAGE: process.env.STAGE || 'dev',
            SERVICE_NAME: process.env.SERVICE_NAME || 'espectra-backend',
            GOOGLE_SHEETS_CONTACT_REQUESTS_SHEET: process.env.GOOGLE_SHEETS_CONTACT_REQUESTS_SHEET,
            COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
            COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
            TOKEN_EXPIRATION: process.env.TOKEN_EXPIRATION || '1h',
            REFRESH_TOKEN_EXPIRATION: process.env.REFRESH_TOKEN_EXPIRATION || '7d',
            RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW || '15m',
            RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || '100',
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT,
            CACHE_TTL: process.env.CACHE_TTL || '3600',
            PASSWORD_SALT_ROUNDS: process.env.PASSWORD_SALT_ROUNDS || '10',
            LOG_LEVEL: process.env.LOG_LEVEL || 'info',
            XRAY_ENABLED: process.env.XRAY_ENABLED === 'true'
        };
        Object.entries(baseConfigs).forEach(([key, value]) => {
            this.configs.set(key, value);
        });
        this.validateCriticalConfigs();
    }
    validateCriticalConfigs() {
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
    static getInstance() {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }
    static get(key, defaultValue) {
        const value = this.getInstance().configs.get(key);
        if (value === undefined && defaultValue === undefined) {
            const error = `Configuration ${key} not found and no default value provided`;
            this.logger.warn(error);
        }
        return value ?? defaultValue;
    }
    static getRequired(key) {
        const value = this.getInstance().configs.get(key);
        if (value === undefined) {
            const error = `Required configuration ${key} not found`;
            this.logger.error(error);
            throw new ConfigurationError(error);
        }
        return value;
    }
    static set(key, value) {
        this.getInstance().configs.set(key, value);
        this.logger.info(`Configuration ${key} updated`);
    }
    static has(key) {
        return this.getInstance().configs.has(key);
    }
    static getAll() {
        return Object.fromEntries(this.getInstance().configs);
    }
}
exports.ConfigService = ConfigService;
exports.config = ConfigService;
//# sourceMappingURL=config.service.js.map