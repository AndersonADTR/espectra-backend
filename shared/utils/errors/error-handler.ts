// shared/utils/errors/error-handler.ts
import { APIGatewayProxyResult } from 'aws-lambda';
import { BaseError } from './base-error';
import { InternalServerError, Logger } from '../logger';

const logger = new Logger('ErrorHandler');

export const errorHandler = (error: Error | BaseError): APIGatewayProxyResult => {
  if (error instanceof BaseError) {
    logger.error('Known error occurred', { 
      errorType: error.name,
      errorCode: error.code,
      errorMessage: error.message,
      metadata: error.metadata 
    });

    return {
      statusCode: error.statusCode,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(error.toJSON())
    };
  }

  // Error no controlado
  logger.error('Unhandled error occurred', { 
    errorType: error.name,
    errorMessage: error.message,
    stack: error.stack 
  });

  const internalError = new InternalServerError(
    'An unexpected error occurred'
  );

  return {
    statusCode: internalError.statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(internalError)
  };
};