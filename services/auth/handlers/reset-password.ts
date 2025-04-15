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

const resetPasswordHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing reset password request');

  const authService = new AuthenticationService();

  try {
    // El body ya está validado por el middleware
    const { email, password, confirmationCode } = JSON.parse(event.body!);

    // Restablecer contraseña
    await authService.resetPassword(email, password, confirmationCode);

    logger.info('Password reset successfully', { email });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Password reset successfully',
        data: null,
        errors: null
      })
    };

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
