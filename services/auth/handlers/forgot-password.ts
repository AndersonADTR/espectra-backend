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

    // Solicitar recuperación de contraseña
    await authService.forgotPassword(email);

    logger.info('Password reset requested successfully', { email });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Password reset instructions sent to your email',
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
    validateRequest(forgotPasswordSchema)(
      forgotPasswordHandler
    )
  )
);
