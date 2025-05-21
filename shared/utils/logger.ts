// shared/utils/logger.ts

import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor(private context: string) {
    // Asegurar que el nivel de log sea el correcto
    const logLevel = process.env.LOG_LEVEL || 'info';

    // Crear un formato personalizado para los logs
    const customFormat = winston.format.printf(({ level, message, timestamp, ...rest }) => {
      // Convertir metadatos a string JSON
      const meta = Object.keys(rest).length ? JSON.stringify(rest) : '';
      return `${timestamp} [${level.toUpperCase()}] [${this.context}]: ${message} ${meta}`;
    });

    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'espectra-backend',
        context: this.context,
        environment: process.env.NODE_ENV || 'dev',
        region: process.env.REGION || 'us-east-1'
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            customFormat
          ),
        }),
      ],
    });

    // Log de inicialización para verificar que el logger está funcionando
    this.debug(`Logger initialized with level: ${logLevel}`);
  }

  info(message: string, meta?: Record<string, any>) {
    // Asegurar que los logs se envíen a CloudWatch a través de console.log
    const logData = { message, context: this.context, ...meta };
    console.log(JSON.stringify(logData));
    this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    // Asegurar que los logs se envíen a CloudWatch a través de console.error
    const logData = { message, context: this.context, ...meta };
    console.error(JSON.stringify(logData));
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    // Asegurar que los logs se envíen a CloudWatch a través de console.warn
    const logData = { message, context: this.context, ...meta };
    console.warn(JSON.stringify(logData));
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    // Asegurar que los logs se envíen a CloudWatch a través de console.debug
    const logData = { message, context: this.context, ...meta };
    console.debug(JSON.stringify(logData));
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