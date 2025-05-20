export declare const MONITORING_CONFIG: {
    METRICS: {
        NAMESPACE: string;
        DEFAULT_DIMENSIONS: {
            Service: string;
            Environment: string;
            Component: string;
        };
        SAMPLING: {
            MESSAGE_RATE: number;
            TOKEN_USAGE_RATE: number;
        };
    };
    ALERTS: {
        SNS_TOPICS: {
            CRITICAL: string;
            HIGH: string;
            MEDIUM: string;
            LOW: string;
        };
        THRESHOLDS: {
            TOKEN_USAGE_ALERT: number;
            ERROR_RATE_THRESHOLD: number;
            LATENCY_THRESHOLD: number;
        };
    };
    HANDOFF: {
        DEFAULT_PRIORITY: number;
        CONFIDENCE_THRESHOLD: number;
        MAX_QUEUE_TIME: number;
        INACTIVITY_TIMEOUT: number;
    };
    WEBSOCKET: {
        PING_INTERVAL: number;
        CONNECTION_TTL: number;
        MAX_RETRIES: number;
    };
    BOTPRESS: {
        TIMEOUT: number;
        MAX_RETRIES: number;
        RETRY_INTERVAL: number;
    };
};
export declare const PLAN_CONFIG: {
    TOKEN_LIMITS: {
        basic: number;
        pro: number;
        business: number;
        enterprise: number;
    };
    ALERT_THRESHOLD: number;
    ALLOW_OVERAGE: {
        basic: boolean;
        pro: boolean;
        business: boolean;
        enterprise: boolean;
    };
    OVERAGE_COST: {
        basic: number;
        pro: number;
        business: number;
        enterprise: number;
    };
};
export declare const SECURITY_CONFIG: {
    TOKEN_BLACKLIST_TTL: number;
    RATE_LIMITS: {
        DEFAULT: number;
        HIGH: number;
        MESSAGE: number;
    };
    VERIFY_WEBHOOK_SIGNATURE: boolean;
};
declare const _default: {
    MONITORING: {
        METRICS: {
            NAMESPACE: string;
            DEFAULT_DIMENSIONS: {
                Service: string;
                Environment: string;
                Component: string;
            };
            SAMPLING: {
                MESSAGE_RATE: number;
                TOKEN_USAGE_RATE: number;
            };
        };
        ALERTS: {
            SNS_TOPICS: {
                CRITICAL: string;
                HIGH: string;
                MEDIUM: string;
                LOW: string;
            };
            THRESHOLDS: {
                TOKEN_USAGE_ALERT: number;
                ERROR_RATE_THRESHOLD: number;
                LATENCY_THRESHOLD: number;
            };
        };
        HANDOFF: {
            DEFAULT_PRIORITY: number;
            CONFIDENCE_THRESHOLD: number;
            MAX_QUEUE_TIME: number;
            INACTIVITY_TIMEOUT: number;
        };
        WEBSOCKET: {
            PING_INTERVAL: number;
            CONNECTION_TTL: number;
            MAX_RETRIES: number;
        };
        BOTPRESS: {
            TIMEOUT: number;
            MAX_RETRIES: number;
            RETRY_INTERVAL: number;
        };
    };
    PLAN: {
        TOKEN_LIMITS: {
            basic: number;
            pro: number;
            business: number;
            enterprise: number;
        };
        ALERT_THRESHOLD: number;
        ALLOW_OVERAGE: {
            basic: boolean;
            pro: boolean;
            business: boolean;
            enterprise: boolean;
        };
        OVERAGE_COST: {
            basic: number;
            pro: number;
            business: number;
            enterprise: number;
        };
    };
    SECURITY: {
        TOKEN_BLACKLIST_TTL: number;
        RATE_LIMITS: {
            DEFAULT: number;
            HIGH: number;
            MESSAGE: number;
        };
        VERIFY_WEBHOOK_SIGNATURE: boolean;
    };
};
export default _default;
export declare const HANDOFF_CONFIG: {
    DEFAULT_PRIORITY: number;
    CONFIDENCE_THRESHOLD: number;
    MAX_QUEUE_TIME: number;
    INACTIVITY_TIMEOUT: number;
    MAX_ASSIGNMENT_ATTEMPTS: number;
    ASSIGNMENT_ATTEMPT_TIMEOUT: number;
    HANDOFF_TIMEOUT: number;
};
//# sourceMappingURL=config.d.ts.map