import { BaseError } from './base-error';
import { ErrorMetadata } from './types';
export declare class SessionNotFoundError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
export declare class SessionExpiredError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
//# sourceMappingURL=session-errors.d.ts.map