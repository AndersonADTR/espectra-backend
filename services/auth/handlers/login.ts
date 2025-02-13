// services/auth/handlers/login.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { LoginCredentials } from '../types/auth.types';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';
import { rateLimit, rateLimitPresets } from '@shared/middleware/rate-limit/rate-limit.middleware';

const logger = new Logger('LoginHandler');

// Schema de validación
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

const loginHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing login request');

  const authService = new AuthenticationService();
  
  try {
    // El body ya está validado por el middleware
    const loginData: LoginCredentials = JSON.parse(event.body!);

    // Intentar login
    const result = await authService.login(loginData);

    logger.info('Login successful', { 
      userId: result.user.userId,
      userType: result.user.userType
    });

    // Configurar cookie segura para el refresh token si estamos en producción
    const cookies = [];
    if (process.env.STAGE === 'prod') {
      cookies.push(
        `refresh_token=${result.tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` // 7 días
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
        message: 'Login successful',
        user: {
          userId: result.user.userId,
          email: result.user.email,
          name: result.user.name,
          userType: result.user.userType
        },
        tokens: {
          accessToken: result.tokens.accessToken,
          idToken: result.tokens.idToken,
          expiresIn: result.tokens.expiresIn,
          ...(process.env.STAGE !== 'prod' && { refreshToken: result.tokens.refreshToken })
        }
      })
    };

  } finally {
    await authService.cleanup();
  }
};

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  rateLimit(rateLimitPresets.strict)(
    validateRequest(loginSchema)(
      loginHandler
    )
  )
);