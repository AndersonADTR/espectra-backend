// services/botpress/utils/errors.ts

import { BaseError } from '@shared/utils/errors';

export class BotpressError extends BaseError {
  constructor(message: string, details?: unknown) {
    super('BOTPRESS_ERROR', 500, message);
    this.name = 'BotpressError';
    //this.details = details;
  }
}

export class BotpressConfigError extends BotpressError {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = 'BotpressConfigError';
  }
}

export class BotpressAPIError extends BotpressError {
  constructor(message: string, details?: unknown) {
    super(`API error: ${message}`, details);
    this.name = 'BotpressAPIError';
  }
}

export class BotpressServiceError extends BaseError {
  constructor(code: string, message: string, public readonly details?: unknown) {
    super(code, 500, message);
    this.name = 'BotpressServiceError';
  }
}

export class BotpressValidationError extends BaseError {
  constructor(message: string, public readonly details?: unknown) {
    super('BOTPRESS_VALIDATION_ERROR', 400, message);
    this.name = 'BotpressValidationError';
  }
}

export class BotpressConnectionError extends BaseError {
  constructor(message: string, public readonly details?: unknown) {
    super('BOTPRESS_CONNECTION_ERROR', 503, message);
    this.name = 'BotpressConnectionError';
  }
}