// shared/middleware/validation/validation.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { Schema } from 'joi';
import { Logger } from '@shared/utils/logger';
import { ValidationError } from '@shared/utils/errors';

export interface ValidationOptions {
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

export class ValidationMiddleware {
  private static logger = new Logger('ValidationMiddleware');

  static validate(schema: Schema, options: ValidationOptions = {}) {
    return (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => {
      return async (event: APIGatewayProxyEvent, context: Context, callback: Callback) => {
        try {
          let parsedBody;
          
          this.logger.info('Validation started', {
            hasBody: !!event.body,
            isBase64: event.isBase64Encoded,
            contentType: event.headers['Content-Type'] || event.headers['content-type']
          });

          if (event.body) {
            try {
              if (event.isBase64Encoded) {
                const decodedBody = Buffer.from(event.body, 'base64').toString('utf8');
                this.logger.info('Decoded base64 body', { decodedBody });
                parsedBody = JSON.parse(decodedBody);
              } else {
                this.logger.info('Parsing raw body', { body: event.body });
                parsedBody = JSON.parse(event.body);
              }

              this.logger.info('Parsed body before validation', { parsedBody });

              // Validar con Joi
              const { error, value } = schema.validate(parsedBody, {
                abortEarly: false,
                stripUnknown: true,
                ...options
              });

              if (error) {
                this.logger.error('Validation error details', { 
                  error: error.details,
                  receivedValue: parsedBody
                });
                throw new ValidationError('Validation failed', {
                  details: error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path
                  }))
                });
              }

              this.logger.info('Validation successful', { validatedValue: value });
              event.body = JSON.stringify(value);
            } catch (error) {
              this.logger.error('Body processing error', { 
                error,
                bodyPreview: event.body?.substring(0, 100)
              });
              throw error;
            }
          } else {
            throw new Error('No body found in request');
          }
          const result = await handler(event, context, callback);
          if (!result) {
            throw new Error('Handler did not return a result');
          }
          return result;
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error;
          }
          throw new ValidationError(
            error instanceof Error ? error.message : 'Invalid request data'
          );
        }
      };
    };
  }
}

// Exportar un helper para uso más simple
export const validateRequest = (schema: Schema, options?: ValidationOptions) => 
  ValidationMiddleware.validate(schema, options);