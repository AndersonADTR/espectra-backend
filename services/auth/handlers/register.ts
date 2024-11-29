// services/auth/handlers/register.ts
import { 
  CognitoIdentityProviderClient, 
  SignUpCommand, 
  AdminConfirmSignUpCommand,
  UsernameExistsException,
  InvalidPasswordException
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';

// Interfaces
interface UserRegistrationData {
  email: string;
  password: string;
  name: string;
  userType?: string;
}

// Inicialización de clientes
const cognito = new CognitoIdentityProviderClient({
  region: process.env.REGION || 'us-east-1',
  maxAttempts: 3
});

const ddbClient = new DynamoDBClient({
  region: process.env.REGION || 'us-east-1',
  maxAttempts: 3
});

const dynamodb = DynamoDBDocumentClient.from(ddbClient);

// Validaciones
const validateInput = (data: UserRegistrationData) => {
  const errors: string[] = [];

  if (!data.email) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }

  if (!data.password) {
    errors.push('Password is required');
  } else if (data.password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!data.name) {
    errors.push('Name is required');
  } else if (data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters long');
  }

  return errors;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Register handler started - Request received');

  try {
    // Validar existencia del body
    if (!event.body) {
      console.log('Error: Missing request body');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          message: 'Missing request body' 
        })
      };
    }

    // Parsear y validar datos
    let userData: UserRegistrationData;
    try {
      userData = JSON.parse(event.body);
      console.log('Request body parsed successfully');
    } catch (e) {
      console.error('Error parsing request body:', e);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          message: 'Invalid JSON in request body' 
        })
      };
    }

    // Validar campos
    const validationErrors = validateInput(userData);
    if (validationErrors.length > 0) {
      console.log('Validation errors:', validationErrors);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          message: 'Validation failed',
          errors: validationErrors
        })
      };
    }

    // Verificar variables de entorno requeridas
    if (!process.env.COGNITO_CLIENT_ID || !process.env.COGNITO_USER_POOL_ID) {
      console.error('Missing required environment variables');
      throw new Error('Missing required environment configuration');
    }

    console.log('Starting Cognito registration process');
    
    // Registrar en Cognito
    try {
      await cognito.send(new SignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: userData.email,
        Password: userData.password,
        UserAttributes: [
          { Name: 'email', Value: userData.email },
          { Name: 'name', Value: userData.name }
        ]
      }));
      console.log('Cognito registration successful');

      // Auto-confirmar usuario en ambiente de desarrollo
      if (process.env.STAGE === 'dev') {
        console.log('Auto-confirming user in dev environment');
        await cognito.send(new AdminConfirmSignUpCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: userData.email
        }));
        console.log('User auto-confirmed successfully');
      }
    } catch (error) {
      console.error('Cognito registration error:', error);
      
      if (error instanceof UsernameExistsException) {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: 'Email already registered'
          })
        };
      }

      if (error instanceof InvalidPasswordException) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            message: 'Password does not meet requirements'
          })
        };
      }

      throw error;
    }

    // Guardar en DynamoDB
    console.log('Starting DynamoDB registration');
    const userId = uuidv4();
    const timestamp = new Date().toISOString();

    try {
      await dynamodb.send(new PutCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
        Item: {
          userId,
          email: userData.email,
          name: userData.name,
          userType: userData.userType || '',
          createdAt: timestamp,
          updatedAt: timestamp
        }
      }));
      console.log('User data saved to DynamoDB successfully');
    } catch (error) {
      console.error('DynamoDB error:', error);
      // Si falla DynamoDB, el usuario ya está en Cognito, 
      // en un sistema más robusto deberíamos implementar un rollback
      throw new Error('Failed to save user data');
    }

    // Respuesta exitosa
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'User registered successfully',
        userId,
        email: userData.email
      })
    };

  } catch (error) {
    console.error('Unhandled error in registration process:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error registering user',
        error: process.env.STAGE === 'dev' ? {
          message: (error as any).message,
          code: (error as any).code
        } : 'Internal server error'
      })
    };
  }
};