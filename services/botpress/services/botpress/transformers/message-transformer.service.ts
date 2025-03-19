// services/botpress/services/transformers/message-transformer.service.ts

import { Logger } from '@shared/utils/logger';

export interface InternalMessage {
  type: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface BotpressMessage {
  type: string;
  payload: {
    text?: string;
    attachments?: Array<{
      type: string;
      payload: any;
    }>;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

export class BotpressMessageTransformer {
  private readonly logger: Logger;
  
  constructor() {
    this.logger = new Logger('BotpressMessageTransformer');
  }
  
  /**
   * Transforma un mensaje del formato interno al formato de Botpress
   * @param message Mensaje en formato interno
   * @returns Mensaje en formato Botpress
   */
  public toBotpressFormat(message: string | InternalMessage): BotpressMessage {
    try {
      // Si es string, asumimos que es texto plano
      if (typeof message === 'string') {
        return {
          type: 'text',
          payload: {
            text: message
          }
        };
      }
      
      // Si ya tiene el formato correcto, validamos y devolvemos
      if (message.type) {
        switch (message.type) {
          case 'text':
            return {
              type: 'text',
              payload: {
                text: message.content
              },
              metadata: message.metadata
            };
            
          case 'image':
            return {
              type: 'image',
              payload: {
                url: message.content
              },
              metadata: message.metadata
            };
            
          case 'card':
            try {
              const cardData = JSON.parse(message.content);
              return {
                type: 'card',
                payload: cardData,
                metadata: message.metadata
              };
            } catch (e) {
              this.logger.error('Invalid card format', { error: e, content: message.content });
              // Fallback to text
              return {
                type: 'text',
                payload: {
                  text: message.content
                }
              };
            }
            
          default:
            // Para tipos desconocidos, intentamos pasar el contenido como está
            return {
              type: message.type,
              payload: {
                content: message.content
              },
              metadata: message.metadata
            };
        }
      }
      
      // Si no tiene formato reconocible, convertimos a texto
      return {
        type: 'text',
        payload: {
          text: JSON.stringify(message)
        }
      };
    } catch (error) {
      this.logger.error('Error transforming message to Botpress format', { error, message });
      // Fallback seguro
      return {
        type: 'text',
        payload: {
          text: typeof message === 'string' ? message : 'Error processing message'
        }
      };
    }
  }
  
  /**
   * Transforma un mensaje del formato de Botpress al formato interno
   * @param message Mensaje en formato Botpress
   * @returns Mensaje en formato interno
   */
  public fromBotpressFormat(message: BotpressMessage): InternalMessage {
    try {
      switch (message.type) {
        case 'text':
          return {
            type: 'text',
            content: message.payload.text || '',
            metadata: message.metadata
          };
          
        case 'image':
          return {
            type: 'image',
            content: message.payload.url || message.payload.image || '',
            metadata: message.metadata
          };
          
        case 'card':
          return {
            type: 'card',
            content: JSON.stringify(message.payload),
            metadata: message.metadata
          };
          
        case 'carousel':
          return {
            type: 'carousel',
            content: JSON.stringify(message.payload),
            metadata: message.metadata
          };
          
        default:
          // Para tipos desconocidos, serializamos el payload
          return {
            type: message.type,
            content: JSON.stringify(message.payload),
            metadata: message.metadata
          };
      }
    } catch (error) {
      this.logger.error('Error transforming message from Botpress format', { error, message });
      // Fallback seguro
      return {
        type: 'text',
        content: 'Error processing message from bot'
      };
    }
  }
  
  /**
   * Estima el número de tokens en un mensaje
   * @param message Mensaje a analizar
   * @returns Número estimado de tokens
   */
  public estimateTokenCount(message: string | InternalMessage | BotpressMessage): number {
    try {
      let text = '';
      
      if (typeof message === 'string') {
        text = message;
      } else if ('content' in message) {
        text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
      } else if ('payload' in message && message.payload.text) {
        text = message.payload.text;
      } else {
        text = JSON.stringify(message);
      }
      
      // Estimación simple: ~4 caracteres por token
      // Esta es una aproximación; el conteo real depende del tokenizador
      return Math.ceil(text.length / 4);
    } catch (error) {
      this.logger.error('Error estimating token count', { error, message });
      return 10; // Valor por defecto
    }
  }
}