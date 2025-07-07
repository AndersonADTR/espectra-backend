// services/botpress/handlers/webhook/process-webhook.handler.ts

import { Handler, SQSEvent } from 'aws-lambda';
import { ConversationContextService } from '../../services/context/conversation-context.service';
import { BotpressMessageTransformer } from '../../services/botpress/transformers/message-transformer.service';
import { TokenManagementService } from '../../services/token/token-management.service';
// SPECTRUM: SSE Manager removed - using polling instead
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';

/**
 * Handler Lambda para procesar mensajes de webhook de Botpress desde SQS
 * Este Lambda procesa las respuestas asíncronas de Botpress y actualiza el contexto
 */
export const handler: Handler = async (event: SQSEvent) => {
  const logger = new Logger('ProcessWebhookHandler');
  const metrics = new MetricsService('ProcessWebhook');
  
  logger.info('Processing webhook messages from queue', { 
    recordCount: event.Records.length 
  });
  
  metrics.incrementCounter('QueueMessagesReceived', event.Records.length);
  
  const contextService = ConversationContextService.getInstance();
  const tokenService = TokenManagementService.getInstance();
  const transformer = new BotpressMessageTransformer();
  // SPECTRUM: SSE Manager removed - using polling instead
  
  const results = await Promise.all(
    event.Records.map(async (record) => {
      const startTime = Date.now();
      
      try {
        const webhookData = JSON.parse(record.body);
        const { conversationId, messages, userId, tokens } = webhookData;
        
        logger.info('Processing webhook message', { 
          conversationId, 
          userId,
          messageCount: messages?.length || 0
        });
  
        // Obtener el contexto actual
        const context = await contextService.getContext(conversationId);
        if (!context) {
          logger.error('Context not found for conversation', { conversationId });
          metrics.incrementCounter('ContextNotFound');
          return { success: false, error: 'Context not found', conversationId };
        }
  
        // Transformar mensajes de Botpress al formato interno
        const transformedMessages = messages.map((message: any) => 
          transformer.fromBotpressFormat(message)
        );
  
        // Registrar tokens si están incluidos en el webhook
        if (tokens && typeof tokens.total === 'number' && userId) {
          try {
            await tokenService.consumeTokens(userId, tokens.total);
            logger.info('Tokens consumed from webhook', { 
              userId, 
              tokenCount: tokens.total 
            });
          } catch (error) {
            logger.warn('Error consuming tokens from webhook', { 
              error: error instanceof Error ? error.message : 'Unknown error',
              userId, 
              tokenCount: tokens.total 
            });
            // Continuamos el procesamiento incluso si falla el consumo de tokens
          }
        }
  
        // Añadir mensajes al contexto
        for (const message of transformedMessages) {
          await contextService.addMessage(conversationId, {
            role: 'assistant',
            content: typeof message.content === 'string' 
              ? message.content 
              : JSON.stringify(message.content),
            timestamp: Date.now()
          });
        }
  
        // Actualizar contexto de Botpress si está incluido
        if (webhookData.context) {
          await contextService.updateContext(conversationId, {
            botpressContext: webhookData.context
          });
        }
        
        // Enviar respuesta al usuario via SSE
        if (userId) {
          const sseMessage = {
            type: 'BOT_RESPONSE',
            conversationId,
            content: transformedMessages.map((msg: { type: any; content: any; metadata: any; }) => ({
              type: msg.type,
              content: msg.content,
              metadata: msg.metadata
            })),
            timestamp: new Date().toISOString(),
            messageId: `processed_${Date.now()}`,
            metadata: {
              source: 'webhook_processor',
              messageCount: transformedMessages.length
            }
          };

          // SPECTRUM: Webhook responses are now stored in Botpress and retrieved via polling
          logger.info('SPECTRUM: Webhook response processed for polling retrieval', {
            userId,
            conversationId,
            messageCount: transformedMessages.length,
            platform: 'spectrum'
          });
        }
  
        metrics.recordLatency('WebhookMessageProcessingTime', Date.now() - startTime);
        metrics.incrementCounter('WebhookMessagesProcessed');
        
        return { 
          success: true, 
          conversationId,
          messageCount: messages.length
        };
      } catch (error) {
        logger.error('Error processing webhook message', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          recordId: record.messageId
        });
  
        metrics.incrementCounter('WebhookMessageErrors');
        
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          recordId: record.messageId
        };
      }
    })
  );
  
  const successCount = results.filter(r => r.success).length;
  logger.info('Webhook processing completed', { 
    total: event.Records.length,
    success: successCount,
    failed: event.Records.length - successCount
  });
  
  metrics.incrementCounter('WebhookBatchesProcessed');
  
  return { 
    processed: results,
    summary: {
      total: event.Records.length,
      success: successCount,
      failed: event.Records.length - successCount
    }
  };
};