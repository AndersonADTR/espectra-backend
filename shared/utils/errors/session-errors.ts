// shared/utils/errors/session-errors.ts

import { BaseError } from './base-error';
import { ErrorMetadata } from './types';

export class SessionNotFoundError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('SESSION_NOT_FOUND', 404, message, metadata);
  }
}

export class SessionExpiredError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('SESSION_EXPIRED', 401, message, metadata);
  }
}