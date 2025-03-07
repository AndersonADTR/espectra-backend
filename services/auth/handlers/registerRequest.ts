// services/registration/handlers/registerToSheetAndDynamo.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { google } from 'googleapis';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import * as Joi from 'joi';
import { Logger } from '@shared/utils/logger';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const logger = new Logger('RegisterToSheetAndDynamoHandler');

// Schema de validación para el registro
const registerSchema = Joi.object({
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
        .min(7)
        .max(15)
        .required()
        .messages({
        'string.min': 'Phone number must be at least 7 characters long',
        'string.max': 'Phone number must not exceed 15 characters',
        'any.required': 'Phone number is required'
        })
});

// SSM Client
const ssmClient = new SSMClient({ region: process.env.REGION || 'us-east-1' });

// Clientes de AWS
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION || 'us-east-1' });

// Variables de entorno
const REGISTRATION_REQUESTS_TABLE = process.env.REGISTRATION_REQUESTS_TABLE;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME;

async function getGoogleCredentials() {
    try {
      const response = await ssmClient.send(
        new GetParameterCommand({
          Name: '/espectra/dev/google-services-credentials',
          WithDecryption: true
        })
      );
      return JSON.parse(response.Parameter?.Value || '{}');
    } catch (error) {
      console.error('Error getting Google credentials:', error);
      throw error;
    }
}

const registerToSheetAndDynamoHandler: APIGatewayProxyHandler = async (event) => {
  logger.info('Starting registration process');

  try {
    // Validar el body del evento
    const body = JSON.parse(event.body || '{}');
    const { error } = registerSchema.validate(body);
    if (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.details[0].message })
      };
    }

    const { email, name, phoneNumber } = body;

    // Guardar en DynamoDB
    const dynamoParams = {
      TableName: REGISTRATION_REQUESTS_TABLE,
      Item: {
        email: { S: email }, // Usamos el email como userId
        name: { S: name },
        phoneNumber: { S: phoneNumber },
        createdAt: { S: new Date().toISOString() }
      }
    };

    await dynamoDbClient.send(new PutItemCommand(dynamoParams));
    console.log('Registration data saved to DynamoDB');

    const googleCredentials = await getGoogleCredentials();

    // Configurar Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: googleCredentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Escribir en Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`, // Ajusta el rango según tus columnas
      valueInputOption: 'RAW',
      requestBody: {
        values: [[email, name, phoneNumber]]
      }
    });

    console.log('Registration data written to Google Sheets');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Registration successful' })
    };

  } catch (error) {
    console.log('Error during registration:', (error as Error));
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' })
    };
  }
};

// Exportar el handler con los middlewares aplicados
export const handler = withErrorHandling(
  validateRequest(registerSchema)(
    registerToSheetAndDynamoHandler
));
