export interface LoginCredentials {
    email: string;
    password: string;
}
export interface RegisterCredentials {
    email: string;
    password: string;
    name: string;
    phoneNumber: string;
    userType?: string;
    language?: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    idToken: string;
    expiresIn: number;
}
export interface TokenPayload {
    sub: string;
    email: string;
    userType?: string;
    name?: string;
    roles?: string;
    permissions?: string;
    metadata?: Record<string, any>;
    iat: number;
    exp: number;
    username?: string;
}
export interface AuthenticatedUser {
    userId: string;
    userSub: string;
    botpressUserKeyId: string;
    email: string;
    name: string;
    userType: string;
    createdAt: string;
    lastLogin?: string;
    status?: string;
    phoneNumber?: string;
    language?: string;
    updatedAt?: string;
    preferences?: Record<string, any>;
    metadata?: Record<string, any>;
}
export interface AuthenticationResult {
    user: AuthenticatedUser;
    tokens: AuthTokens;
}
//# sourceMappingURL=auth.types.d.ts.map