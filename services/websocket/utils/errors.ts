// services/websocket/utils/errors.ts

import { BaseError } from '@shared/utils/errors';

export class WebSocketError extends BaseError {

  readonly statusCode: number;
  readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super('WEBSOCKET_ERROR', statusCode, message);
    this.name = 'WebSocketError';
    this.statusCode = statusCode;

    // Necesario para que instanceof funcione correctamente
    Object.setPrototypeOf(this, WebSocketError.prototype);
  }
}

export class WebSocketConnectionError extends WebSocketError {
  constructor(message: string, details?: unknown) {
    super(message, 503, details);
    this.name = 'WebSocketConnectionError';
  }
}

export class WebSocketMessageError extends WebSocketError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'WebSocketMessageError';
  }
}