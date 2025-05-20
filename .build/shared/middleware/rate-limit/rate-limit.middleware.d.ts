import { APIGatewayProxyHandler } from 'aws-lambda';
export interface RateLimitConfig {
    windowMs: number;
    max: number;
    keyPrefix?: string;
}
export declare class RateLimitMiddleware {
    private static logger;
    static rateLimit(config: RateLimitConfig): (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
}
export declare const rateLimitPresets: {
    strict: {
        windowMs: number;
        max: number;
        keyPrefix: string;
    };
    moderate: {
        windowMs: number;
        max: number;
        keyPrefix: string;
    };
    relaxed: {
        windowMs: number;
        max: number;
        keyPrefix: string;
    };
};
export declare const rateLimit: (config?: RateLimitConfig) => (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
//# sourceMappingURL=rate-limit.middleware.d.ts.map