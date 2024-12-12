// services/botpress/types/chat.types.ts

export interface ProcessMessageRequest {
  conversationId: string;
  text: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface ConversationContext {
  lastInteraction: string;
  messageCount: number;
  topics?: string[];
  userPreferences?: Record<string, any>;
  handoffRequested?: boolean;
  customData?: Record<string, any>;
}

export interface BotpressConfig {
  HANDOFF_CONFIDENCE_THRESHOLD: any;
  webhookUrl: string;
  botId: string;
  workspaceId: string;
}

export interface ChatMessage {
  conversationId: string;
  text: any;
  message: string;
  userId: string;
  tags?: string[];
  metadata?: {
    source?: string;
    timestamp?: string;
    context?: Record<string, any>;
    sessionId?: string;
  };
}
  
export interface ChatResponse {
  responses: Array<{
    message: string;
    conversation_id: string;
    type?: 'text' | 'handoff' | 'typing' | 'card';
    tags?: string[];
    metadata?: {
      handoff?: {
        requested: boolean;
        reason?: string;
      };
      confidence?: number;
      context?: Record<string, any>;
    };
  }>;
}

export interface HandoffRequest {
  conversation_id: string;
  userId: string;
  message: string;
  timestamp: string;
  reason?: string;
  priority?: 'low' | 'medium' | 'high';
  metadata?: {
    connectionId: string;
    userInfo?: {
      name?: string;
      email?: string;
    };
    contextData?: Record<string, any>;
  };
}

export interface HandoffResponse {
  status: 'accepted' | 'rejected' | 'pending';
  conversation_id: string;
  agentId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type ChatEventType = 
  | 'message'
  | 'handoff_request'
  | 'handoff_accepted'
  | 'handoff_rejected'
  | 'typing'
  | 'error';

export interface ChatEvent {
  type: ChatEventType;
  conversation_id: string;
  timestamp: string;
  payload: Record<string, any>;
}