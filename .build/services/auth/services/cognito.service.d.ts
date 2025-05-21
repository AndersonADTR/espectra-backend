import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { LoginCredentials, RegisterCredentials, AuthTokens } from '../types/auth.types';
export declare class CognitoService {
    readonly client: CognitoIdentityProviderClient;
    private readonly logger;
    private readonly userPoolId;
    private readonly clientId;
    constructor();
    private calculateSecretHash;
    refreshUserTokens(userSub: string, refreshToken: string): Promise<any>;
    registerUser(credentials: RegisterCredentials): Promise<string | undefined>;
    authenticateUser(credentials: LoginCredentials): Promise<AuthTokens>;
    deleteUser(email: string): Promise<void>;
    confirmSignUp(email: string): Promise<void>;
    getUserBySub(userSub: string): Promise<Record<string, string>>;
    getUserByEmail(email: string): Promise<Record<string, any>>;
    signOut(accessToken: string): Promise<void>;
    forgotPassword(email: string): Promise<{
        destination?: string;
        deliveryMedium?: string;
    }>;
    confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<void>;
    confirmSignUpWithCode(email: string, confirmationCode: string): Promise<void>;
    resendConfirmationCode(email: string): Promise<{
        destination?: string;
        deliveryMedium?: string;
        userStatus?: string;
    }>;
}
//# sourceMappingURL=cognito.service.d.ts.map