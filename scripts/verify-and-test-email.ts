// scripts/verify-and-test-email.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error('Command stderr:', stderr);
    }
    return stdout.trim();
  } catch (error) {
    console.error('Error executing command:', error);
    throw error;
  }
}

async function verifyAndTestEmail() {
  try {
    console.log('Starting email verification and testing');

    // Correos específicos
    const senderEmail = 'anderson.montilva@technoapes.co';
    const recipientEmail = 'andersonmontilva@gmail.com';
    const region = process.env.AWS_REGION || 'us-east-1';

    console.log('Using emails:', { senderEmail, recipientEmail, region });

    // Verificar identidades existentes
    console.log('Checking existing verified identities...');
    try {
      const identitiesOutput = await runCommand(`aws ses list-identities --identity-type EmailAddress --region ${region}`);
      const identities = JSON.parse(identitiesOutput).Identities || [];

      console.log('Found identities:', identities);

      // Verificar estado de verificación
      if (identities.length > 0) {
        const verificationOutput = await runCommand(`aws ses get-identity-verification-attributes --identities ${identities.join(' ')} --region ${region}`);
        const attributes = JSON.parse(verificationOutput).VerificationAttributes || {};

        console.log('Verification status:');
        Object.entries(attributes).forEach(([email, attrs]: [string, any]) => {
          console.log(`- ${email}: ${attrs.VerificationStatus}`);
        });

        // Verificar si los correos específicos están verificados
        const senderVerified = attributes[senderEmail]?.VerificationStatus === 'Success';
        const recipientVerified = attributes[recipientEmail]?.VerificationStatus === 'Success';

        console.log('Specific emails verification status:');
        console.log(`- Sender (${senderEmail}): ${senderVerified ? 'Verified' : 'Not verified'}`);
        console.log(`- Recipient (${recipientEmail}): ${recipientVerified ? 'Verified' : 'Not verified'}`);

        // Verificar correos si es necesario
        if (!identities.includes(senderEmail) || !senderVerified) {
          console.log(`Sender email (${senderEmail}) not verified. Sending verification email...`);
          await runCommand(`aws ses verify-email-identity --email-address ${senderEmail} --region ${region}`);
          console.log('Verification email sent. Please check your inbox and follow the instructions.');
        }

        if (!identities.includes(recipientEmail) || !recipientVerified) {
          console.log(`Recipient email (${recipientEmail}) not verified. Sending verification email...`);
          await runCommand(`aws ses verify-email-identity --email-address ${recipientEmail} --region ${region}`);
          console.log('Verification email sent. Please check your inbox and follow the instructions.');
        }

        // Si ambos correos están verificados, enviar correo de prueba
        if (senderVerified && recipientVerified) {
          console.log('Both emails are verified. Sending test email...');

          // Crear archivo temporal con el contenido del correo
          const emailContent = {
            Source: senderEmail,
            Destination: {
              ToAddresses: [recipientEmail]
            },
            Message: {
              Subject: {
                Data: 'Test Email from SPECTRUM Platform'
              },
              Body: {
                Text: {
                  Data: 'This is a test email from the SPECTRUM platform.'
                },
                Html: {
                  Data: `
                    <html>
                      <body>
                        <h1>Test Email from SPECTRUM</h1>
                        <p>This is a test email from the SPECTRUM platform.</p>
                        <p>If you received this email, it means that SES is correctly configured.</p>
                        <p>Time sent: ${new Date().toISOString()}</p>
                      </body>
                    </html>
                  `
                }
              }
            }
          };

          // Guardar el contenido en un archivo temporal
          const fs = require('fs');
          const path = require('path');
          const emailFilePath = path.join(__dirname, 'test-email.json');
          fs.writeFileSync(emailFilePath, JSON.stringify(emailContent));

          try {
            // Enviar correo de prueba
            const sendResult = await runCommand(`aws ses send-email --from ${senderEmail} --to ${recipientEmail} --subject "Test Email from SPECTRUM Platform" --text "This is a test email from the SPECTRUM platform." --region ${region}`);
            console.log('Test email sent successfully', { result: sendResult });

            // Enviar correo de prueba de recuperación de contraseña
            console.log('Sending password reset test email...');
            const resetEmailContent = {
              Source: senderEmail,
              Destination: {
                ToAddresses: [recipientEmail]
              },
              Message: {
                Subject: {
                  Data: 'Recuperación de contraseña - SPECTRUM Platform'
                },
                Body: {
                  Text: {
                    Data: `Tu código de recuperación de contraseña es: 123456`
                  },
                  Html: {
                    Data: `
                      <html>
                        <body>
                          <h1>Recuperación de contraseña</h1>
                          <p>Tu código de recuperación de contraseña es: <strong>123456</strong></p>
                          <p>Time sent: ${new Date().toISOString()}</p>
                        </body>
                      </html>
                    `
                  }
                }
              }
            };

            const resetEmailFilePath = path.join(__dirname, 'reset-email.json');
            fs.writeFileSync(resetEmailFilePath, JSON.stringify(resetEmailContent));

            const resetSendResult = await runCommand(`aws ses send-email --from ${senderEmail} --to ${recipientEmail} --subject "Recuperación de contraseña - SPECTRUM Platform" --text "Tu código de recuperación de contraseña es: 123456" --region ${region}`);
            console.log('Password reset test email sent successfully', { result: resetSendResult });

            // Eliminar archivos temporales
            fs.unlinkSync(emailFilePath);
            fs.unlinkSync(resetEmailFilePath);

          } catch (sendError) {
            console.error('Error sending test email:', sendError);
            console.log('This could be due to SES being in sandbox mode. Please check your SES configuration in the AWS Console.');
          }

        } else {
          console.log('One or both emails are not verified. Please check your inbox and verify them before testing.');
        }
      } else {
        console.log('No identities found. Verifying both emails...');

        await runCommand(`aws ses verify-email-identity --email-address ${senderEmail} --region ${region}`);
        console.log(`Verification email sent to ${senderEmail}. Please check your inbox and follow the instructions.`);

        await runCommand(`aws ses verify-email-identity --email-address ${recipientEmail} --region ${region}`);
        console.log(`Verification email sent to ${recipientEmail}. Please check your inbox and follow the instructions.`);
      }

    } catch (awsError) {
      console.error('Error with AWS CLI commands:', awsError);
      console.log('Please make sure you have the AWS CLI installed and configured correctly.');
      console.log('You can configure it by running: aws configure');
    }

  } catch (error) {
    console.error('Error verifying and testing email:', error);
  }
}

// Ejecutar verificación y prueba
verifyAndTestEmail().catch(console.error);
