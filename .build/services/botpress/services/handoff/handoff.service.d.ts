import { HandoffReason } from './handoff-detection.service';
export declare class HandoffService {
    private static instance;
    private readonly logger;
    private readonly metrics;
    private readonly detectionService;
    private readonly queueService;
    private readonly contextService;
    private readonly websocketService;
    private constructor();
    static getInstance(): HandoffService;
    processMessage(conversationId: string, userId: string, message: string, botResponse: any): Promise<boolean>;
    initiateHandoff(conversationId: string, userId: string, reason: HandoffReason, confidence: number): Promise<void>;
    notifyHandoffAccepted(handoffId: string, advisorId: string, advisorName: string): Promise<void>;
    completeHandoff(handoffId: string, resolution: string): Promise<void>;
    cancelHandoff(handoffId: string, reason: string): Promise<void>;
    private calculatePriority;
}
//# sourceMappingURL=handoff.service.d.ts.map