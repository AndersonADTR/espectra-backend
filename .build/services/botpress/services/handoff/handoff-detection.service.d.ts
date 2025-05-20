export interface HandoffDecision {
    shouldHandoff: boolean;
    reason: HandoffReason;
    confidence: number;
    metadata?: Record<string, any>;
}
export declare enum HandoffReason {
    EXPLICIT_REQUEST = "EXPLICIT_REQUEST",
    LOW_CONFIDENCE = "LOW_CONFIDENCE",
    COMPLEX_QUERY = "COMPLEX_QUERY",
    TOKEN_LIMIT = "TOKEN_LIMIT",
    REPEATED_ISSUE = "REPEATED_ISSUE",
    DETECTED_FRUSTRATION = "DETECTED_FRUSTRATION",
    SENSITIVE_TOPIC = "SENSITIVE_TOPIC",
    UNDEFINED = "UNDEFINED"
}
export declare class HandoffDetectionService {
    private static instance;
    private readonly logger;
    private readonly contextService;
    private readonly botpressService;
    private readonly metrics;
    private readonly keywordTriggers;
    private readonly confidenceThreshold;
    private readonly maxRepetitionsBeforeHandoff;
    private readonly sensitiveTopics;
    private constructor();
    static getInstance(): HandoffDetectionService;
    shouldHandoff(conversationId: string, latestMessage: string, botResponse: any): Promise<HandoffDecision>;
    private detectExplicitHandoffRequest;
    private analyzeBotConfidence;
    private detectSensitiveTopic;
    private detectUserFrustration;
    private detectConversationRepetition;
}
//# sourceMappingURL=handoff-detection.service.d.ts.map