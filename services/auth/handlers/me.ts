// services/auth/handlers/me.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { withAuth } from '@shared/middleware/auth/auth.middleware';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('MeHandler');

const meHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing me request');

  const authService = new AuthenticationService();

  try {
    // El usuario ya está autenticado por el middleware withAuth
    // y está disponible en event.requestContext.authorizer.user
    const user = event.requestContext?.authorizer?.user;

    if (!user) {
      throw new Error('User not found in request context');
    }

    logger.info('User information retrieved', {
      userId: user.userId,
      userType: user.userType
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'User information retrieved successfully',
        data: {
          user: {
            userId: user.userId,
            email: user.email,
            name: user.name,
            userType: user.userType,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin
          }
        },
        errors: null
      })
    };

  } finally {
    await authService.cleanup();
  }
};

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  withAuth(
    meHandler
  )
);
