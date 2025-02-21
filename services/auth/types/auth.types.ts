// services/auth/types/auth.types.ts

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
  }
  
  export interface AuthenticatedUser {
    userId: string;
    userSub: string;
    email: string;
    name: string;
    userType: string;
    createdAt: string;
    lastLogin?: string;
  }
  
  export interface AuthenticationResult {
    user: AuthenticatedUser;
    tokens: AuthTokens;
  }