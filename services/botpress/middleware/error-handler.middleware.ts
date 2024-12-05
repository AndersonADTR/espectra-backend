// services/botpress/middleware/error-handler.middleware.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../utils/errors';
import { BaseError, ValidationError } from '@shared/utils/errors';
import { BotpressHealthService } from '../services/health/botpress-health.service';

interface ErrorResponse {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

export class ErrorHandlerMiddleware {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly healthService: BotpressHealthService;

  constructor() {
    this.logger = new Logger('ErrorHandlerMiddleware');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.healthService = new BotpressHealthService();
  }

  async handleError(error: Error, context?: Record<string, any>): Promise<ErrorResponse> {
    try {
      const timestamp = new Date().toISOString();
      const requestId = context?.requestId || `err_${Date.now()}`;

      // Incrementar métricas de error
      this.metrics.incrementCounter('BotpressErrors');
      this.metrics.incrementCounter(`BotpressError_${this.getErrorType(error)}`);

      // Registrar error
      this.logger.error('Error occurred in Botpress service', {
        error,
        type: error.constructor.name,
        context,
        requestId
      });

      // Construir respuesta de error
      const errorResponse = this.buildErrorResponse(error, requestId, timestamp);

      // Verificar si necesitamos actualizar el estado de salud
      await this.checkHealthImpact(error);

      return errorResponse;
    } catch (handlingError) {
      // Error durante el manejo del error
      this.logger.error('Error while handling error', { handlingError });
      
      return {
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while processing the error',
        timestamp: new Date().toISOString()
      };
    }
  }

  private buildErrorResponse(
    error: Error,
    requestId: string,
    timestamp: string
  ): ErrorResponse {
    if (error instanceof BaseError) {
      return {
        status: error.statusCode,
        code: error.code,
        message: error.message,
        details: error.metadata,
        requestId,
        timestamp
      };
    }

    if (error instanceof ValidationError) {
      return {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.metadata,
        requestId,
        timestamp
      };
    }

    if (error instanceof BotpressError) {
      return {
        status: 500,
        code: 'BOTPRESS_ERROR',
        message: error.message,
        details: error.metadata,
        requestId,
        timestamp
      };
    }

    // Error no manejado
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: this.sanitizeErrorDetails(error),
      requestId,
      timestamp
    };
  }

  private async checkHealthImpact(error: Error): Promise<void> {
    try {
      // Determinar si el error afecta la salud del sistema
      if (this.isHealthImpactingError(error)) {
        // Forzar una verificación de salud
        await this.healthService.checkHealth(true);
      }
    } catch (healthCheckError) {
      this.logger.error('Failed to check health impact', { healthCheckError });
    }
  }

  private isHealthImpactingError(error: Error): boolean {
    const criticalErrorTypes = [
      'ConnectionError',
      'TimeoutError',
      'DatabaseError',
      'BotpressAPIError'
    ];

    return criticalErrorTypes.includes(error.constructor.name) ||
           error.message.toLowerCase().includes('connection') ||
           error.message.toLowerCase().includes('timeout');
  }

  private getErrorType(error: Error): string {
    if (error instanceof ValidationError) return 'Validation';
    if (error instanceof BotpressError) return 'Botpress';
    if (error instanceof BaseError) return error.code;
    return 'Unknown';
  }

  private sanitizeErrorDetails(error: Error): Record<string, any> {
    // Eliminar información sensible del error
    const sanitized: Record<string, any> = {
      name: error.name,
      message: error.message
    };

    // Si hay stack trace en producción, solo incluir la primera línea
    if (error.stack && process.env.NODE_ENV !== 'production') {
      sanitized.stack = error.stack.split('\n')[0];
    }

    return sanitized;
  }

  public isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'ConnectionError',
      'TimeoutError',
      'NetworkError',
      'RateLimitError'
    ];

    return retryableErrors.includes(error.constructor.name) ||
           error.message.toLowerCase().includes('timeout') ||
           error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('connection');
  }

  public getRetryDelay(attempt: number): number {
    // Exponential backoff con jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }

  public async logErrorMetrics(error: Error, context?: Record<string, any>): Promise<void> {
    try {
      const errorType = this.getErrorType(error);
      const errorMetrics = {
        type: errorType,
        timestamp: Date.now(),
        context: context || {},
        isRetryable: this.isRetryableError(error)
      };

      // Registrar métricas detalladas
      await this.metrics.recordMetric('ErrorOccurrence', 1, {
        errorType,
        isRetryable: errorMetrics.isRetryable.toString()
      });

      // Registrar para análisis
      this.logger.info('Error metrics recorded', { errorMetrics });
    } catch (metricsError) {
      this.logger.error('Failed to log error metrics', { metricsError });
    }
  }
}