// services/botpress/services/retry/retry-handler.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';
import { MessageQueueService } from '../queue/message-queue.service';
import { BaseError } from '@shared/utils/errors';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

interface RetryableOperation<T> {
  execute: () => Promise<T>;
  onSuccess?: (result: T) => Promise<void>;
  onFinalFailure?: (error: BaseError) => Promise<void>;
}

export class RetryHandlerService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly queueService: MessageQueueService;
  
  private readonly defaultConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000, // 1 segundo
    maxDelay: 30000  // 30 segundos
  };

  constructor() {
    this.logger = new Logger('RetryHandlerService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.queueService = new MessageQueueService();
  }

  async withRetry<T>(
    operation: RetryableOperation<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.defaultConfig, ...config };
    let attempt = 1;
    let lastError: BaseError;

    while (attempt <= retryConfig.maxAttempts) {
      try {
        const startTime = Date.now();
        const result = await operation.execute();
        
        // Registrar métricas de éxito
        this.metrics.recordLatency('OperationDuration', Date.now() - startTime);
        this.metrics.incrementCounter('SuccessfulOperations');

        if (operation.onSuccess) {
          await operation.onSuccess(result);
        }

        return result;
      } catch (error) {
        lastError = error as BaseError;
        
        // Registrar el intento fallido
        this.metrics.incrementCounter('FailedAttempts');
        
        this.logger.warn('Operation failed, preparing retry', {
          attempt,
          maxAttempts: retryConfig.maxAttempts,
          error: (error as BaseError).message
        });

        if (attempt === retryConfig.maxAttempts) {
          break;
        }

        // Calcular y esperar el delay antes del siguiente intento
        const delay = this.calculateDelay(attempt, retryConfig);
        await this.sleep(delay);
        
        attempt++;
      }
    }

    // Todas los intentos fallaron
    this.metrics.incrementCounter('OperationsFailed');
    
    if (operation.onFinalFailure) {
      await operation.onFinalFailure(lastError!);
    }

    throw new BotpressError('Operation failed after all retry attempts', {
      attempts: attempt,
      lastError: lastError!.message
    });
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    // Exponential backoff con jitter
    const exponentialDelay = Math.min(
      config.maxDelay,
      config.baseDelay * Math.pow(2, attempt - 1)
    );
    
    // Añadir jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    
    return Math.max(0, exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async handleFailedMessage(
    message: any,
    error: Error,
    currentAttempt: number
  ): Promise<void> {
    try {
      // Si aún hay intentos disponibles, reencolar
      if (currentAttempt < this.defaultConfig.maxAttempts) {
        const updatedMessage = {
          ...message,
          metadata: {
            ...message.metadata,
            retryCount: (message.metadata.retryCount || 0) + 1,
            lastError: error.message,
            lastAttempt: new Date().toISOString()
          }
        };

        await this.queueService.enqueueMessage(updatedMessage);
        
        this.logger.info('Message requeued for retry', {
          messageId: message.id,
          attempt: currentAttempt,
          nextAttempt: currentAttempt + 1
        });
      } else {
        // Mover a DLQ si se agotaron los intentos
        await this.queueService.moveToDeadLetter(message, error);
        
        this.logger.warn('Message moved to DLQ after max retries', {
          messageId: message.id,
          attempts: currentAttempt,
          error: error.message
        });
      }
    } catch (handlingError) {
      this.logger.error('Failed to handle failed message', {
        error: handlingError,
        originalError: error,
        messageId: message.id
      });
      throw new BotpressError('Failed to handle message retry');
    }
  }
}