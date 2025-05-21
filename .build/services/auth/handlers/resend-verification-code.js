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
const resendVerificationCodeSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
        'string.email': 'Invalid email format',
        'any.required': 'Email is required'
    })
});
const logger = new logger_1.Logger('ResendVerificationCodeHandler');
const resendVerificationCodeHandler = async (event) => {
    logger.info('Processing resend verification code request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const { email } = JSON.parse(event.body);
        logger.info('Resend verification code request received', { email });
        logger.info('Starting resend verification code process', {
            email,
            environment: process.env.NODE_ENV,
            region: process.env.REGION,
            cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID,
            cognitoClientId: process.env.COGNITO_CLIENT_ID
        });
        const deliveryDetails = await authService.resendVerificationCode(email);
        logger.info('Verification code resent successfully', {
            email,
            deliveryDetails
        });
        if (deliveryDetails.userStatus === 'CONFIRMED') {
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
                    message: 'Your email is already verified. You can proceed to login.',
                    data: {
                        userStatus: 'CONFIRMED',
                        nextStep: 'You can now log in with your credentials using the /auth/login endpoint'
                    },
                    errors: null
                })
            };
        }
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
                data: {
                    destination: deliveryDetails.destination || email,
                    deliveryMedium: deliveryDetails.deliveryMedium || 'EMAIL',
                    nextStep: 'Use the code sent to your email with the /auth/verify-email endpoint to confirm your account'
                },
                errors: null
            })
        };
    }
    catch (error) {
        logger.error('Error resending verification code', {
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
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, rate_limit_middleware_1.rateLimit)(rate_limit_middleware_1.rateLimitPresets.strict)((0, validation_middleware_1.validateRequest)(resendVerificationCodeSchema)(resendVerificationCodeHandler)));
//# sourceMappingURL=resend-verification-code.js.map