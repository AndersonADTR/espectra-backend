// services/auth/handlers/refreshToken.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import { AuthenticationError, ValidationError } from '@shared/utils/errors';
import * as Joi from 'joi';

const logger = new Logger('RefreshTokenHandler');

// Schema de validación
const refreshTokenSchema = Joi.object({
  email: Joi.string()
    .required()
    .messages({
      'any.required': 'cognitoSub is required',
      'string.empty': 'cognitoSub cannot be empty'
    }),
  cognitoSub: Joi.string()
    .required()
    .messages({
      'any.required': 'cognitoSub is required',
      'string.empty': 'cognitoSub cannot be empty'
    }),  
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required',
      'string.empty': 'Refresh token cannot be empty'
    })
});

const refreshTokenHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing refresh token request');

  const authService = new AuthenticationService();
  
  try {

    const body = JSON.parse(event.body || '{}');
    const { refreshToken, cognitoSub, email } = body;

    if (!cognitoSub) {
      throw new ValidationError('cognitoSub is required');
    }

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    // En producción, obtener el refresh token de la cookie
    // if (process.env.STAGE === 'prod') {
    //   const cookies = event.headers.Cookie || event.headers.cookie;
    //   if (!cookies) {
    //     throw new AuthenticationError('No refresh token cookie found');
    //   }

    //   const refreshTokenCookie = cookies
    //     .split(';')
    //     .find(cookie => cookie.trim().startsWith('refresh_token='));

    //   if (!refreshTokenCookie) {
    //     throw new AuthenticationError('No refresh token cookie found');
    //   }

    //   refreshToken = refreshTokenCookie.split('=')[1].trim();
    // } else {
    //   // En desarrollo, obtener el refresh token del body
    //   refreshToken = body.refreshToken;
    // }

    console.log('Refresh token', {
      email: email,
      cognitoSub: cognitoSub,
      refreshToken: refreshToken
    });

    // Validar y refrescar los tokens
    const result = await authService.refreshTokens(email, cognitoSub, refreshToken);

    console.log('Token refresh successful', { result });

    // Configurar la cookie del nuevo refresh token en producción
    const cookies = [];
    if (process.env.STAGE === 'prod') {
      cookies.push(
        `refresh_token=${result.tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800` // 7 días
      );
    }

    console.log('Returning response', { tokens: result.tokens });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...(cookies.length > 0 && { 'Set-Cookie': cookies.join(', ') })
      },
      body: JSON.stringify({
        message: 'Token refresh successful',
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
  validateRequest(refreshTokenSchema)(
    refreshTokenHandler
  )
);