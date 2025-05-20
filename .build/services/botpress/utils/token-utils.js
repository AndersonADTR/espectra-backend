"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenUtils = void 0;
class TokenUtils {
    static CHARS_PER_TOKEN = {
        'gpt-3.5-turbo': 4,
        'gpt-4': 4,
        'claude-2': 3.5,
        'default': 4
    };
    static estimateTokenCount(text, model = 'default') {
        if (!text)
            return 0;
        let charsPerToken;
        switch (model) {
            case 'gpt-3.5-turbo':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-3.5-turbo"];
                break;
            case 'gpt-4':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-4"];
                break;
            case 'claude-2':
                charsPerToken = this.CHARS_PER_TOKEN["claude-2"];
                break;
            default:
                charsPerToken = this.CHARS_PER_TOKEN["default"];
                break;
        }
        return Math.ceil(text.length / charsPerToken);
    }
    static estimateJsonTokenCount(obj, model = 'default') {
        if (!obj)
            return 0;
        const json = JSON.stringify(obj);
        return this.estimateTokenCount(json, model);
    }
    static truncateToTokenLimit(text, maxTokens, model = 'default') {
        if (!text)
            return '';
        let charsPerToken;
        switch (model) {
            case 'gpt-3.5-turbo':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-3.5-turbo"];
                break;
            case 'gpt-4':
                charsPerToken = this.CHARS_PER_TOKEN["gpt-4"];
                break;
            case 'claude-2':
                charsPerToken = this.CHARS_PER_TOKEN["claude-2"];
                break;
            default:
                charsPerToken = this.CHARS_PER_TOKEN["default"];
                break;
        }
        const maxChars = Math.floor(maxTokens * charsPerToken);
        if (text.length <= maxChars) {
            return text;
        }
        return text.substring(0, maxChars - 3) + '...';
    }
    static calculateCost(inputTokens, outputTokens, model) {
        const prices = {
            'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
            'gpt-4': { input: 0.03, output: 0.06 },
            'claude-2': { input: 0.008, output: 0.024 },
            'default': { input: 0.01, output: 0.02 }
        };
        const modelPrices = prices[model] || prices.default;
        const inputCost = (inputTokens / 1000) * modelPrices.input;
        const outputCost = (outputTokens / 1000) * modelPrices.output;
        return inputCost + outputCost;
    }
}
exports.TokenUtils = TokenUtils;
//# sourceMappingURL=token-utils.js.map