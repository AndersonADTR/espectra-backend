// shared/utils/errors/base-error.ts
import { ErrorResponse, ErrorMetadata } from './types';

export class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: ErrorMetadata;

  constructor(code: string, statusCode: number, message: string, metadata?: ErrorMetadata) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;

    // Necesario para que instanceof funcione correctamente
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.metadata
    };
  }
}