export declare class TokenUtils {
    private static readonly CHARS_PER_TOKEN;
    static estimateTokenCount(text: string, model?: string): number;
    static estimateJsonTokenCount(obj: any, model?: string): number;
    static truncateToTokenLimit(text: string, maxTokens: number, model?: string): string;
    static calculateCost(inputTokens: number, outputTokens: number, model: string): number;
}
//# sourceMappingURL=token-utils.d.ts.map