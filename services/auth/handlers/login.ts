// services/auth/handlers/login.ts
import { 
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  NotAuthorizedException,
  UserNotFoundException
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from 'aws-lambda';

// Configuración básica del cliente Cognito
const cognito = new CognitoIdentityProviderClient({
  region: process.env.REGION || 'us-east-1'
});

// Interfaz para los datos de login
interface LoginRequest {
  email: string;
  password: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Login handler started');

  try {
    // Validar que existe el body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    // Parsear los datos de login
    const loginData: LoginRequest = JSON.parse(event.body);
    console.log('Processing login request');

    // Validar campos requeridos
    if (!loginData.email || !loginData.password) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Email and password are required' })
      };
    }

    // Verificar que tenemos el Client ID de Cognito
    if (!process.env.COGNITO_CLIENT_ID) {
      console.error('Missing COGNITO_CLIENT_ID environment variable');
      throw new Error('Configuration error');
    }

    // Intentar la autenticación
    const response = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: loginData.email,
        PASSWORD: loginData.password
      }
    }));

    console.log('Authentication successful');

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Login successful',
        tokens: {
          accessToken: response.AuthenticationResult?.AccessToken,
          refreshToken: response.AuthenticationResult?.RefreshToken,
          idToken: response.AuthenticationResult?.IdToken,
          expiresIn: response.AuthenticationResult?.ExpiresIn
        }
      })
    };

  } catch (error) {
    console.error('Login error:', error);

    // Manejar error de credenciales inválidas
    if (error instanceof NotAuthorizedException) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Invalid credentials'
        })
      };
    }

    // Manejar error de usuario no encontrado
    if (error instanceof UserNotFoundException) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'User not found'
        })
      };
    }

    // Error general
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Login failed',
        error: process.env.STAGE === 'dev' ? 
          error instanceof Error ? error.message : 'Unknown error' 
          : 'Internal server error'
      })
    };
  }
};