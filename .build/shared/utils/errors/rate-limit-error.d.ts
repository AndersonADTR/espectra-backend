import { BaseError } from './base-error';
import { ErrorMetadata } from './types';
export declare class TooManyRequestsError extends BaseError {
    constructor(message: string, metadata?: ErrorMetadata);
}
//# sourceMappingURL=rate-limit-error.d.ts.map