// services/botpress/types/handoff.types.ts

export interface HandoffEvent {
  type: HandoffEventType;
  queueId: string;
  conversationId: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface HandoffQueue {
  queueId: string;
  conversationId: string;
  userId: string;
  advisorId?: string;
  status: HandoffStatus;
  priority: HandoffPriority;
  createdAt: string;
  updatedAt: string;
  metadata?: HandoffMetadata;
  ttl?: number;
}
  
export type HandoffStatus = 
  | 'pending'    // Esperando ser asignado
  | 'assigned'   // Asignado a un asesor
  | 'active'     // Conversación en curso
  | 'completed'  // Handoff completado
  | 'cancelled'  // Cancelado por el usuario o sistema
  | 'timeout';   // Expiró sin ser atendido

export type HandoffPriority = 'low' | 'medium' | 'high';

export interface HandoffMetadata {
  source?: 'bot' | 'user' | 'system';
  reason?: string;
  userInfo?: {
    name?: string;
    email?: string;
    plan?: string;
    language?: string;
  };
  contextData?: {
    previousMessages?: number;
    topicDetected?: string;
    sentimentScore?: number;
    tags?: string[];
  };
  metrics?: {
    waitTime?: number;
    responseTime?: number;
    resolutionTime?: number;
  };
}
  
export interface HandoffEvent {
  type: HandoffEventType;
  queueId: string;
  conversationId: string;
  timestamp: string;
  data: Record<string, any>;
}

export type HandoffEventType = 
  | 'handoff_requested'
  | 'advisor_assigned'
  | 'handoff_started'
  | 'message_sent'
  | 'handoff_completed'
  | 'handoff_cancelled'
  | 'status_updated';

export interface AdvisorHandoffStats {
  totalHandoffs: number;
  activeHandoffs: number;
  completedHandoffs: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  satisfactionScore?: number;
}
  
export interface HandoffAssignment {
  queueId: string;
  advisorId: string;
  assignedAt: string;
  metadata?: {
    assignedBy?: string;
    reason?: string;
    priority?: HandoffPriority;
  };
}

export interface HandoffFilters {
  status?: HandoffStatus[];
  priority?: HandoffPriority[];
  advisorId?: string;
  userId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface HandoffSummary {
  totalInQueue: number;
  byPriority: Record<HandoffPriority, number>;
  byStatus: Record<HandoffStatus, number>;
  averageWaitTime: number;
  oldestRequest?: {
    queueId: string;
    waitTime: number;
    priority: HandoffPriority;
  };
}
  
export interface HandoffNotification {
  type: 'handoff';
  subType: HandoffEventType;
  queueId: string;
  conversationId: string;
  timestamp: string;
  priority: HandoffPriority;
  metadata?: {
    userId?: string;
    advisorId?: string;
    waitTime?: number;
    message?: string;
  };
}

// Tipos para las respuestas de la API
export interface HandoffResponse {
  success: boolean;
  queueId?: string;
  status?: HandoffStatus;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface HandoffListResponse {
  handoffs: HandoffQueue[];
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  summary?: HandoffSummary;
}

// Tipos para las solicitudes de la API
export interface CreateHandoffRequest {
  conversationId: string;
  userId: string;
  priority?: HandoffPriority;
  metadata?: HandoffMetadata;
}

export interface UpdateHandoffRequest {
  queueId: string;
  status?: HandoffStatus;
  advisorId?: string;
  priority?: HandoffPriority;
  metadata?: Partial<HandoffMetadata>;
}

export interface QueryHandoffsRequest {
  filters?: HandoffFilters;
  pagination?: {
    page: number;
    pageSize: number;
  };
  includeSummary?: boolean;
}

// Interfaces para validación
export interface HandoffValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Configuración para el sistema de handoff
export interface HandoffConfig {
  maxQueueSize: number;
  maxWaitTime: number;
  autoRejectAfter: number;
  priorityWeights: Record<HandoffPriority, number>;
  maxActiveHandoffsPerAdvisor: number;
  autoAssignmentEnabled: boolean;
  notificationSettings: {
    advisorNotificationDelay: number;
    userUpdateInterval: number;
    escalationThreshold: number;
  };
}