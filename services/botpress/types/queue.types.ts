// services/botpress/services/queue/message-queue.service.ts

export interface QueueMessage {
    id: string;
    type: 'message' | 'handoff' | 'system';
    payload: any;
    metadata: {
      userId: string;
      timestamp: string;
      retryCount?: number;
      priority?: 'high' | 'normal' | 'low';
      [key: string]: any;
    };
}

export interface QueueMetrics {
  messagesProcessed: number;
  messagesFailedProcessing: number;
  averageProcessingTime: number;
}