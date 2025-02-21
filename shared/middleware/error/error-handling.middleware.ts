// shared/middleware/error/error-handling.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { BaseError } from '@shared/utils/errors';

export class ErrorHandlingMiddleware {
  private static logger = new Logger('ErrorHandlingMiddleware');

  static withErrorHandling(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
    return async (event, context, callback: Callback) => {
      try {
        // Configurar el contexto
        context.callbackWaitsForEmptyEventLoop = false;
        
        // Agregar request ID al logger context
        const requestContext = {
          requestId: context.awsRequestId,
          path: event.path,
          method: event.httpMethod,
          sourceIP: event.requestContext.identity.sourceIp
        };

        this.logger.info('Processing request', requestContext);

        // Ejecutar el handler
        const result = await handler(event, context, callback);
        
        if (!result) {
          throw new Error('Handler did not return a result');
        }

        // Asegurar CORS headers
        return {
          ...result,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
            ...result.headers,
          }
        };

      } catch (error) {
        return this.handleError(error, context, event);
      }
    };
  }

  private static handleError(error: any, context: Context, event: APIGatewayProxyEvent) {
    const timestamp = new Date().toISOString();
    const requestId = context.awsRequestId;
    const requestInfo = {
      path: event.path,
      method: event.httpMethod,
      sourceIP: event.requestContext.identity.sourceIp
    };

    if (error instanceof BaseError) {
      console.log('Known error occurred', {
        ...requestInfo,
        errorType: error.name,
        errorCode: error.code,
        statusCode: error.statusCode,
        message: error.message,
        requestId,
        timestamp,
        ...(error.metadata || {})
      });

      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': true,
          'X-Request-ID': requestId
        },
        body: JSON.stringify({
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          details: {
            requestId,
            timestamp,
            ...(process.env.STAGE === 'dev' ? error.metadata : {})
          }
        })
      };
    }

    // Error no controlado
    console.log('Unhandled error occurred', {
      ...requestInfo,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      requestId,
      timestamp
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
        'X-Request-ID': requestId
      },
      body: JSON.stringify({
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.STAGE === 'dev' ? 
          (error instanceof Error ? error.message : 'Unknown error') : 
          'An internal server error occurred',
        statusCode: 500,
        details: {
          requestId,
          timestamp
        }
      })
    };
  }
}

// Helper para uso más simple
export const withErrorHandling = (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => 
  ErrorHandlingMiddleware.withErrorHandling(handler);