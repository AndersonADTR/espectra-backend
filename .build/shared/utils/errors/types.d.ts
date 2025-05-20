export interface ErrorResponse {
    code: string;
    message: string;
    statusCode: number;
    details?: unknown;
}
export interface ErrorMetadata {
    path?: string;
    timestamp?: string;
    requestId?: string;
    userId?: string;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map