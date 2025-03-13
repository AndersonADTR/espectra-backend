// services/auth/types/contactRequest.types.ts
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