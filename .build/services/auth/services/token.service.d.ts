import { TokenPayload } from '../types/auth.types';
export declare class TokenService {
    private readonly verifier;
    private readonly redis;
    private readonly observability;
    constructor();
    verifyToken(token: string): Promise<TokenPayload>;
    invalidateToken(token: string): Promise<void>;
    private isTokenBlacklisted;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=token.service.d.ts.map