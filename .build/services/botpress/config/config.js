"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDOFF_CONFIG = exports.SECURITY_CONFIG = exports.PLAN_CONFIG = exports.MONITORING_CONFIG = void 0;
exports.MONITORING_CONFIG = {
    METRICS: {
        NAMESPACE: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
        DEFAULT_DIMENSIONS: {
            Service: process.env.SERVICE_NAME || 'spectrum',
            Environment: process.env.STAGE || 'dev',
            Component: 'Concierge'
        },
        SAMPLING: {
            MESSAGE_RATE: parseFloat(process.env.METRICS_SAMPLING_RATE || '1.0'),
            TOKEN_USAGE_RATE: parseFloat(process.env.TOKEN_USAGE_SAMPLING_RATE || '1.0')
        }
    },
    ALERTS: {
        SNS_TOPICS: {
            CRITICAL: process.env.SNS_TOPIC_CRITICAL || '',
            HIGH: process.env.SNS_TOPIC_HIGH || '',
            MEDIUM: process.env.SNS_TOPIC_MEDIUM || '',
            LOW: process.env.SNS_TOPIC_LOW || ''
        },
        THRESHOLDS: {
            TOKEN_USAGE_ALERT: parseInt(process.env.TOKEN_USAGE_ALERT_THRESHOLD || '80'),
            ERROR_RATE_THRESHOLD: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.05'),
            LATENCY_THRESHOLD: parseInt(process.env.LATENCY_THRESHOLD || '1000')
        }
    },
    HANDOFF: {
        DEFAULT_PRIORITY: parseInt(process.env.HANDOFF_DEFAULT_PRIORITY || '5'),
        CONFIDENCE_THRESHOLD: parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4'),
        MAX_QUEUE_TIME: parseInt(process.env.HANDOFF_MAX_QUEUE_TIME || '300'),
        INACTIVITY_TIMEOUT: parseInt(process.env.HANDOFF_INACTIVITY_TIMEOUT || '600')
    },
    WEBSOCKET: {
        PING_INTERVAL: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '30000'),
        CONNECTION_TTL: parseInt(process.env.WEBSOCKET_CONNECTION_TTL || '86400'),
        MAX_RETRIES: parseInt(process.env.WEBSOCKET_MAX_RETRIES || '3')
    },
    BOTPRESS: {
        TIMEOUT: parseInt(process.env.BOTPRESS_TIMEOUT || '5000'),
        MAX_RETRIES: parseInt(process.env.BOTPRESS_MAX_RETRIES || '3'),
        RETRY_INTERVAL: parseInt(process.env.BOTPRESS_RETRY_INTERVAL || '500')
    }
};
exports.PLAN_CONFIG = {
    TOKEN_LIMITS: {
        basic: parseInt(process.env.TOKEN_LIMIT_BASIC || '1000'),
        pro: parseInt(process.env.TOKEN_LIMIT_PRO || '2000'),
        business: parseInt(process.env.TOKEN_LIMIT_BUSINESS || '4000'),
        enterprise: parseInt(process.env.TOKEN_LIMIT_ENTERPRISE || '8000')
    },
    ALERT_THRESHOLD: parseInt(process.env.TOKEN_ALERT_THRESHOLD || '80'),
    ALLOW_OVERAGE: {
        basic: false,
        pro: true,
        business: true,
        enterprise: true
    },
    OVERAGE_COST: {
        basic: 0.002,
        pro: 0.0015,
        business: 0.001,
        enterprise: 0.0008
    }
};
exports.SECURITY_CONFIG = {
    TOKEN_BLACKLIST_TTL: parseInt(process.env.TOKEN_BLACKLIST_TTL || '86400'),
    RATE_LIMITS: {
        DEFAULT: parseInt(process.env.RATE_LIMIT_DEFAULT || '60'),
        HIGH: parseInt(process.env.RATE_LIMIT_HIGH || '300'),
        MESSAGE: parseInt(process.env.RATE_LIMIT_MESSAGE || '120')
    },
    VERIFY_WEBHOOK_SIGNATURE: process.env.VERIFY_WEBHOOK_SIGNATURE !== 'false'
};
exports.default = {
    MONITORING: exports.MONITORING_CONFIG,
    PLAN: exports.PLAN_CONFIG,
    SECURITY: exports.SECURITY_CONFIG
};
exports.HANDOFF_CONFIG = {
    DEFAULT_PRIORITY: parseInt(process.env.HANDOFF_DEFAULT_PRIORITY || '5'),
    CONFIDENCE_THRESHOLD: parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4'),
    MAX_QUEUE_TIME: parseInt(process.env.HANDOFF_MAX_QUEUE_TIME || '300'),
    INACTIVITY_TIMEOUT: parseInt(process.env.HANDOFF_INACTIVITY_TIMEOUT || '600'),
    MAX_ASSIGNMENT_ATTEMPTS: parseInt(process.env.HANDOFF_MAX_ASSIGNMENT_ATTEMPTS || '3'),
    ASSIGNMENT_ATTEMPT_TIMEOUT: parseInt(process.env.HANDOFF_ASSIGNMENT_ATTEMPT_TIMEOUT || '30'),
    HANDOFF_TIMEOUT: parseInt(process.env.HANDOFF_TIMEOUT || '600')
};
//# sourceMappingURL=config.js.map