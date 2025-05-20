export interface ContactRequestData {
    name: string;
    email: string;
    phoneNumber: string;
    metadata?: Record<string, any>;
}
export interface ContactRequestResponse {
    requestId: string;
    message: string;
    status: 'PENDING' | 'FAILED';
    timestamp: string;
}
//# sourceMappingURL=contactRequest.types.d.ts.map