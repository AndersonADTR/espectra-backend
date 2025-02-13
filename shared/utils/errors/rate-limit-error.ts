// shared/utils/errors/rate-limit-error.ts

import { BaseError } from './base-error';
import { ErrorMetadata } from './types';

export class TooManyRequestsError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('TOO_MANY_REQUESTS', 429, message, metadata);
  }
}