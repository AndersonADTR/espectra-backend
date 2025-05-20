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
const errors_1 = require("@shared/utils/errors");
const Joi = __importStar(require("joi"));
const logger = new logger_1.Logger('RefreshTokenHandler');
const refreshTokenSchema = Joi.object({
    userSub: Joi.string()
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
const refreshTokenHandler = async (event) => {
    logger.info('Processing refresh token request');
    const authService = new authentication_service_1.AuthenticationService();
    try {
        let refreshToken;
        let userSub;
        if (process.env.STAGE === 'prod') {
            const cookies = event.headers.Cookie || event.headers.cookie;
            if (!cookies) {
                throw new errors_1.AuthenticationError('No refresh token cookie found');
            }
            const userSubCookie = cookies
                .split(';')
                .find(cookie => cookie.trim().startsWith('user_sub='));
            const refreshTokenCookie = cookies
                .split(';')
                .find(cookie => cookie.trim().startsWith('refresh_token='));
            if (!refreshTokenCookie || !userSubCookie) {
                throw new errors_1.AuthenticationError('No refresh token cookie found');
            }
            userSub = userSubCookie.split('=')[1].trim();
            refreshToken = refreshTokenCookie.split('=')[1].trim();
        }
        else {
            const body = JSON.parse(event.body || '{}');
            userSub = body.userSub;
            refreshToken = body.refreshToken;
        }
        console.log('Refresh token', {
            userSub: userSub,
            refreshToken: refreshToken
        });
        const result = await authService.refreshTokens(userSub, refreshToken);
        console.info('Token refresh successful', { result });
        const cookies = [];
        if (process.env.STAGE === 'prod') {
            cookies.push(`user_sub=${result.user.userSub}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
            cookies.push(`refresh_token=${result.tokens.refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
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
                success: true,
                message: 'Token refresh successful',
                data: {
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
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, validation_middleware_1.validateRequest)(refreshTokenSchema)(refreshTokenHandler));
//# sourceMappingURL=refreshToken.js.map