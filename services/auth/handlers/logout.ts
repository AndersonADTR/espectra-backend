// services/auth/handlers/logout.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import { AuthenticationError } from '@shared/utils/errors';

const logger = new Logger('LogoutHandler');

const logoutHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing logout request');

  const authService = new AuthenticationService();
  
  try {
    // Obtener el token de autorización
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      throw new AuthenticationError('No authorization token provided');
    }

    const token = authHeader.replace('Bearer ', '');

    // Ejecutar el logout
    await authService.logout(token);

    // Si estamos en producción, limpiar la cookie del refresh token
    const cookies = [];
    if (process.env.STAGE === 'prod') {
      cookies.push(
        'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/'
      );
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(cookies.length > 0 && { 'Set-Cookie': cookies.join(', ') })
      },
      body: JSON.stringify({
        message: 'Logout successful'
      })
    };

  } finally {
    await authService.cleanup();
  }
};

// Exportar el handler con el middleware de error
export const handler = withErrorHandling(logoutHandler);