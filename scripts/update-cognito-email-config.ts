// scripts/update-cognito-email-config.ts

import { 
  CognitoIdentityProviderClient,
  UpdateUserPoolCommand,
  DescribeUserPoolCommand
} from "@aws-sdk/client-cognito-identity-provider";

async function updateCognitoEmailConfig(
  userPoolId: string, 
  fromEmail: string, 
  region: string = 'us-east-1'
) {
  try {
    console.log('Starting Cognito email configuration update');
    console.log('Parameters:', { userPoolId, fromEmail, region });
    
    // Crear cliente de Cognito
    const cognitoClient = new CognitoIdentityProviderClient({ region });
    
    // Obtener configuración actual del User Pool
    console.log('Getting current User Pool configuration...');
    const describeCommand = new DescribeUserPoolCommand({
      UserPoolId: userPoolId
    });
    
    const userPoolResponse = await cognitoClient.send(describeCommand);
    const currentEmailConfig = userPoolResponse.UserPool?.EmailConfiguration;
    
    console.log('Current email configuration:', {
      emailSendingAccount: currentEmailConfig?.EmailSendingAccount,
      from: currentEmailConfig?.From,
      replyTo: currentEmailConfig?.ReplyToEmailAddress,
      sourceArn: currentEmailConfig?.SourceArn
    });
    
    // Construir el ARN de la identidad de SES
    const accountId = process.env.AWS_ACCOUNT_ID;
    if (!accountId) {
      console.error('AWS_ACCOUNT_ID environment variable is required');
      console.error('Please set it with: export AWS_ACCOUNT_ID=your-account-id');
      return;
    }
    
    const sourceArn = `arn:aws:ses:${region}:${accountId}:identity/${fromEmail}`;
    console.log('Using SES identity ARN:', sourceArn);
    
    // Actualizar la configuración del User Pool
    console.log('Updating User Pool email configuration...');
    const updateCommand = new UpdateUserPoolCommand({
      UserPoolId: userPoolId,
      EmailConfiguration: {
        EmailSendingAccount: 'DEVELOPER',
        From: fromEmail,
        SourceArn: sourceArn
      }
    });
    
    await cognitoClient.send(updateCommand);
    console.log('User Pool email configuration updated successfully');
    
    // Verificar la nueva configuración
    console.log('Verifying new configuration...');
    const verifyResponse = await cognitoClient.send(describeCommand);
    const newEmailConfig = verifyResponse.UserPool?.EmailConfiguration;
    
    console.log('New email configuration:', {
      emailSendingAccount: newEmailConfig?.EmailSendingAccount,
      from: newEmailConfig?.From,
      replyTo: newEmailConfig?.ReplyToEmailAddress,
      sourceArn: newEmailConfig?.SourceArn
    });
    
    console.log('Configuration update completed');
    
  } catch (error) {
    console.error('Error updating Cognito email configuration:', error);
  }
}

// Usar valores específicos para la configuración
const userPoolId = process.argv[2] || 'us-east-1_wY0TSEhHl'; // User Pool ID por defecto
const fromEmail = 'soporte@spectrumai.com.co'; // Correo de origen
const region = process.argv[3] || 'us-east-1';

// Ejecutar actualización
console.log(`Actualizando configuración de email de Cognito para usar: ${fromEmail}`);
updateCognitoEmailConfig(userPoolId, fromEmail, region).catch(console.error);
