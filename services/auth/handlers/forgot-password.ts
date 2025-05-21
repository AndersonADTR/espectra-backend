// services/auth/handlers/forgot-password.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

// Schema de validación
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    })
});

const logger = new Logger('ForgotPasswordHandler');

const forgotPasswordHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing forgot password request');

  const authService = new AuthenticationService();

  try {
    // El body ya está validado por el middleware
    const { email } = JSON.parse(event.body!);

    logger.info('Forgot password request received', { email });

    // Agregar logs detallados para depuración
    logger.info('Starting forgot password process', {
      email,
      environment: process.env.NODE_ENV,
      region: process.env.REGION,
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.COGNITO_CLIENT_ID
    });

    try {
      // Solicitar recuperación de contraseña
      const deliveryDetails = await authService.forgotPassword(email);

      logger.info('Password reset requested successfully', {
        email,
        deliveryDetails
      });

      console.log('Password reset requested successfully', {
        email,
        deliveryDetails,
        timestamp: new Date().toISOString()
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify({
          success: true,
          message: 'Password reset instructions sent to your email',
          data: {
            destination: deliveryDetails?.destination || 'your email',
            deliveryMedium: deliveryDetails?.deliveryMedium || 'EMAIL',
            message: 'Please check your email for a 6-digit verification code'
          },
          errors: null
        })
      };
    } catch (serviceError) {
      logger.error('Error in forgot password service', {
        error: serviceError,
        email,
        errorName: serviceError instanceof Error ? serviceError.name : 'Unknown',
        errorMessage: serviceError instanceof Error ? serviceError.message : String(serviceError),
        stack: serviceError instanceof Error ? serviceError.stack : 'No stack trace'
      });

      // Manejar errores específicos
      if (serviceError instanceof Error) {
        // Error de configuración de SES
        if (serviceError.message.includes('Email delivery configuration error')) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
              'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
            },
            body: JSON.stringify({
              success: false,
              message: 'Unable to send email at this time',
              data: null,
              errors: {
                email: ['Email delivery service is currently unavailable. Please try again later.'],
                details: serviceError.message
              }
            })
          };
        }

        // Error de verificación de email
        if (serviceError.message.includes('not verified') ||
            serviceError.message.includes('identity') ||
            serviceError.message.includes('verification')) {
          return {
            statusCode: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
              'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
            },
            body: JSON.stringify({
              success: false,
              message: 'Email verification issue',
              data: null,
              errors: {
                email: ['The email address is not verified in our system. Please contact support.'],
                details: serviceError.message
              }
            })
          };
        }
      }

      // Para otros errores, devolver un mensaje genérico con detalles para depuración
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify({
          success: false,
          message: 'An error occurred while processing your request',
          data: null,
          errors: {
            server: ['Unable to process password reset request. Please try again later.'],
            details: process.env.NODE_ENV === 'dev' ? (serviceError instanceof Error ? serviceError.message : String(serviceError)) : 'Internal server error'
          }
        })
      };
    }
  } finally {
    await authService.cleanup();
  }
};

// Importar el middleware de rate limit
import { rateLimit, rateLimitPresets } from '@shared/middleware/rate-limit/rate-limit.middleware';

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  rateLimit(rateLimitPresets.strict)(
    validateRequest(forgotPasswordSchema)(
      forgotPasswordHandler
    )
  )
);
