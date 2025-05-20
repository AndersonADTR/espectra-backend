import { ErrorResponse, ErrorMetadata } from './types';
export declare class BaseError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly metadata?: ErrorMetadata;
    constructor(code: string, statusCode: number, message: string, metadata?: ErrorMetadata);
    toJSON(): ErrorResponse;
}
//# sourceMappingURL=base-error.d.ts.map