// scripts/test-forgot-password.ts

import { CognitoIdentityProviderClient, ForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as crypto from 'crypto';

// Función para calcular el SECRET_HASH
function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

async function testForgotPassword(email: string, userPoolId: string, clientId: string, clientSecret: string, region: string = 'us-east-1') {
  try {
    console.log('Starting forgot password test for email:', email);
    console.log('Using Cognito configuration:', { userPoolId, clientId, region });

    // Crear cliente de Cognito
    const client = new CognitoIdentityProviderClient({ region });

    // Generar SECRET_HASH si hay un secreto
    let secretHash: string | undefined;
    if (clientSecret) {
      secretHash = calculateSecretHash(email, clientId, clientSecret);
      console.log('Generated SECRET_HASH for request');
    }

    // Crear comando para solicitar recuperación de contraseña
    const command = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ...(secretHash ? { SecretHash: secretHash } : {})
    });

    // Enviar solicitud
    console.log('Sending ForgotPassword request to Cognito...');
    const response = await client.send(command);

    console.log('ForgotPassword request completed successfully', {
      responseType: typeof response,
      hasResponse: !!response,
      metadata: response.$metadata
    });

    console.log('Check your email for the password reset code');

  } catch (error) {
    console.error('Error testing forgot password:', error);

    if ((error as any).name === 'UserNotFoundException') {
      console.error('User not found in Cognito. Make sure the email is registered.');
    }

    if ((error as any).name === 'InvalidParameterException') {
      console.error('Invalid parameter. Check that the email is correctly formatted and the client configuration is correct.');
    }

    if ((error as any).name === 'NotAuthorizedException') {
      console.error('Not authorized. This could be due to incorrect SECRET_HASH or other authentication issues.');
    }

    if ((error as any).name === 'LimitExceededException') {
      console.error('Limit exceeded. You may have sent too many requests recently.');
    }
  }
}

// Verificar argumentos
const email = process.argv[2];
const userPoolId = process.argv[3];
const clientId = process.argv[4];
const clientSecret = process.argv[5] || '';
const region = process.argv[6] || 'us-east-1';

if (!email || !userPoolId || !clientId) {
  console.error('Please provide required arguments');
  console.error('Usage: ts-node scripts/test-forgot-password.ts <email> <userPoolId> <clientId> [clientSecret] [region]');
  process.exit(1);
}

// Ejecutar prueba
testForgotPassword(email, userPoolId, clientId, clientSecret, region).catch(console.error);
