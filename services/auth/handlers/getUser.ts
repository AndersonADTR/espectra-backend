// services/auth/handlers/getUser.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('GetUserHandler');

const getUserHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing get user request');

  const authService = new AuthenticationService();

  try {
    // Validar userId
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          message: 'Missing userId parameter',
          data: null,
          errors: {
            userId: ['User ID is required']
          }
        })
      };
    }

    logger.info(`Fetching user data for userId: ${userId}`);

    // Obtener el usuario usando el servicio de autenticación
    const user = await authService.getUserById(userId);

    // Verificar si el usuario existe
    if (!user) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          message: 'User not found',
          data: null,
          errors: {
            userId: ['User with the specified ID was not found']
          }
        })
      };
    }

    // Devolver datos del usuario
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'User retrieved successfully',
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

// Exportar el handler con el middleware de error
export const handler = withErrorHandling(getUserHandler);