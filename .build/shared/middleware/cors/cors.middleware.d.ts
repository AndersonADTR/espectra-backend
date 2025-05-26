import { Handler } from 'aws-lambda';
export interface CorsOptions {
    allowOrigin?: string;
    allowCredentials?: boolean;
    allowMethods?: string;
    allowHeaders?: string;
    exposeHeaders?: string;
    maxAge?: number;
}
export declare const withCors: (handler: Handler, options?: CorsOptions) => Handler;
export declare const corsPreflightHandler: (options?: CorsOptions) => Handler;
//# sourceMappingURL=cors.middleware.d.ts.map