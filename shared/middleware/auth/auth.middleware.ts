// shared/middleware/auth/auth.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AuthenticationService } from '@services/auth/services/authentication.service';
import { AuthenticationError } from '@shared/utils/errors';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('AuthMiddleware');

export const withAuth = (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => {
  return async (event: APIGatewayProxyEvent, context): Promise<APIGatewayProxyResult> => {
    const authService = new AuthenticationService();

    try {
      // Extraer el token del header de autorización
      const authHeader = event.headers.Authorization || event.headers.authorization;

      if (!authHeader) {
        logger.warn('No authorization header provided');
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: false,
            message: 'Unauthorized: No token provided',
            data: null,
            errors: {
              auth: ['No authorization token was found']
            }
          })
        };
      }

      // Extraer el token del header (Bearer token)
      const token = authHeader.replace('Bearer ', '');

      // Validar el token y obtener la información del usuario
      const user = await authService.validateToken(token);

      // Agregar la información del usuario al evento para que esté disponible en el handler
      if (!event.requestContext.authorizer) {
        event.requestContext.authorizer = {};
      }

      event.requestContext.authorizer.user = user;

      // Continuar con el handler
      return await handler(event, context);

    } catch (error) {
      logger.error('Authentication error', { error });

      if (error instanceof AuthenticationError) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            success: false,
            message: 'Unauthorized: Invalid token',
            data: null,
            errors: {
              auth: [error.message]
            }
          })
        };
      }

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          message: 'Internal server error',
          data: null,
          errors: {
            server: ['An unexpected error occurred']
          }
        })
      };
    } finally {
      await authService.cleanup();
    }
  };
};
