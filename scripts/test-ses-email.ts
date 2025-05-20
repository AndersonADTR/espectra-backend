// scripts/test-ses-email.ts

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

async function testSesEmail(toEmail: string, fromEmail: string = 'soporte@spectrumai.com.co', region: string = 'us-east-1') {
  try {
    console.log('Starting SES email test');

    console.log('Configuration loaded', { region, fromEmail, toEmail });

    // Crear cliente de SES
    const client = new SESClient({ region });

    // Crear comando para enviar email
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [toEmail]
      },
      Message: {
        Subject: {
          Data: 'Test Email from SPECTRUM Platform'
        },
        Body: {
          Text: {
            Data: 'This is a test email from the SPECTRUM platform to verify SES configuration.'
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h1>Test Email from SPECTRUM</h1>
                  <p>This is a test email from the SPECTRUM platform to verify SES configuration.</p>
                  <p>If you received this email, it means that SES is correctly configured.</p>
                  <p>Time sent: ${new Date().toISOString()}</p>
                </body>
              </html>
            `
          }
        }
      }
    });

    // Enviar email
    console.log('Sending test email...');
    const response = await client.send(command);

    console.log('Email sent successfully', {
      messageId: response.MessageId,
      requestId: response.$metadata.requestId,
      httpStatusCode: response.$metadata.httpStatusCode
    });

  } catch (error) {
    console.error('Error sending test email:', error);

    if ((error as Error).name === 'MessageRejected') {
      console.error('Email was rejected. This could be because:');
      console.error('1. The sending identity (email or domain) is not verified in SES');
      console.error('2. You are in the SES sandbox and the recipient email is not verified');
      console.error('3. Your account is under review or has been suspended');
    }

    if ((error as Error).name === 'InvalidParameterValue') {
      console.error('Invalid parameter. Check that the email addresses are correctly formatted.');
    }
  }
}

// Usar correos específicos para la prueba
const email = 'andersonmontilva@gmail.com'; // Correo de destino
const fromEmail = 'soporte@spectrumai.com.co'; // Correo de origen
const region = process.argv[2] || 'us-east-1';

// Ejecutar prueba
console.log(`Enviando correo de prueba desde ${fromEmail} a ${email}`);
testSesEmail(email, fromEmail, region).catch(console.error);
