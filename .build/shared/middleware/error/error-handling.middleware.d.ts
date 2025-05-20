import { APIGatewayProxyHandler } from 'aws-lambda';
export declare class ErrorHandlingMiddleware {
    private static logger;
    static withErrorHandling(handler: APIGatewayProxyHandler): APIGatewayProxyHandler;
    private static handleError;
}
export declare const withErrorHandling: (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
//# sourceMappingURL=error-handling.middleware.d.ts.map