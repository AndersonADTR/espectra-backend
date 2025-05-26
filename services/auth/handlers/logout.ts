// services/auth/handlers/logout.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { withCors } from '@shared/middleware/cors';
import { Logger } from '@shared/utils/logger';
import { AuthenticationError } from '@shared/utils/errors';

const logger = new Logger('LogoutHandler');

// Usar APIGatewayProxyHandler para REST API Gateway
const logoutHandler: APIGatewayProxyHandler = async (event) => {
  // Log directo a CloudWatch para verificar que los logs se están enviando
  console.log(JSON.stringify({
    message: 'CLOUDWATCH TEST: Processing logout request',
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId,
    path: event.path,
    method: event.httpMethod,
    stage: event.requestContext?.stage,
    headers: event.headers,
    hasAuthorization: !!(event.headers.Authorization || event.headers.authorization)
  }));

  logger.info('Processing logout request', {
    headers: event.headers,
    hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId
  });

  console.log('Processing logout request', {
    headers: event.headers,
    hasAuthorization: !!(event.headers.Authorization || event.headers.authorization),
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId
  });

  const authService = new AuthenticationService();

  try {
    // Obtener el token de autorización
    const authHeader = event.headers.Authorization || event.headers.authorization;

    // Log directo a CloudWatch con información del header de autorización
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization header check',
      hasAuthHeader: !!authHeader,
      authHeaderType: typeof authHeader,
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    }));

    if (!authHeader) {
      logger.error('No authorization header provided');
      console.error('No authorization header provided');
      throw new AuthenticationError('No authorization token provided');
    }

    // Log detallado del header de autorización
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization header found',
      authHeaderLength: authHeader.length,
      authHeaderStartsWith: authHeader.substring(0, 20) + '...',
      authHeaderType: typeof authHeader,
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    }));

    logger.info('Authorization header found', {
      authHeaderLength: authHeader.length,
      authHeaderStartsWith: authHeader.substring(0, 20) + '...',
      authHeaderType: typeof authHeader,
      timestamp: new Date().toISOString()
    });

    console.log('Authorization header found', {
      authHeaderLength: authHeader.length,
      authHeaderStartsWith: authHeader.substring(0, 20) + '...',
      authHeaderType: typeof authHeader,
      timestamp: new Date().toISOString()
    });

    // Extraer el token del header
    let token = authHeader;

    // Verificar si el token comienza con 'Bearer ' y extraerlo
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Extraer el token después de 'Bearer '
    }

    // Log directo a CloudWatch con información del token extraído
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Token extracted from header',
      tokenLength: token.length,
      tokenStartsWith: token.substring(0, 20) + '...',
      isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    }));

    logger.info('Token extracted from header', {
      tokenLength: token.length,
      tokenStartsWith: token.substring(0, 20) + '...',
      isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
      timestamp: new Date().toISOString()
    });

    console.log('Token extracted from header', {
      tokenLength: token.length,
      tokenStartsWith: token.substring(0, 20) + '...',
      isBearerToken: typeof authHeader === 'string' && authHeader.startsWith('Bearer '),
      timestamp: new Date().toISOString()
    });

    // Ejecutar el logout
    logger.info('Executing logout');
    console.log('Executing logout');
    await authService.logout(token);
    logger.info('Logout executed successfully');
    console.log('Logout executed successfully');

    // Si estamos en producción, limpiar la cookie del refresh token
    const cookies = [];
    if (process.env.STAGE === 'prod') {
      cookies.push(
        'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
      );
      logger.info('Refresh token cookie cleared');
      console.log('Refresh token cookie cleared');
    }

    logger.info('Logout completed successfully');
    console.log('Logout completed successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies.length > 0 && { 'Set-Cookie': cookies.join(', ') })
      },
      body: JSON.stringify({
        success: true,
        message: 'Logout successful',
        data: null,
        errors: null
      })
    };

  } catch (error) {
    // Log directo a CloudWatch con información del error
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Error in logout handler',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    }));

    logger.error('Error in logout handler', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    });

    console.error('Error in logout handler', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    });

    // Si el error es de autenticación, devolver una respuesta con código 401
    if (error instanceof AuthenticationError) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          message: error.message || 'Authentication error',
          code: 'AUTHENTICATION_ERROR',
          data: null,
          errors: {
            auth: [error.message || 'Authentication error']
          }
        })
      };
    }

    // Para otros errores, propagar el error para que sea manejado por el middleware de manejo de errores
    throw error;
  } finally {
    // Log directo a CloudWatch para indicar que el proceso ha finalizado
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Logout process completed',
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    }));

    logger.info('Logout process completed', {
      timestamp: new Date().toISOString(),
      requestId: event.requestContext?.requestId
    });

    await authService.cleanup();
  }
};

// Exportar el handler con los middlewares de error y CORS
export const handler = withCors(withErrorHandling(logoutHandler));