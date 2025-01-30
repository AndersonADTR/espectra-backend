// services/botpress/types/chat.types.ts

export interface ChatMessage {
  conversationId: string;
  message: string;
  userId: string;
  metadata?: {
    source?: string;
    timestamp?: string;
    context?: Record<string, any>;
    sessionId?: string;
    handoff?: {
      requested?: boolean;
      reason?: string;
      agentId?: string;
    };
  };
}

export interface ChatResponse {
  responses: Array<{
    message: string;
    conversation_id: string;
    type: 'text' | 'handoff' | 'typing' | 'card';
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
  priority: 'high' | 'medium' | 'low';
  conversation_id: string;
  userId: string;
  message: string;
  timestamp: string;
  metadata?: {
    reason?: string;
    userInfo?: {
      name?: string;
      email?: string;
      plan?: string;
    };
    context?: Record<string, any>;
    connectionId?: string;
  };
}

export interface HandoffResponse {
  status: 'accepted' | 'rejected' | 'pending';
  conversation_id: string;
  agentId?: string;
  timestamp: string;
}

export interface ConversationContext {
  userId: string;
  lastInteraction: string;
  messageCount: number;
  handoffRequested: boolean;
  topics?: string[];
  handoffHistory?: Array<{
    timestamp: string;
    reason: string;
    agentId?: string;
    status: string;
  }>;
  customData?: Record<string, any>;
}