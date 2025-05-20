export interface SecurityUser {
    userId: string;
    email: string;
    roles?: string[];
    permissions?: string[];
    metadata?: Record<string, any>;
}
export declare class SecurityService {
    private readonly logger;
    private readonly metrics;
    private readonly verifier;
    constructor();
    validateToken(token: string): Promise<SecurityUser>;
    validatePermissions(user: SecurityUser, requiredPermissions: string[]): Promise<boolean>;
    validateRoles(user: SecurityUser, requiredRoles: string[]): Promise<boolean>;
}
//# sourceMappingURL=security.service.d.ts.map