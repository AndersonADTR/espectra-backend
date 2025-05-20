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
const Joi = __importStar(require("joi"));
const validation_middleware_1 = require("@shared/middleware/validation/validation.middleware");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const googleSheets_service_1 = require("../services/googleSheets.service");
const contactRequest_model_1 = require("../models/contactRequest.model");
const observability_service_1 = require("@shared/services/observability/observability.service");
const contactRequestSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name must not exceed 100 characters',
        'any.required': 'Name is required'
    }),
    email: Joi.string()
        .email()
        .required()
        .messages({
        'string.email': 'Invalid email format',
        'any.required': 'Email is required'
    }),
    phoneNumber: Joi.string()
        .pattern(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
        .required()
        .messages({
        'string.pattern.base': 'Invalid phone number format',
        'any.required': 'Phone number is required'
    }),
    metadata: Joi.object()
        .optional()
});
const contactRequestHandler = async (event) => {
    console.info('Processing contact request');
    try {
        const sheetsService = googleSheets_service_1.GoogleSheetsService.getInstance();
        await sheetsService.validateSheet();
        const requestData = JSON.parse(event.body);
        const contactRequest = new contactRequest_model_1.ContactRequestModel(requestData);
        await sheetsService.appendRow(contactRequest.toGoogleSheetsRow());
        const observability = observability_service_1.ObservabilityService.getInstance();
        await observability.trackAuthEvent('ContactRequestSubmitted', {
            email: requestData.email
        });
        console.info('Contact request processed successfully', {
            requestId: contactRequest.requestId
        });
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Contact request submitted successfully. Our team will contact you soon.',
                requestId: contactRequest.requestId,
                status: contactRequest.status,
                timestamp: contactRequest.createdAt
            })
        };
    }
    catch (error) {
        console.error('Error processing contact request', { error });
        throw error;
    }
};
exports.handler = (0, error_handling_middleware_1.withErrorHandling)((0, validation_middleware_1.validateRequest)(contactRequestSchema)(contactRequestHandler));
//# sourceMappingURL=contactRequest.js.map