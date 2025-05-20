import { AuthenticatedUser } from '../types/auth.types';
export declare class UserModel implements AuthenticatedUser {
    userId: string;
    userSub: string;
    email: string;
    name: string;
    botpressUserKeyId: string;
    phoneNumber: string;
    userType: string;
    language: string;
    createdAt: string;
    lastLogin?: string;
    updatedAt?: string;
    status: UserStatus;
    preferences?: UserPreferences;
    metadata?: Record<string, any>;
    constructor(data: Partial<UserModel>);
    toJSON(): Record<string, any>;
    static fromDynamoDB(item: Record<string, any>): UserModel;
    toDynamoDB(): Record<string, any>;
}
export declare enum UserStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    SUSPENDED = "SUSPENDED",
    PENDING_VERIFICATION = "PENDING_VERIFICATION",
    PENDING_PASSWORD_RESET = "PENDING_PASSWORD_RESET",
    DELETED = "DELETED"
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
//# sourceMappingURL=user.model.d.ts.map