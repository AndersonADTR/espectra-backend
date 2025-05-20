import { TokenUsage } from '../../types/token-management.types';
export declare class TokenManagementService {
    private static instance;
    private readonly dynamoDbClient;
    private readonly eventBridgeClient;
    private readonly cacheService;
    private readonly logger;
    private readonly metrics;
    private readonly tableName;
    private readonly usersTableName;
    private readonly eventBusName;
    private readonly tokenLimits;
    private readonly cacheKeyPrefix;
    private readonly cacheTtl;
    private constructor();
    static getInstance(): TokenManagementService;
    getUserTokenUsage(userId: string): Promise<TokenUsage>;
    consumeTokens(userId: string, tokenCount: number): Promise<{
        usage: TokenUsage;
        hasRemainingTokens: boolean;
        overage: boolean;
        alertTriggered: boolean;
        usagePercentage: number;
    }>;
    checkTokenAvailability(userId: string, requiredTokens: number): Promise<boolean>;
    resetDailyTokens(userId: string): Promise<TokenUsage>;
    getTokenUsageHistory(userId: string, startDate: string, endDate: string): Promise<TokenUsage[]>;
    private checkThresholds;
    private sendTokenAlert;
    private calculateOverageCost;
    private getNextResetTimestamp;
    private getUserPlan;
}
//# sourceMappingURL=token-management.service.d.ts.map