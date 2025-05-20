import { BaseError } from './base-error';
import { ErrorMetadata } from './types';
export declare class ValidationError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class ResourceNotFoundError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class AuthorizationError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class AuthenticationError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class ForbiddenError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class NotFoundError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class ConflictError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class InternalServerError extends BaseError {
    constructor(message?: string, metadata?: ErrorMetadata);
}
//# sourceMappingURL=http-errors.d.ts.map