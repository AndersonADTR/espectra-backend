// services/botpress/types/botpress.types.ts

// Tipos base de configuración
export interface BotpressConfig {
    webhookUrl: string;
    botId: string;
    workspaceId: string;
    apiKey?: string;
    baseUrl?: string;
  }
  
  // Tipos de mensajes
  export interface BotpressMessage {
    id: string;
    type: BotpressMessageType;
    payload: MessagePayload;
    metadata?: MessageMetadata;
  }
  
  export type BotpressMessageType = 
    | 'text'
    | 'image'
    | 'card'
    | 'carousel'
    | 'file'
    | 'audio'
    | 'video'
    | 'location'
    | 'quick_reply'
    | 'custom';
  
    export type UserPlanType = 
      | 'basic'
      | 'pro'
      | 'business'
      | 'enterprise';
  
  export interface MessagePayload {
    text?: string;
    title?: string;
    subtitle?: string;
    image?: string;
    buttons?: Button[];
    items?: CarouselItem[];
    url?: string;
    coordinates?: Coordinates;
    [key: string]: any;
  }
  
  export interface MessageMetadata {
    userId?: string;
    planType?: UserPlanType;
    source?: string;
    intent?: string;
    confidence?: number;
    language?: string;
    createdAt?: string;
    tags?: string[];
    sessionId?: string;
    customData?: Record<string, any>;
    entities?: Record<string, any>;
    templateId?: string;
    templateVersion?: number;
  }
  
  // Tipos de elementos UI
  export interface Button {
    title: string;
    type: ButtonType;
    value: string;
    payload?: any;
  }
  
  export type ButtonType = 'postback' | 'url' | 'quick_reply';
  
  export interface CarouselItem {
    title: string;
    subtitle?: string;
    image?: string;
    buttons?: Button[];
  }
  
  export interface Coordinates {
    latitude: number;
    longitude: number;
  }
  
  // Tipos de eventos
  export interface BotpressEvent {
    type: BotpressEventType;
    channel: string;
    direction: 'incoming' | 'outgoing';
    payload: any;
    botId: string;
    target: string;
    threadId?: string;
    id: string;
    messageId?: string;
    createdAt: string;
  }
  
  export type BotpressEventType =
    | 'message'
    | 'handoff'
    | 'session'
    | 'feedback'
    | 'typing'
    | 'error';
  
  // Tipos de sesión
  export interface BotpressSession {
    id: string;
    userId: string;
    botId: string;
    channel: string;
    threadId?: string;
    lastEventAt: string;
    lastMessageAt?: string;
    context: SessionContext;
    tags?: string[];
    status: SessionStatus;
  }
  
  export interface SessionContext {
    currentFlow?: string;
    currentNode?: string;
    previousFlow?: string;
    previousNode?: string;
    jumpPoints?: string[];
    variables: Record<string, any>;
    temp: Record<string, any>;
  }
  
  export type SessionStatus = 'active' | 'paused' | 'ended';
  
  // Tipos de análisis
  export interface BotpressAnalytics {
    messageCount: number;
    userCount: number;
    sessionCount: number;
    retentionRate: number;
    averageSessionDuration: number;
    topIntents: Array<{
      intent: string;
      count: number;
      confidence: number;
    }>;
    handoffRate: number;
    successRate: number;
  }
  
  // Tipos de NLU
  export interface NLUResult {
    intent: {
      name: string;
      confidence: number;
      context?: string;
    };
    entities: Array<{
      name: string;
      value: string;
      confidence: number;
      source: string;
      position: {
        start: number;
        end: number;
      };
    }>;
    language: string;
    sentiment: {
      value: number;
      type: 'positive' | 'negative' | 'neutral';
    };
  }
  
  // Tipos de error
  export interface BotpressErrorResponse {
    error: {
      type: string;
      code: string;
      message: string;
      details?: any;
    };
    requestId?: string;
    timestamp: string;
  }
  
  // Tipos de configuración de flujo
  export interface FlowConfig {
    id: string;
    name: string;
    version: string;
    description?: string;
    triggers: FlowTrigger[];
    nodes: FlowNode[];
    links: FlowLink[];
  }
  
  export interface FlowTrigger {
    type: 'intent' | 'keyword' | 'event' | 'scheduled';
    conditions: Record<string, any>;
    priority: number;
  }
  
  export interface FlowNode {
    id: string;
    type: 'standard' | 'action' | 'router' | 'api' | 'handoff';
    name: string;
    next: string[];
    config: Record<string, any>;
  }
  
  export interface FlowLink {
    source: string;
    target: string;
    condition?: string;
  }