// services/botpress/types/webhook.types.ts

export interface WebhookPayload {
    type: string;
    botId: string;
    channel: string;
    payload: Record<string, any>;
    timestamp: string;
  }