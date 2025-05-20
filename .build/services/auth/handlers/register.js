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
exports.handler = exports.registerSchema = void 0;
const authentication_service_1 = require("../services/authentication.service");
const validation_middleware_1 = require("@shared/middleware/validation/validation.middleware");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger_1 = require("@shared/utils/logger");
const Joi = __importStar(require("joi"));
exports.registerSchema = Joi.object({
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
const logger = new logger_1.Logger('RegisterHandler');
const registerHandler = async (event) => {
    logger.info('Starting registration process');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const credentials = JSON.parse(event.body);
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
                success: true,
                message: 'User registered successfully',
                data: {
                    user: {
                        userId: user.userId,
                        email: user.email,
                        name: user.name,
                        userType: user.userType
                    }
                },
                errors: null
            })
        };
    }
    finally {
        await authService.cleanup();
    }
};
const rate_limit_middleware_1 = require("@shared/middleware/rate-limit/rate-limit.middleware");
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, rate_limit_middleware_1.rateLimit)(rate_limit_middleware_1.rateLimitPresets.strict)((0, validation_middleware_1.validateRequest)(exports.registerSchema)(registerHandler)));
//# sourceMappingURL=register.js.map