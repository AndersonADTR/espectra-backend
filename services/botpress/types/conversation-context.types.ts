// services/botpress/types/conversation-context.types.ts

/**
 * Representa el estado de una conversación
 */
export enum ConversationStatus {
    ACTIVE = 'ACTIVE',       // Conversación activa
    INACTIVE = 'INACTIVE',   // Conversación inactiva pero reanudable
    TERMINATED = 'TERMINATED', // Conversación terminada permanentemente
    PENDING_HANDOFF = 'PENDING_HANDOFF', // Esperando transferencia a asesor
    WITH_ADVISOR = 'WITH_ADVISOR' // Actualmente con un asesor humano
  }
  
  /**
   * Representa el tipo de respuesta/conversación
   */
  export enum ConversationType {
    BOT = 'BOT',           // Conversación con el bot
    ADVISOR = 'ADVISOR',   // Conversación con asesor humano
    MIXED = 'MIXED'        // Conversación que ha tenido ambos tipos
  }
  
  /**
   * Interfaz que define la estructura del contexto de una conversación
   */
  export interface ConversationContext {
    // Clave primaria en DynamoDB
    conversationId: string;
    
    // Usuario asociado a esta conversación
    userId: string;
    
    // Estado actual de la conversación
    status: ConversationStatus;
    
    // Tipo de conversación
    type: ConversationType;
    
    // Marcas de tiempo importantes
    createdAt: string;
    updatedAt: string;
    lastActivity: string;
    
    // Último mensaje para resumir o continuar la conversación
    lastMessage?: {
      content: string;
      sender: 'user' | 'bot' | 'advisor';
      timestamp: string;
    };
    
    // Datos compartidos con Botpress para mantener contexto de la conversación
    botpressContext?: {
      // Variables de estado que Botpress utiliza para recordar conversación
      variables: Record<string, any>;
      
      // ID de sesión en Botpress, si es aplicable
      sessionId?: string;
      
      // Cualquier dato adicional necesario para Botpress
      metadata?: Record<string, any>;
    };
    
    // Datos para el sistema de handoff
    handoffContext?: {
      // Registra cuántas veces esta conversación pasó a un asesor
      handoffCount: number;
      
      // ID del último asesor asignado, si aplica
      lastAdvisorId?: string;
      
      // Razón del último handoff
      lastHandoffReason?: string;
      
      // Timestamp del último handoff
      lastHandoffTimestamp?: string;
    };
    
    // Metadatos sobre la conversación para análisis
    metadata?: {
      // Plan del usuario en esta conversación
      userPlan: string;
      
      // Tema o categoría de la conversación
      topic?: string;
      
      // Referencia a documentos o archivos mencionados
      referencedDocuments?: string[];
      
      // Canal origen (mobile, web, etc)
      channel?: string;
      
      // Intención principal detectada
      primaryIntent?: string;
      
      // Tags para análisis
      tags?: string[];
      
      // Datos adicionales específicos del cliente
      customData?: Record<string, any>;
    };
    
    // Time-to-live (TTL) para expiración en DynamoDB
    ttl?: number;
  }
  
  /**
   * Opciones para consultar el historial de conversaciones
   */
  export interface ConversationQueryOptions {
    // Cantidad máxima de resultados a devolver
    limit?: number;
    
    // Token para paginación
    nextToken?: string;
    
    // Filtros adicionales
    filter?: {
      status?: ConversationStatus | ConversationStatus[];
      type?: ConversationType | ConversationType[];
      startDate?: string;
      endDate?: string;
    };
    
    // Orden de los resultados
    sortDirection?: 'ASC' | 'DESC';
  }
  
  /**
   * Resultado de una operación de consulta de conversaciones
   */
  export interface ConversationQueryResult {
    // Lista de conversaciones encontradas
    conversations: ConversationContext[];
    
    // Token para obtener la siguiente página de resultados, si hay más
    nextToken?: string;
    
    // Cantidad total de resultados que coinciden (si está disponible)
    totalCount?: number;
  }
  
  /**
   * Actualizaciones permitidas para el contexto de una conversación
   */
  export type ConversationContextUpdates = Partial<
    Omit<ConversationContext, 'conversationId' | 'userId' | 'createdAt'>
  >;