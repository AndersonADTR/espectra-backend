import { APIGatewayProxyHandler } from 'aws-lambda';
import { AuthenticationService } from '../services/authentication.service';
import { RegisterCredentials } from '../types/auth.types';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

export const registerSchema = Joi.object({
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
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 100 characters',
      'any.required': 'Name is required'
    }),
  phoneNumber: Joi.string()
    .min(7)
    .max(15)
    .required()
    .messages({
      'string.min': 'Name must be at least 7 characters long',
      'string.max': 'Name must not exceed 12 characters',
      'any.required': 'phoneNumber is required'
    }),
  userType: Joi.string()
    .valid('basic', 'creator', 'admin')
    .default('basic'),
  language: Joi.string()
    .valid('es', 'en')
    .default('es')
});

const logger = new Logger('RegisterHandler');

const registerHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Starting registration process');

  const authService = new AuthenticationService();
  
  try {
    // El evento ya viene con el body validado por el middleware
    const credentials = JSON.parse(event.body!) as RegisterCredentials;

    // Registrar usuario
    const user = await authService.registerUser(credentials);

    logger.info('User registered successfully', { 
      email: credentials.email,
      userType: credentials.userType 
    });

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'User registered successfully',
        user: {
          userId: user.userId,
          email: user.email,
          name: user.name,
          userType: user.userType
        }
      })
    };

  } finally {
    await authService.cleanup();
  }
};

// Aquí es donde se aplica la validación mediante el middleware
export const handler = withErrorHandling(
  validateRequest(registerSchema)(
    registerHandler
  )
);