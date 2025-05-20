export declare enum UserPlan {
    BASIC = "basic",
    PRO = "pro",
    BUSINESS = "business",
    ENTERPRISE = "enterprise"
}
export interface TokenUsage {
    userId: string;
    date: string;
    planType: UserPlan;
    dailyLimit: number;
    totalTokens: number;
    remainingTokens: number;
    lastUpdated: string;
    resetTimestamp: string;
    alertsSent: string[];
    overageCount: number;
    overageTokens: number;
    metadata?: {
        lastConversationId?: string;
        lastMessageTokens?: number;
        overageCost?: number;
        billable?: boolean;
        channel?: string;
        customData?: Record<string, any>;
    };
    ttl?: number;
}
export interface TokenConsumptionResult {
    usage: TokenUsage;
    hasRemainingTokens: boolean;
    overage: boolean;
    alertTriggered: boolean;
    usagePercentage: number;
}
export interface TokenAlertConfig {
    thresholds: number[];
    channels: ('email' | 'push' | 'sms' | 'in-app')[];
    alertOnLimit: boolean;
    alertOnOverage: boolean;
    minTimeBetweenAlerts: number;
}
export interface TokenUsageStats {
    dailyAverage: number;
    peakUsage: number;
    totalDays: number;
    dayOfWeekDistribution: Record<string, number>;
    hourlyDistribution: Record<string, number>;
    trend: number;
    overageDays: number;
    averageOverage: number;
    alertFrequency: number;
}
export interface TokenHistoryOptions {
    startDate: string;
    endDate: string;
    includeStats?: boolean;
    groupBy?: 'day' | 'week' | 'month';
    filters?: {
        minUsage?: number;
        maxUsage?: number;
        hasOverage?: boolean;
    };
}
//# sourceMappingURL=token-management.types.d.ts.map