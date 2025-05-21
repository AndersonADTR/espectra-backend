// services/auth/handlers/verify-email.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

// Schema de validación
const verifyEmailSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'Verification code is required'
    })
});

const logger = new Logger('VerifyEmailHandler');

const verifyEmailHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing email verification request');

  const authService = new AuthenticationService();

  try {
    // El body ya está validado por el middleware
    const { email, code } = JSON.parse(event.body!);

    // Agregar logs detallados para depuración
    logger.info('Starting email verification process', {
      email,
      codeLength: code.length,
      codeMasked: code.substring(0, 2) + '****' + code.substring(code.length - 2),
      environment: process.env.NODE_ENV,
      region: process.env.REGION,
      cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
      cognitoClientId: process.env.COGNITO_CLIENT_ID
    });

    // Verificar email
    await authService.verifyEmail(email, code);

    logger.info('Email verified successfully', { email });

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
        message: 'Email verified successfully. Your account is now active.',
        data: {
          email: email,
          status: 'ACTIVE',
          nextStep: 'You can now log in with your credentials using the /auth/login endpoint'
        },
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
    validateRequest(verifyEmailSchema)(
      verifyEmailHandler
    )
  )
);
