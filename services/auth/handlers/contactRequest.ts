// services/auth/handlers/contactRequest.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import * as Joi from 'joi';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { GoogleSheetsService } from '../services/googleSheets.service';
import { ContactRequestModel } from '../models/contactRequest.model';
import { ContactRequestData } from '../types/contactRequest.types';
import { ObservabilityService } from '@shared/services/observability/observability.service';

// Schema de validación
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

const contactRequestHandler: APIGatewayProxyHandler = async (event) => {
  console.info('Processing contact request');

  try {
    // Preparar servicio de Google Sheets
    const sheetsService = GoogleSheetsService.getInstance();
    await sheetsService.validateSheet();

    // Obtener datos de la solicitud (ya validados por el middleware)
    const requestData: ContactRequestData = JSON.parse(event.body!);
    
    // Crear modelo de solicitud
    const contactRequest = new ContactRequestModel(requestData);
    
    // Guardar en Google Sheets
    await sheetsService.appendRow(contactRequest.toGoogleSheetsRow());
    
    // Registrar métrica
    const observability = ObservabilityService.getInstance();
    await observability.trackAuthEvent('ContactRequestSubmitted', {
      email: requestData.email
    });
    
    console.info('Contact request processed successfully', { 
      requestId: contactRequest.requestId
    });

    // Devolver respuesta
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
  } catch (error) {
    console.error('Error processing contact request', { error });
    
    // El middleware de manejo de errores se encargará de formatear la respuesta
    throw error;
  }
};

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  validateRequest(contactRequestSchema)(
    contactRequestHandler
  )
);