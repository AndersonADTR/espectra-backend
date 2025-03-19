// services/botpress/services/handoff/handoff-detection.service.ts

import { Logger } from '@shared/utils/logger';
import { ConversationContextService } from '../context/conversation-context.service';
import { BotpressService } from '../botpress/botpress.service';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../config/config';

export interface HandoffDecision {
  shouldHandoff: boolean;
  reason: HandoffReason;
  confidence: number;
  metadata?: Record<string, any>;
}

export enum HandoffReason {
  EXPLICIT_REQUEST = 'EXPLICIT_REQUEST',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  COMPLEX_QUERY = 'COMPLEX_QUERY',
  TOKEN_LIMIT = 'TOKEN_LIMIT',
  REPEATED_ISSUE = 'REPEATED_ISSUE',
  DETECTED_FRUSTRATION = 'DETECTED_FRUSTRATION',
  SENSITIVE_TOPIC = 'SENSITIVE_TOPIC',
  UNDEFINED = 'UNDEFINED'
}

export class HandoffDetectionService {
  private static instance: HandoffDetectionService;
  private readonly logger: Logger;
  private readonly contextService: ConversationContextService;
  private readonly botpressService: BotpressService;
  private readonly metrics: MetricsService;
  
  // Configuraciones para detección
  private readonly keywordTriggers: string[];
  private readonly confidenceThreshold: number;
  private readonly maxRepetitionsBeforeHandoff: number;
  private readonly sensitiveTopics: string[];

  private constructor() {
    this.logger = new Logger('HandoffDetectionService');
    this.contextService = ConversationContextService.getInstance();
    this.botpressService = BotpressService.getInstance();
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    
    // Cargar configuraciones desde variables de entorno
    this.confidenceThreshold = parseFloat(process.env.HANDOFF_CONFIDENCE_THRESHOLD || '0.4');
    this.maxRepetitionsBeforeHandoff = parseInt(process.env.HANDOFF_MAX_REPETITIONS || '3');
    
    // Palabras clave que indican solicitud explícita de hablar con un humano
    this.keywordTriggers = (process.env.HANDOFF_KEYWORD_TRIGGERS || 
      'agente,humano,persona,representante,supervisor,hablar con alguien,hablar con una persona')
      .split(',')
      .map(keyword => keyword.trim().toLowerCase());
      
    // Temas sensibles que pueden requerir atención humana
    this.sensitiveTopics = (process.env.HANDOFF_SENSITIVE_TOPICS || 
      'facturación,pago,cancelación,seguridad,problema legal')
      .split(',')
      .map(topic => topic.trim().toLowerCase());
  }
  
  public static getInstance(): HandoffDetectionService {
    if (!HandoffDetectionService.instance) {
      HandoffDetectionService.instance = new HandoffDetectionService();
    }
    return HandoffDetectionService.instance;
  }
  
  /**
   * Analiza si se debe realizar un handoff basado en la interacción actual
   */
  public async shouldHandoff(
    conversationId: string, 
    latestMessage: string, 
    botResponse: any
  ): Promise<HandoffDecision> {
    try {
      // Obtener el contexto completo de la conversación
      const context = await this.contextService.getContext(conversationId);
      if (!context) {
        return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
      }
      
      // 1. Verificar solicitud explícita
      const explicitRequest = this.detectExplicitHandoffRequest(latestMessage);
      if (explicitRequest.shouldHandoff) {
        this.metrics.incrementCounter('HandoffDetection_ExplicitRequest');
        return explicitRequest;
      }
      
      // 2. Verificar confianza del bot
      const confidenceCheck = this.analyzeBotConfidence(botResponse);
      if (confidenceCheck.shouldHandoff) {
        this.metrics.incrementCounter('HandoffDetection_LowConfidence');
        return confidenceCheck;
      }
      
      // 3. Verificar tema sensible
      const sensitiveTopicCheck = this.detectSensitiveTopic(latestMessage);
      if (sensitiveTopicCheck.shouldHandoff) {
        this.metrics.incrementCounter('HandoffDetection_SensitiveTopic');
        return sensitiveTopicCheck;
      }
      
      // 4. Verificar patrones de frustración
      const frustrationCheck = this.detectUserFrustration(context.messages);
      if (frustrationCheck.shouldHandoff) {
        this.metrics.incrementCounter('HandoffDetection_UserFrustration');
        return frustrationCheck;
      }
      
      // 5. Verificar repeticiones o circularidad en la conversación
      const repetitionCheck = this.detectConversationRepetition(context.messages);
      if (repetitionCheck.shouldHandoff) {
        this.metrics.incrementCounter('HandoffDetection_ConversationRepetition');
        return repetitionCheck;
      }
      
      // Si ninguna condición se cumple, no hacemos handoff
      return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
      
    } catch (error) {
      this.logger.error('Error in handoff detection', { error, conversationId });
      // En caso de error, mejor no hacer handoff para evitar comportamientos inesperados
      return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
  }
  
  /**
   * Detecta si el usuario está solicitando explícitamente hablar con un humano
   */
  private detectExplicitHandoffRequest(message: string): HandoffDecision {
    const normalizedMessage = message.toLowerCase();
    
    // Verificar si alguna palabra clave está presente
    for (const keyword of this.keywordTriggers) {
      if (normalizedMessage.includes(keyword)) {
        return {
          shouldHandoff: true,
          reason: HandoffReason.EXPLICIT_REQUEST,
          confidence: 0.9,
          metadata: { trigger: keyword }
        };
      }
    }
    
    return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
  }
  
  /**
   * Analiza la confianza del bot en su respuesta
   */
  private analyzeBotConfidence(botResponse: any): HandoffDecision {
    // Si la respuesta no tiene metadata de confianza, no podemos evaluar
    if (!botResponse || !botResponse.metadata || botResponse.metadata.confidence === undefined) {
      return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    
    const responseConfidence = botResponse.metadata.confidence;
    
    // Si la confianza está por debajo del umbral, sugerir handoff
    if (responseConfidence < this.confidenceThreshold) {
      return {
        shouldHandoff: true,
        reason: HandoffReason.LOW_CONFIDENCE,
        confidence: 0.7,
        metadata: { 
          botConfidence: responseConfidence,
          threshold: this.confidenceThreshold
        }
      };
    }
    
    return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
  }
  
  /**
   * Detecta si la conversación trata de un tema sensible que podría requerir intervención humana
   */
  private detectSensitiveTopic(message: string): HandoffDecision {
    const normalizedMessage = message.toLowerCase();
    
    for (const topic of this.sensitiveTopics) {
      if (normalizedMessage.includes(topic)) {
        return {
          shouldHandoff: true,
          reason: HandoffReason.SENSITIVE_TOPIC,
          confidence: 0.6,
          metadata: { sensitiveTopic: topic }
        };
      }
    }
    
    return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
  }
  
  /**
   * Detecta si el usuario muestra signos de frustración
   */
  private detectUserFrustration(messages: any[]): HandoffDecision {
    // Solo analizar si hay suficientes mensajes
    if (messages.length < 3) {
      return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    
    // Obtener solo mensajes del usuario
    const userMessages = messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content.toLowerCase());
    
    // Solo analizar los últimos mensajes
    const recentUserMessages = userMessages.slice(-3);
    
    // Palabras clave que indican frustración
    const frustrationKeywords = [
      'no entiendes', 'no entendiste', 'no me estás ayudando', 
      'no sirves', 'inútil', 'mal servicio', 'hablar con una persona',
      'estoy molesto', 'frustrado', 'enojado'
    ];
    
    // Signos de frustración - uso excesivo de puntuación
    const hasPunctuationSigns = recentUserMessages.some(msg => 
      (msg.match(/\?/g) || []).length > 2 || 
      (msg.match(/\!/g) || []).length > 1
    );
    
    // Mensajes cortos repetidos que indican frustración
    const hasShortRepetitiveMessages = recentUserMessages.length >= 2 && 
      recentUserMessages.every(msg => msg.length < 15);
    
    // Verificar palabras clave de frustración
    const hasFrustrationKeywords = recentUserMessages.some(msg => 
      frustrationKeywords.some(keyword => msg.includes(keyword))
    );
    
    if (hasFrustrationKeywords || (hasPunctuationSigns && hasShortRepetitiveMessages)) {
      return {
        shouldHandoff: true,
        reason: HandoffReason.DETECTED_FRUSTRATION,
        confidence: 0.7,
        metadata: {
          hasPunctuationSigns,
          hasShortRepetitiveMessages,
          hasFrustrationKeywords
        }
      };
    }
    
    return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
  }
  
  /**
   * Detecta patrones de repetición en la conversación que indican que no se está avanzando
   */
  private detectConversationRepetition(messages: any[]): HandoffDecision {
    if (messages.length < 4) {
      return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
    }
    
    // Extraer pares de mensajes usuario-bot (similares) 
    const recentUserMessages = messages
      .filter(msg => msg.role === 'user')
      .slice(-3)
      .map(msg => msg.content.toLowerCase());
    
    // Algoritmo simplificado: verificar si el usuario pregunta lo mismo varias veces
    // En una implementación real, usaríamos algoritmos de similitud de texto más sofisticados
    
    // Verificar repeticiones exactas
    const uniqueMessages = new Set(recentUserMessages);
    const hasExactRepetitions = uniqueMessages.size < recentUserMessages.length;
    
    // Verificar repeticiones de longitud similar (potencialmente reformulaciones)
    const messageLengths = recentUserMessages.map(msg => msg.length);
    const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
    const hasConsistentLength = messageLengths.every(length => 
      Math.abs(length - avgLength) < avgLength * 0.2
    );
    
    // Si detectamos patrones de repetición...
    if (hasExactRepetitions || (hasConsistentLength && recentUserMessages.length >= this.maxRepetitionsBeforeHandoff)) {
      return {
        shouldHandoff: true,
        reason: HandoffReason.REPEATED_ISSUE,
        confidence: 0.6,
        metadata: {
          hasExactRepetitions,
          hasConsistentLength,
          messageCount: recentUserMessages.length
        }
      };
    }
    
    return { shouldHandoff: false, reason: HandoffReason.UNDEFINED, confidence: 0 };
  }
}