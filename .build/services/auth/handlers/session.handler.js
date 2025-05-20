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
exports.terminateSession = exports.extendSession = exports.createSession = void 0;
const session_service_1 = require("../services/session.service");
const validation_middleware_1 = require("@shared/middleware/validation/validation.middleware");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const security_middleware_1 = require("@shared/middleware/security/security.middleware");
const Joi = __importStar(require("joi"));
const createSessionSchema = Joi.object({
    userId: Joi.string().required(),
    metadata: Joi.object().optional()
});
const sessionService = new session_service_1.SessionService();
exports.createSession = security_middleware_1.SecurityMiddleware.secure({
    requireAuth: true
})((0, validation_middleware_1.validateRequest)(createSessionSchema)((0, error_handling_middleware_1.withErrorHandling)(async (event) => {
    const data = JSON.parse(event.body);
    const session = await sessionService.createSession(data.userId, data.metadata);
    return {
        statusCode: 201,
        body: JSON.stringify(session)
    };
})));
exports.extendSession = security_middleware_1.SecurityMiddleware.secure({
    requireAuth: true
})((0, error_handling_middleware_1.withErrorHandling)(async (event) => {
    const sessionId = event.pathParameters?.sessionId;
    const session = await sessionService.extendSession(sessionId);
    return {
        statusCode: 200,
        body: JSON.stringify(session)
    };
}));
exports.terminateSession = security_middleware_1.SecurityMiddleware.secure({
    requireAuth: true
})((0, error_handling_middleware_1.withErrorHandling)(async (event) => {
    const sessionId = event.pathParameters?.sessionId;
    await sessionService.terminateSession(sessionId);
    return {
        statusCode: 204,
        body: ''
    };
}));
//# sourceMappingURL=session.handler.js.map