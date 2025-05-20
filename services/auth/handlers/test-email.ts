// services/auth/handlers/test-email.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { EmailService } from '@shared/services/email/email.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { Logger } from '@shared/utils/logger';
import * as Joi from 'joi';

// Schema de validación
const testEmailSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Invalid email format',
      'any.required': 'Email is required'
    })
});

const logger = new Logger('TestEmailHandler');

const testEmailHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Processing test email request');

  try {
    // El body ya está validado por el middleware
    const { email } = JSON.parse(event.body!);

    logger.info('Test email request received', { email });

    // Agregar logs detallados para depuración
    logger.info('Starting test email process', { 
      email,
      environment: process.env.NODE_ENV,
      region: process.env.REGION,
      sesFromEmail: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co'
    });
    
    try {
      // Enviar correo de prueba
      const emailService = EmailService.getInstance();
      const messageId = await emailService.sendEmail({
        to: email,
        subject: 'Test Email from SPECTRUM Platform',
        text: 'This is a test email from the SPECTRUM platform.',
        html: `
          <html>
            <body>
              <h1>Test Email from SPECTRUM</h1>
              <p>This is a test email from the SPECTRUM platform.</p>
              <p>If you received this email, it means that SES is correctly configured.</p>
              <p>Time sent: ${new Date().toISOString()}</p>
            </body>
          </html>
        `
      });

      logger.info('Test email sent successfully', { email, messageId });

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
          message: 'Test email sent successfully',
          data: { messageId },
          errors: null
        })
      };
    } catch (serviceError) {
      logger.error('Error sending test email', {
        error: serviceError,
        email,
        errorName: serviceError instanceof Error ? serviceError.name : 'Unknown',
        errorMessage: serviceError instanceof Error ? serviceError.message : String(serviceError),
        stack: serviceError instanceof Error ? serviceError.stack : 'No stack trace'
      });

      // Manejar errores específicos
      if (serviceError instanceof Error) {
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
          message: 'An error occurred while sending the test email',
          data: null,
          errors: {
            server: ['Unable to send test email. Please try again later.'],
            details: process.env.NODE_ENV === 'dev' ? (serviceError instanceof Error ? serviceError.message : String(serviceError)) : 'Internal server error'
          }
        })
      };
    }
  } catch (error) {
    logger.error('Unexpected error in test email handler', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });

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
        message: 'An unexpected error occurred',
        data: null,
        errors: {
          server: ['An unexpected error occurred while processing your request.'],
          details: process.env.NODE_ENV === 'dev' ? (error instanceof Error ? error.message : String(error)) : 'Internal server error'
        }
      })
    };
  }
};

// Importar el middleware de rate limit
import { rateLimit, rateLimitPresets } from '@shared/middleware/rate-limit/rate-limit.middleware';

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  rateLimit(rateLimitPresets.strict)(
    validateRequest(testEmailSchema)(
      testEmailHandler
    )
  )
);
