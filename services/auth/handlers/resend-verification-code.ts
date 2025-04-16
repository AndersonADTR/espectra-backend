// services/auth/handlers/resend-verification-code.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

// Schema de validación
const resendVerificationCodeSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    })
});

const logger = new Logger('ResendVerificationCodeHandler');

const resendVerificationCodeHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing resend verification code request');

  const authService = new AuthenticationService();

  try {
    // El body ya está validado por el middleware
    const { email } = JSON.parse(event.body!);

    logger.info('Resend verification code request received', { email });

    // Agregar logs detallados para depuración
    logger.info('Starting resend verification code process', { 
      email,
      environment: process.env.NODE_ENV,
      region: process.env.REGION,
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.COGNITO_CLIENT_ID
    });

    // Reenviar código de verificación
    await authService.resendVerificationCode(email);

    logger.info('Verification code resent successfully', { email });

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
        message: 'Verification code resent successfully. Please check your email.',
        data: null,
        errors: null
      })
    };

  } catch (error) {
    logger.error('Error resending verification code', { 
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
    validateRequest(resendVerificationCodeSchema)(
      resendVerificationCodeHandler
    )
  )
);
