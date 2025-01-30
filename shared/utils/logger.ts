// shared/utils/logger.ts
import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor(private context: string) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'espectra-backend',
        context: this.context,
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, any>) {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.logger.debug(message, meta);
  }
}

// shared/utils/errors.ts
export class BaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string) {
    super('AUTHORIZATION_ERROR', 401, message);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super('VALIDATION_ERROR', 400, message);
  }
}

export class ResourceNotFoundError extends BaseError {
  constructor(message: string) {
    super('RESOURCE_NOT_FOUND', 404, message);
  }
}

export class InternalServerError extends BaseError {
  constructor(message: string = 'Internal Server Error') {
    super('INTERNAL_SERVER_ERROR', 500, message);
  }
}