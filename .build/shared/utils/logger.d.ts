export declare class Logger {
    private context;
    private logger;
    constructor(context: string);
    info(message: string, meta?: Record<string, any>): void;
    error(message: string, meta?: Record<string, any>): void;
    warn(message: string, meta?: Record<string, any>): void;
    debug(message: string, meta?: Record<string, any>): void;
}
export declare class BaseError extends Error {
    readonly code: string;
    readonly statusCode: number;
    constructor(code: string, statusCode: number, message: string);
}
export declare class AuthorizationError extends BaseError {
    constructor(message: string);
}
export declare class ValidationError extends BaseError {
    constructor(message: string);
}
export declare class ResourceNotFoundError extends BaseError {
    constructor(message: string);
}
export declare class InternalServerError extends BaseError {
    constructor(message?: string);
}
//# sourceMappingURL=logger.d.ts.map