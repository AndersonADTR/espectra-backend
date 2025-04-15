// scripts/test-cognito-forgot-password.ts

import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminGetUserCommand
} from "@aws-sdk/client-cognito-identity-provider";
import * as crypto from 'crypto';

// Función para calcular el SECRET_HASH
function calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

async function testCognitoForgotPassword(email: string, userPoolId: string, clientId: string, clientSecret: string, region: string = 'us-east-1') {
  try {
    console.log('Starting Cognito forgot password test');
    console.log('Parameters:', { email, userPoolId, clientId, region });

    // Crear cliente de Cognito
    const client = new CognitoIdentityProviderClient({ region });

    // Verificar si el usuario existe
    try {
      console.log('Verifying if user exists...');
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email
      });

      const userResponse = await client.send(getUserCommand);
      console.log('User exists:', {
        username: userResponse.Username,
        userStatus: userResponse.UserStatus,
        enabled: userResponse.Enabled,
        userAttributes: userResponse.UserAttributes?.map(attr => ({ name: attr.Name, value: attr.Value }))
      });
    } catch (userError: any) {
      if (userError.name === 'UserNotFoundException') {
        console.error('User not found in Cognito. Please register the user first.');
        return;
      }
      console.warn('Error checking user:', userError);
      // Continuamos con el proceso aunque haya un error al verificar el usuario
    }

    // Generar SECRET_HASH si hay un secreto
    let secretHash: string | undefined;
    if (clientSecret) {
      secretHash = calculateSecretHash(email, clientId, clientSecret);
      console.log('Generated SECRET_HASH for request');
    }

    // Crear comando para solicitar recuperación de contraseña
    const forgotCommand = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ...(secretHash ? { SecretHash: secretHash } : {})
    });

    // Enviar solicitud
    console.log('Sending ForgotPassword request to Cognito...');
    const response = await client.send(forgotCommand);

    console.log('ForgotPassword request completed successfully', {
      deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
      destination: response.CodeDeliveryDetails?.Destination,
      attributeName: response.CodeDeliveryDetails?.AttributeName
    });

    console.log('\nCheck your email for the password reset code');
    console.log('\nOnce you have the code, you can reset your password with:');
    console.log(`\naws cognito-idp confirm-forgot-password \\
  --client-id ${clientId} \\
  --username ${email} \\
  --confirmation-code YOUR_CODE \\
  --password YOUR_NEW_PASSWORD`);

    if (clientSecret) {
      console.log(`  --secret-hash ${secretHash}`);
    }

  } catch (error: any) {
    console.error('Error testing forgot password:', error);

    if (error.name === 'UserNotFoundException') {
      console.error('User not found in Cognito. Make sure the email is registered.');
    }

    if (error.name === 'InvalidParameterException') {
      console.error('Invalid parameter. Check that the email is correctly formatted and the client configuration is correct.');
    }

    if (error.name === 'NotAuthorizedException') {
      console.error('Not authorized. This could be due to incorrect SECRET_HASH or other authentication issues.');
    }

    if (error.name === 'LimitExceededException') {
      console.error('Limit exceeded. You may have sent too many requests recently.');
    }

    if (error.name === 'InvalidEmailRoleAccessPolicyException') {
      console.error('SES configuration issue. Make sure SES is properly configured and the role has the necessary permissions.');
    }
  }
}

// Usar correos específicos para la prueba
const email = 'andersonmontilva@gmail.com'; // Correo de destino
const userPoolId = process.argv[2] || 'us-east-1_wY0TSEhHl'; // User Pool ID por defecto
const clientId = process.argv[3] || '45j7k6tsgvlp63savmaan6i5um'; // Client ID por defecto
const clientSecret = process.argv[4] || ''; // Client Secret (opcional)
const region = process.argv[5] || 'us-east-1';

// Ejecutar prueba
console.log(`Probando forgot-password para el correo: ${email}`);
console.log(`Usando User Pool ID: ${userPoolId}, Client ID: ${clientId}`);
testCognitoForgotPassword(email, userPoolId, clientId, clientSecret, region).catch(console.error);
