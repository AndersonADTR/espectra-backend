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
const Joi = __importStar(require("joi"));
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
const loginHandler = async (event) => {
    console.log('Processing login request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        const loginData = JSON.parse(event.body);
        const result = await authService.login(loginData);
        console.log('Login successful', {
            userId: result.user.userId,
            userType: result.user.userType
        });
        const cookies = [];
        if (process.env.STAGE === 'prod') {
            cookies.push(`user_sub=${result.user.userSub}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
            cookies.push(`refresh_token=${result.tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                ...(cookies.length > 0 && { 'Set-Cookie': cookies.join(', ') })
            },
            body: JSON.stringify({
                success: true,
                message: 'Login successful',
                data: {
                    user: {
                        userId: result.user.userId,
                        userSub: result.user.userSub,
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
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, rate_limit_middleware_1.rateLimit)(rate_limit_middleware_1.rateLimitPresets.strict)((0, validation_middleware_1.validateRequest)(loginSchema)(loginHandler)));
//# sourceMappingURL=login.js.map