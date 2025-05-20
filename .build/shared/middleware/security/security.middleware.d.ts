import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
export interface SecurityOptions {
    requireAuth?: boolean;
    roles?: string[];
    permissions?: string[];
    ipWhitelist?: string[];
    customValidation?: (event: APIGatewayProxyEvent) => Promise<boolean>;
}
export declare class SecurityMiddleware {
    private static logger;
    private static securityService;
    private static metrics;
    static secure(options?: SecurityOptions): (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
    private static extractToken;
}
//# sourceMappingURL=security.middleware.d.ts.map