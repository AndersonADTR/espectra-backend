// services/botpress/services/base/base.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';

export abstract class BaseService {
  protected readonly logger: Logger;
  protected readonly metrics: MetricsService;

  constructor(serviceName: string) {
    this.logger = new Logger(serviceName);
    this.metrics = new MetricsService('Spectra/Botpress');
  }

  public handleError(error: Error, context?: Record<string, any>): never {
    this.logger.error('Service error occurred', {
      error,
      context,
      service: this.constructor.name
    });

    if (error instanceof BotpressError) {
      throw error;
    }

    throw new BotpressError(`Error in ${this.constructor.name}`, {
      originalError: error,
      context
    });
  }

  public async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      this.metrics.recordLatency(`${operationName}Duration`, duration);
      this.metrics.incrementCounter(`${operationName}Success`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordLatency(`${operationName}Duration`, duration);
      this.metrics.incrementCounter(`${operationName}Error`);
      throw error;
    }
  }
}