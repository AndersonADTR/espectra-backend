// services/auth/handlers/reset-password.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

// Schema de validación
const resetPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[\S]+$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
      'any.required': 'Password is required'
    }),
  confirmationCode: Joi.string()
    .required()
    .messages({
      'any.required': 'Confirmation code is required'
    })
});

const logger = new Logger('ResetPasswordHandler');

/**
 * Handler para el endpoint de restablecimiento de contraseña
 *
 * Este endpoint verifica el código de confirmación enviado al usuario y establece
 * la nueva contraseña.
 */
const resetPasswordHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing reset password request', {
    headers: event.headers,
    timestamp: new Date().toISOString()
  });

  console.log('Processing reset password request', {
    headers: event.headers,
    timestamp: new Date().toISOString()
  });

  const authService = new AuthenticationService();

  try {
    // El body ya está validado por el middleware
    const { email, password, confirmationCode } = JSON.parse(event.body!);

    logger.info('Parsed body before validation', {
      parsedBody: {
        email,
        password: '********', // No mostrar la contraseña completa por seguridad
        confirmationCodeLength: confirmationCode ? confirmationCode.length : 0,
        confirmationCodeMasked: confirmationCode ?
          confirmationCode.substring(0, 2) + '****' + confirmationCode.substring(confirmationCode.length - 2) : 'null'
      }
    });

    console.log('Parsed body before validation', {
      parsedBody: {
        email,
        password: '********', // No mostrar la contraseña completa por seguridad
        confirmationCodeLength: confirmationCode ? confirmationCode.length : 0,
        confirmationCodeMasked: confirmationCode ?
          confirmationCode.substring(0, 2) + '****' + confirmationCode.substring(confirmationCode.length - 2) : 'null'
      },
      timestamp: new Date().toISOString()
    });

    logger.info('Starting password reset process', { email });
    console.log('Starting password reset process', {
      email,
      timestamp: new Date().toISOString()
    });

    // Restablecer contraseña
    const result = await authService.resetPassword(email, password, confirmationCode);

    // Verificar si el método devolvió un resultado (caso de código expirado con nuevo código enviado)
    if (result && typeof result === 'object' && 'message' in result) {
      logger.info('Password reset process returned a message', {
        email,
        message: result.message
      });

      console.log('Password reset process returned a message', {
        email,
        message: result.message,
        timestamp: new Date().toISOString()
      });

      // Devolver un mensaje informativo al cliente
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
          'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify({
          success: false,
          message: result.message,
          code: 'CODE_EXPIRED_NEW_CODE_SENT',
          data: {
            email,
            newCodeSent: true,
            expirationTime: '1 hour'
          },
          errors: null
        })
      };
    }

    logger.info('Password reset successfully', { email });
    console.log('Password reset successfully', {
      email,
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
        message: 'Password reset successfully',
        data: {
          email,
          canLogin: true,
          message: 'You can now login with your new password'
        },
        errors: null
      })
    };

  } catch (error) {
    logger.error('Error confirming password reset', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    // Propagar el error para que sea manejado por el middleware de manejo de errores
    throw error;

  } finally {
    await authService.cleanup();
  }
};

// Importar el middleware de rate limit
import { rateLimit, rateLimitPresets } from '@shared/middleware/rate-limit/rate-limit.middleware';

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  rateLimit(rateLimitPresets.strict)(
    validateRequest(resetPasswordSchema)(
      resetPasswordHandler
    )
  )
);
