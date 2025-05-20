// scripts/configure-ses.ts

import {
  SESClient,
  VerifyEmailIdentityCommand,
  GetIdentityVerificationAttributesCommand,
  ListIdentitiesCommand
} from "@aws-sdk/client-ses";

import {
  CognitoIdentityProviderClient,
  UpdateUserPoolCommand,
  DescribeUserPoolCommand
} from "@aws-sdk/client-cognito-identity-provider";

async function configureSES(email: string, userPoolId: string, region: string = 'us-east-1') {
  try {
    console.log('Starting SES configuration');
    console.log('Parameters:', { email, userPoolId, region });

    // Crear cliente de SES
    const sesClient = new SESClient({ region });

    // Verificar si el email ya está verificado
    console.log('Checking if email is already verified...');
    const listCommand = new ListIdentitiesCommand({
      IdentityType: 'EmailAddress',
      MaxItems: 100
    });

    const listResponse = await sesClient.send(listCommand);
    const identities = listResponse.Identities || [];

    if (identities.includes(email)) {
      console.log('Email identity already exists, checking verification status...');

      const verificationCommand = new GetIdentityVerificationAttributesCommand({
        Identities: [email]
      });

      const verificationResponse = await sesClient.send(verificationCommand);
      const attributes = verificationResponse.VerificationAttributes || {};

      if (attributes[email]?.VerificationStatus === 'Success') {
        console.log('Email is already verified');
      } else {
        console.log('Email exists but is not verified. Current status:', attributes[email]?.VerificationStatus);
        console.log('Please check your email for a verification message from AWS');
      }
    } else {
      // Solicitar verificación del email
      console.log('Requesting email verification...');
      const verifyCommand = new VerifyEmailIdentityCommand({
        EmailAddress: email
      });

      await sesClient.send(verifyCommand);
      console.log('Verification email sent. Please check your inbox and follow the instructions to verify your email address.');
    }

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

    // Preguntar si desea actualizar la configuración
    console.log('\nTo update Cognito to use SES for sending emails:');
    console.log('1. Make sure your email is verified in SES');
    console.log('2. Run the following command in AWS CLI:');
    console.log(`\naws cognito-idp update-user-pool \\
  --user-pool-id ${userPoolId} \\
  --email-configuration EmailSendingAccount=DEVELOPER,From="${email}",SourceArn=arn:aws:ses:${region}:ACCOUNT_ID:identity/${email}\n`);

    console.log('Replace ACCOUNT_ID with your AWS account ID');
    console.log('\nAlternatively, you can update this in the AWS Console:');
    console.log('1. Go to Amazon Cognito > User Pools > Your User Pool');
    console.log('2. Go to Messaging tab');
    console.log('3. Under "Email", select "Send email with Amazon SES"');
    console.log('4. Select your verified email address');
    console.log('5. Save changes');

  } catch (error) {
    console.error('Error configuring SES:', error);
  }
}

// Usar correos específicos para la configuración
const senderEmail = 'soporte@spectrumai.com.co'; // Correo de origen
const recipientEmail = 'andersonmontilva@gmail.com'; // Correo de destino
const userPoolId = process.argv[2] || 'us-east-1_wY0TSEhHl'; // User Pool ID por defecto
const region = process.argv[3] || 'us-east-1';

// Ejecutar configuración
configureSES(email, userPoolId, region).catch(console.error);
