// shared/utils/errors/http-errors.ts

import { BaseError } from './base-error';
import { ErrorMetadata } from './types';

export class ValidationError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('VALIDATION_ERROR', 400, message, metadata);
  }
}

export class ResourceNotFoundError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('RESOURCE_NOT_FOUND', 404, message, metadata);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('AUTHORIZATION_ERROR', 401, message, metadata);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('AUTHENTICATION_ERROR', 401, message, metadata);
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('FORBIDDEN', 403, message, metadata);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('NOT_FOUND', 404, message, metadata);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string, metadata?: ErrorMetadata) {
    super('CONFLICT', 409, message, metadata);
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal server error', metadata?: ErrorMetadata) {
    super('INTERNAL_SERVER_ERROR', 500, message, metadata);
  }
}