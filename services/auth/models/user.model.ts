// services/auth/models/user.model.ts

import { AuthenticatedUser } from '../types/auth.types';

export class UserModel implements AuthenticatedUser {
  userId: string;
  userSub: string;
  email: string;
  name: string;
  phoneNumber: string;
  userType: string;
  language: string;
  createdAt: string;
  lastLogin?: string;
  updatedAt?: string;
  status: UserStatus;
  preferences?: UserPreferences;
  metadata?: Record<string, any>;

  constructor(data: Partial<UserModel>) {
    this.userId = data.userId || '';
    this.userSub = data.userSub || '';
    this.email = data.email || '';
    this.name = data.name || '';
    this.phoneNumber = data.phoneNumber || '';
    this.userType = data.userType || 'basic';
    this.language = data.language || 'es';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.lastLogin = data.lastLogin;
    this.updatedAt = data.updatedAt;
    this.status = data.status || UserStatus.ACTIVE;
    this.preferences = data.preferences || {};
    this.metadata = data.metadata || {};
  }

  toJSON(): Record<string, any> {
    return {
      userId: this.userId,
      userSub: this.userSub,
      email: this.email,
      name: this.name,
      phoneNumber: this.phoneNumber,
      userType: this.userType,
      language: this.language,
      createdAt: this.createdAt,
      lastLogin: this.lastLogin,
      updatedAt: this.updatedAt,
      status: this.status,
      preferences: this.preferences,
      metadata: this.metadata
    };
  }

  static fromDynamoDB(item: Record<string, any>): UserModel {
    return new UserModel({
      userId: item.userId,
      userSub: item.userSub,
      email: item.email,
      name: item.name,
      phoneNumber: item.phoneNumber,
      userType: item.userType,
      language: item.language,
      createdAt: item.createdAt,
      lastLogin: item.lastLogin,
      updatedAt: item.updatedAt,
      status: item.status,
      preferences: item.preferences,
      metadata: item.metadata
    });
  }

  toDynamoDB(): Record<string, any> {
    return {
      ...this.toJSON(),
      pk: `USER#${this.userId}`,
      sk: `PROFILE#${this.email}`,
      gsi1pk: `EMAIL#${this.email}`,
      gsi1sk: `USER#${this.userId}`,
      entityType: 'USER'
    };
  }
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

export interface UserPreferences {
  language?: string;
  timezone?: string;
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
  theme?: 'light' | 'dark';
}