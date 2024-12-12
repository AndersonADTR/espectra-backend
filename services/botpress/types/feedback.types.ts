// services/botpress/types/feedback.types.ts

export interface FeedbackData {
    userId: string;
    conversationId: string;
    messageId?: string;
    rating: number;
    comment?: string;
    tags?: string[];
    metadata?: Record<string, any>;
}