import { BaseError } from '@shared/utils/errors';
export declare class WebSocketError extends BaseError {
    readonly details?: unknown | undefined;
    readonly statusCode: number;
    readonly context?: Record<string, any>;
    constructor(message: string, statusCode?: number, details?: unknown | undefined);
}
export declare class WebSocketConnectionError extends WebSocketError {
    constructor(message: string, details?: unknown);
}
export declare class WebSocketMessageError extends WebSocketError {
    constructor(message: string, details?: unknown);
}
//# sourceMappingURL=errors.d.ts.map