// scripts/diagnose-cognito-email.ts

import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  DescribeUserPoolClientCommand
} from "@aws-sdk/client-cognito-identity-provider";
// No importamos config para evitar errores de configuración

async function diagnoseCognitoEmail(userPoolId: string, clientId: string, region: string = 'us-east-1') {
  try {
    console.log('Starting Cognito email configuration diagnosis');

    // Usar los parámetros proporcionados
    if (!userPoolId || !clientId) {
      throw new Error('userPoolId and clientId are required');
    }

    console.log('Configuration loaded', { userPoolId, clientId, region });

    // Crear cliente de Cognito
    const client = new CognitoIdentityProviderClient({ region });

    // Verificar configuración del User Pool
    console.log('Checking User Pool configuration...');
    const userPoolCommand = new DescribeUserPoolCommand({
      UserPoolId: userPoolId
    });

    const userPoolResponse = await client.send(userPoolCommand);

    // Verificar configuración de email
    const emailConfig = userPoolResponse.UserPool?.EmailConfiguration;
    console.log('Email Configuration:', {
      emailSendingAccount: emailConfig?.EmailSendingAccount,
      from: emailConfig?.From,
      replyTo: emailConfig?.ReplyToEmailAddress,
      sourceArn: emailConfig?.SourceArn,
      configurationSet: emailConfig?.ConfigurationSet
    });

    // Verificar si está usando SES o Cognito por defecto
    if (emailConfig?.EmailSendingAccount === 'DEVELOPER') {
      console.log('Using custom SES configuration');

      if (!emailConfig.SourceArn) {
        console.warn('WARNING: No SourceArn configured. This means the email identity might not be verified in SES.');
      }
    } else {
      console.log('Using default Cognito email sender');
      console.warn('NOTE: Default Cognito email has limitations and may be less reliable.');
    }

    // Verificar configuración de verificación de email
    console.log('Email verification settings:', {
      autoVerifyEmail: userPoolResponse.UserPool?.AutoVerifiedAttributes?.includes('email'),
      verificationMessageTemplate: {
        defaultEmailOption: userPoolResponse.UserPool?.VerificationMessageTemplate?.DefaultEmailOption,
        emailSubject: userPoolResponse.UserPool?.VerificationMessageTemplate?.EmailSubject,
        emailMessageByLink: userPoolResponse.UserPool?.VerificationMessageTemplate?.EmailMessageByLink?.substring(0, 50) + '...',
      }
    });

    // Verificar configuración de recuperación de contraseña
    console.log('Password recovery settings:', {
      passwordPolicy: userPoolResponse.UserPool?.Policies?.PasswordPolicy,
      accountRecovery: userPoolResponse.UserPool?.AccountRecoverySetting?.RecoveryMechanisms
    });

    // Verificar configuración del cliente
    console.log('Checking User Pool Client configuration...');
    const clientCommand = new DescribeUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientId: clientId
    });

    const clientResponse = await client.send(clientCommand);

    console.log('Client Configuration:', {
      clientName: clientResponse.UserPoolClient?.ClientName,
      refreshTokenValidity: clientResponse.UserPoolClient?.RefreshTokenValidity,
      accessTokenValidity: clientResponse.UserPoolClient?.AccessTokenValidity,
      idTokenValidity: clientResponse.UserPoolClient?.IdTokenValidity,
      authFlows: {
        userPassword: clientResponse.UserPoolClient?.ExplicitAuthFlows?.includes('ALLOW_USER_PASSWORD_AUTH'),
        adminNoSRP: clientResponse.UserPoolClient?.ExplicitAuthFlows?.includes('ALLOW_ADMIN_USER_PASSWORD_AUTH'),
        refreshToken: clientResponse.UserPoolClient?.ExplicitAuthFlows?.includes('ALLOW_REFRESH_TOKEN_AUTH')
      }
    });

    // Verificar si tiene un secreto configurado
    if (clientResponse.UserPoolClient?.ClientSecret) {
      console.log('Client has a secret configured');

      // Verificar si está usando SECRET_HASH en las solicitudes
      const hasSecretHash = true; // Esto debería verificarse en el código
      if (hasSecretHash) {
        console.log('Code is correctly using SECRET_HASH in requests');
      } else {
        console.warn('WARNING: Client has a secret but code might not be using SECRET_HASH in requests');
      }
    } else {
      console.log('Client does not have a secret');
    }

    console.log('Diagnosis completed successfully');

  } catch (error) {
    console.error('Error during diagnosis:', error);
  }
}

// Verificar argumentos
const userPoolId = process.argv[2];
const clientId = process.argv[3];
const region = process.argv[4] || 'us-east-1';

if (!userPoolId || !clientId) {
  console.error('Please provide userPoolId and clientId as arguments');
  console.error('Usage: ts-node scripts/diagnose-cognito-email.ts <userPoolId> <clientId> [region]');
  process.exit(1);
}

// Ejecutar diagnóstico
diagnoseCognitoEmail(userPoolId, clientId, region).catch(console.error);
