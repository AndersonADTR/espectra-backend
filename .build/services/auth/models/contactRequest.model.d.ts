import { ContactRequestData } from '../types/contactRequest.types';
export declare class ContactRequestModel {
    requestId: string;
    name: string;
    email: string;
    phoneNumber: string;
    status: 'PENDING' | 'FAILED';
    createdAt: string;
    metadata?: Record<string, any>;
    constructor(data: ContactRequestData);
    toGoogleSheetsRow(): string[];
    toJSON(): Record<string, any>;
}
//# sourceMappingURL=contactRequest.model.d.ts.map