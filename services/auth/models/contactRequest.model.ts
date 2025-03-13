// services/auth/models/contactRequest.model.ts
import { v4 as uuidv4 } from 'uuid';
import { ContactRequestData } from '../types/contactRequest.types';

export class ContactRequestModel {
  requestId: string;
  name: string;
  email: string;
  phoneNumber: string;
  status: 'PENDING' | 'FAILED';
  createdAt: string;
  metadata?: Record<string, any>;

  constructor(data: ContactRequestData) {
    this.requestId = uuidv4();
    this.name = data.name;
    this.email = data.email;
    this.phoneNumber = data.phoneNumber;
    this.status = 'PENDING';
    this.createdAt = new Date().toISOString();
    this.metadata = data.metadata || {};
  }

  toGoogleSheetsRow(): string[] {
    return [
      this.requestId,
      this.name,
      this.email,
      this.phoneNumber,
      this.status,
      this.createdAt,
      JSON.stringify(this.metadata)
    ];
  }

  toJSON(): Record<string, any> {
    return {
      requestId: this.requestId,
      name: this.name,
      email: this.email,
      phoneNumber: this.phoneNumber,
      status: this.status,
      createdAt: this.createdAt,
      metadata: this.metadata
    };
  }
}