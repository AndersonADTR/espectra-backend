// services/botpress/services/utils/botpress-utils.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { 
  BotpressMessage, 
  MessagePayload, 
  Button, 
  CarouselItem,
  NLUResult 
} from '../../types/botpress.types';

export class BotpressUtilsService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  constructor() {
    this.logger = new Logger('BotpressUtilsService');
    this.metrics = new MetricsService('Spectra/Botpress');
  }

  formatTextMessage(text: string, metadata?: Record<string, any>): BotpressMessage {
    return {
      id: this.generateMessageId(),
      type: 'text',
      payload: { text },
      metadata
    };
  }

  formatQuickReplies(
    text: string, 
    options: Array<{ title: string; value: string; }>,
    metadata?: Record<string, any>
  ): BotpressMessage {
    const buttons: Button[] = options.map(option => ({
      title: option.title,
      type: 'quick_reply',
      value: option.value
    }));

    return {
      id: this.generateMessageId(),
      type: 'quick_reply',
      payload: {
        text,
        buttons
      },
      metadata
    };
  }

  formatCarousel(items: CarouselItem[], metadata?: Record<string, any>): BotpressMessage {
    return {
      id: this.generateMessageId(),
      type: 'carousel',
      payload: {
        items: items.map(item => ({
          title: item.title,
          subtitle: item.subtitle,
          image: item.image,
          buttons: item.buttons
        }))
      },
      metadata
    };
  }

  extractEntities(nluResult: NLUResult): Record<string, string> {
    const entities: Record<string, string> = {};
    
    nluResult.entities.forEach(entity => {
      entities[entity.name] = entity.value;
    });

    return entities;
  }

  shouldTriggerHandoff(nluResult: NLUResult): boolean {
    // Criterios para determinar si se necesita handoff
    const lowConfidence = nluResult.intent.confidence < 0.7;
    const negativeSentiment = nluResult.sentiment.value < -0.5;
    const complexIntent = this.isComplexIntent(nluResult.intent.name);

    return lowConfidence || negativeSentiment || complexIntent;
  }

  analyzeMessageComplexity(text: string): {
    complexity: 'low' | 'medium' | 'high';
    factors: string[];
  } {
    const factors: string[] = [];
    let complexityScore = 0;

    // Longitud del mensaje
    if (text.length > 100) {
      complexityScore += 1;
      factors.push('message_length');
    }

    // Presencia de preguntas múltiples
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount > 1) {
      complexityScore += 1;
      factors.push('multiple_questions');
    }

    // Presencia de términos técnicos o específicos
    const technicalTerms = this.detectTechnicalTerms(text);
    if (technicalTerms.length > 0) {
      complexityScore += 1;
      factors.push('technical_terms');
    }

    return {
      complexity: this.getComplexityLevel(complexityScore),
      factors
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isComplexIntent(intent: string): boolean {
    const complexIntents = [
      'technical_support',
      'complaint',
      'refund_request',
      'account_issue',
      'billing_problem'
    ];

    return complexIntents.includes(intent);
  }

  private detectTechnicalTerms(text: string): string[] {
    const technicalTerms = [
      'api',
      'database',
      'server',
      'configuration',
      'integration',
      'authentication',
      'token',
      'endpoint',
      'webhook',
      'encryption'
    ];

    return technicalTerms.filter(term => 
      text.toLowerCase().includes(term.toLowerCase())
    );
  }

  private getComplexityLevel(score: number): 'low' | 'medium' | 'high' {
    if (score <= 1) return 'low';
    if (score === 2) return 'medium';
    return 'high';
  }

  sanitizeMessageContent(content: string): string {
    return content
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 1000);  // Limitar longitud máxima
  }

  extractSessionContext(message: BotpressMessage): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      messageType: message.type,
      intent: message.metadata?.intent,
      confidence: message.metadata?.confidence,
      entities: message.metadata?.entities || [],
      customData: message.metadata?.customData || {}
    };
  }

  logMessageProcessing(message: BotpressMessage, duration: number): void {
    this.logger.info('Message processed', {
      messageId: message.id,
      type: message.type,
      duration,
      intent: message.metadata?.intent,
      confidence: message.metadata?.confidence
    });

    this.metrics.recordLatency('MessageProcessingTime', duration);
  }
}