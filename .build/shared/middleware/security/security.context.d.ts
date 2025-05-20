import { SecurityUser } from './security.service';
export interface SecurityContext {
    user?: SecurityUser;
    sessionId?: string;
    traceId: string;
    requestId: string;
}
export declare class SecurityContextManager {
    private static instance;
    private storage;
    private constructor();
    static getInstance(): SecurityContextManager;
    getContext(): SecurityContext | undefined;
    run(context: SecurityContext, callback: () => Promise<any>): Promise<any>;
    updateContext(partialContext: Partial<SecurityContext>): void;
}
//# sourceMappingURL=security.context.d.ts.map