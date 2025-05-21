import { LoginCredentials, RegisterCredentials, AuthenticationResult, AuthenticatedUser } from '../types/auth.types';
export declare class AuthenticationService {
    private readonly logger;
    private readonly metrics;
    private readonly cognitoService;
    private readonly botpressService;
    private readonly tokenService;
    private readonly dynamodb;
    private readonly observability;
    private readonly anomalyDetection;
    constructor();
    forgotPassword(email: string): Promise<{
        destination?: string;
        deliveryMedium?: string;
    }>;
    private updateUserSub;
    resetPassword(email: string, newPassword: string, confirmationCode: string): Promise<void | {
        message: string;
        deliveryDetails?: any;
    }>;
    verifyEmail(email: string, code: string): Promise<void>;
    resendVerificationCode(email: string): Promise<{
        destination?: string;
        deliveryMedium?: string;
        userStatus?: string;
    }>;
    private updateUserStatus;
    registerUser(credentials: RegisterCredentials): Promise<AuthenticatedUser>;
    login(credentials: LoginCredentials): Promise<AuthenticationResult>;
    logout(accessToken: string): Promise<void>;
    private verifyEmailAvailability;
    validateToken(token: string): Promise<AuthenticatedUser>;
    private getOrCreateUserRecord;
    private getUserByEmail;
    private getUserBySub;
    getUserById(userId: string): Promise<AuthenticatedUser | null>;
    private updateLastLogin;
    refreshTokens(userSub: string, refreshToken: string): Promise<AuthenticationResult>;
    cleanup(): Promise<void>;
    private sendVerificationEmail;
    private sendInstructionalEmail;
}
//# sourceMappingURL=authentication.service.d.ts.map