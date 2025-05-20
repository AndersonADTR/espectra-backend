import { APIGatewayProxyHandler } from 'aws-lambda';
import { Schema } from 'joi';
export interface ValidationOptions {
    abortEarly?: boolean;
    allowUnknown?: boolean;
    stripUnknown?: boolean;
}
export declare class ValidationMiddleware {
    private static logger;
    static validate(schema: Schema, options?: ValidationOptions): (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
}
export declare const validateRequest: (schema: Schema, options?: ValidationOptions) => (handler: APIGatewayProxyHandler) => APIGatewayProxyHandler;
//# sourceMappingURL=validation.middleware.d.ts.map