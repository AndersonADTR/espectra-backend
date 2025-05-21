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
const authentication_service_1 = require("../services/authentication.service");
const validation_middleware_1 = require("@shared/middleware/validation/validation.middleware");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const Joi = __importStar(require("joi"));
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
const logger = new logger_1.Logger('ResetPasswordHandler');
const resetPasswordHandler = async (event) => {
    logger.info('Processing reset password request', {
        headers: event.headers,
        timestamp: new Date().toISOString()
    });
    console.log('Processing reset password request', {
        headers: event.headers,
        timestamp: new Date().toISOString()
    });
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const { email, password, confirmationCode } = JSON.parse(event.body);
        logger.info('Parsed body before validation', {
            parsedBody: {
                email,
                password: '********',
                confirmationCodeLength: confirmationCode ? confirmationCode.length : 0,
                confirmationCodeMasked: confirmationCode ?
                    confirmationCode.substring(0, 2) + '****' + confirmationCode.substring(confirmationCode.length - 2) : 'null'
            }
        });
        console.log('Parsed body before validation', {
            parsedBody: {
                email,
                password: '********',
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
        const result = await authService.resetPassword(email, password, confirmationCode);
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
            const deliveryDetails = result.deliveryDetails || { destination: email, deliveryMedium: 'EMAIL' };
            console.log('IMPORTANT INFORMATION FOR THE CLIENT:');
            console.log('1. The old code has expired and a new code has been sent');
            console.log('2. The client should check their email for the new code');
            console.log('3. The client should try again with the new code');
            console.log('4. The new code is valid for approximately 1 hour');
            console.log('5. The new code has been sent to: ' + (deliveryDetails.destination || email));
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
                        expirationTime: '1 hour',
                        destination: deliveryDetails.destination || email,
                        deliveryMedium: deliveryDetails.deliveryMedium || 'EMAIL',
                        instructions: 'Please check your email for a new 6-digit verification code and try again with the new code.',
                        codeFormat: '6 digits (e.g., 123456)'
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
    }
    catch (error) {
        logger.error('Error confirming password reset', {
            error,
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
    finally {
        await authService.cleanup();
    }
};
const rate_limit_middleware_1 = require("@shared/middleware/rate-limit/rate-limit.middleware");
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, rate_limit_middleware_1.rateLimit)(rate_limit_middleware_1.rateLimitPresets.strict)((0, validation_middleware_1.validateRequest)(resetPasswordSchema)(resetPasswordHandler)));
//# sourceMappingURL=reset-password.js.map