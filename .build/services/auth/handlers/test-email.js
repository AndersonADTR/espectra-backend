"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const email_service_1 = require("@shared/services/email/email.service");
const validation_middleware_1 = require("@shared/middleware/validation/validation.middleware");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const Joi = __importStar(require("joi"));
const testEmailSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
        'string.email': 'Invalid email format',
        'any.required': 'Email is required'
    }),
    type: Joi.string()
        .valid('verification', 'reset', 'test')
        .default('test')
        .messages({
        'any.only': 'Type must be one of: verification, reset, test'
    })
});
const logger = new logger_1.Logger('TestEmailHandler');
const testEmailHandler = async (event) => {
    logger.info('Processing test email request');
    try {
        const { email, type = 'test' } = JSON.parse(event.body);
        logger.info('Test email request received', { email, type });
        logger.info('Starting test email process', {
            email,
            type,
            environment: process.env.NODE_ENV,
            region: process.env.REGION,
            sesFromEmail: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co'
        });
        try {
            const testCode = Math.floor(100000 + Math.random() * 900000).toString();
            const emailService = email_service_1.EmailService.getInstance();
            let messageId;
            switch (type) {
                case 'verification':
                    messageId = await emailService.sendVerificationEmail(email, testCode);
                    logger.info('Verification test email sent', { email, messageId, testCode });
                    break;
                case 'reset':
                    messageId = await emailService.sendPasswordResetEmail(email, testCode);
                    logger.info('Password reset test email sent', { email, messageId, testCode });
                    break;
                case 'test':
                default:
                    messageId = await emailService.sendEmail({
                        to: email,
                        subject: 'SPECTRUM Platform - Test Email',
                        text: `This is a test email from SPECTRUM Platform.\nTest code: ${testCode}`,
                        html: `
              <html>
                <head>
                  <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
                    .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
                    .code { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>SPECTRUM Platform</h1>
                    </div>
                    <div class="content">
                      <p>This is a test email from SPECTRUM Platform.</p>
                      <p>If you received this email, it means that the email delivery system is working correctly.</p>
                      <div class="code">Test Code: ${testCode}</div>
                      <p>This code is for testing purposes only and is not valid for any actual verification or password reset.</p>
                      <p>Time sent: ${new Date().toISOString()}</p>
                    </div>
                    <div class="footer">
                      <p>This is an automated message, please do not reply to this email.</p>
                      <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. All rights reserved.</p>
                    </div>
                  </div>
                </body>
              </html>
            `
                    });
                    logger.info('General test email sent', { email, messageId, testCode });
                    break;
            }
            logger.info('Test email sent successfully', { email, type, messageId, testCode });
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
                    message: `Test email of type '${type}' sent successfully to ${email}. Please check your inbox (and spam folder).`,
                    data: {
                        email,
                        type,
                        messageId,
                        testCode,
                        sentAt: new Date().toISOString()
                    },
                    errors: null
                })
            };
        }
        catch (serviceError) {
            logger.error('Error sending test email', {
                error: serviceError,
                email,
                errorName: serviceError instanceof Error ? serviceError.name : 'Unknown',
                errorMessage: serviceError instanceof Error ? serviceError.message : String(serviceError),
                stack: serviceError instanceof Error ? serviceError.stack : 'No stack trace'
            });
            if (serviceError instanceof Error) {
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
    }
    catch (error) {
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
const rate_limit_middleware_1 = require("@shared/middleware/rate-limit/rate-limit.middleware");
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, rate_limit_middleware_1.rateLimit)(rate_limit_middleware_1.rateLimitPresets.strict)((0, validation_middleware_1.validateRequest)(testEmailSchema)(testEmailHandler)));
//# sourceMappingURL=test-email.js.map