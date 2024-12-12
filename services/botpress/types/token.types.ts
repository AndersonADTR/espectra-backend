// services/botpress/types/token.types.ts

interface TokenUsage {
    userId: string;
    date: string;
    tokensUsed: number;
    tokensLimit: number;
    lastUpdated: string;
    planType: string;
}
  
interface TokenLimits {
    basic: number;
    pro: number;
    business: number;
    enterprise: number;
}