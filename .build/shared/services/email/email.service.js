"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const client_ses_1 = require("@aws-sdk/client-ses");
const logger_1 = require("@shared/utils/logger");
class EmailService {
    static instance;
    client;
    logger;
    defaultSender;
    region;
    constructor() {
        this.logger = new logger_1.Logger('EmailService');
        this.region = process.env.REGION || 'us-east-1';
        this.defaultSender = process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co';
        console.log('Initializing EmailService', {
            region: this.region,
            defaultSender: this.defaultSender,
            environment: process.env.NODE_ENV,
            stage: process.env.STAGE
        });
        this.client = new client_ses_1.SESClient({
            region: this.region
        });
        this.logger.info('EmailService initialized', {
            region: this.region,
            defaultSender: this.defaultSender
        });
    }
    static getInstance() {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }
    async sendEmail(options) {
        try {
            const { to, subject, text, html, from, replyTo } = options;
            const toAddresses = Array.isArray(to) ? to : [to];
            const sender = from || this.defaultSender;
            console.log('Preparing to send email', {
                to: toAddresses,
                subject,
                from: sender,
                region: this.region,
                hasText: !!text,
                hasHtml: !!html
            });
            this.logger.info('Sending email', {
                to: toAddresses,
                subject,
                from: sender
            });
            const commandParams = {
                Source: sender,
                Destination: {
                    ToAddresses: toAddresses
                },
                Message: {
                    Subject: {
                        Data: subject
                    },
                    Body: {
                        ...(text && {
                            Text: {
                                Data: text
                            }
                        }),
                        ...(html && {
                            Html: {
                                Data: html
                            }
                        })
                    }
                },
                ...(replyTo && {
                    ReplyToAddresses: [replyTo]
                })
            };
            console.log('SendEmailCommand parameters prepared', {
                source: sender,
                destination: toAddresses,
                hasReplyTo: !!replyTo
            });
            const command = new client_ses_1.SendEmailCommand(commandParams);
            console.log('Sending email via SES...');
            const response = await this.client.send(command);
            console.log('SES response received', {
                messageId: response.MessageId,
                responseType: typeof response,
                hasMessageId: !!response.MessageId
            });
            this.logger.info('Email sent successfully', {
                messageId: response.MessageId,
                to: toAddresses,
                subject
            });
            return response.MessageId || '';
        }
        catch (error) {
            console.error('Error sending email via SES', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                to: options.to,
                subject: options.subject,
                region: this.region,
                sender: options.from || this.defaultSender
            });
            this.logger.error('Error sending email', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                to: options.to,
                subject: options.subject
            });
            if (error instanceof Error) {
                if (error.name === 'MessageRejected') {
                    throw new Error(`Email rejected: ${error.message}`);
                }
                if (error.message.includes('not verified')) {
                    throw new Error(`Email address not verified: ${error.message}`);
                }
                if (error.name === 'InvalidParameterException') {
                    throw new Error(`Invalid parameter: ${error.message}`);
                }
                if (error.name === 'ConfigurationSetDoesNotExistException') {
                    throw new Error(`SES configuration issue: ${error.message}`);
                }
                if (error.name === 'MailFromDomainNotVerifiedException') {
                    throw new Error(`Domain not verified: ${error.message}`);
                }
            }
            throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async sendPasswordResetEmail(to, resetCode, isBackup = false) {
        console.log('Preparing password reset email', { to, resetCode: '******', isBackup });
        const subject = isBackup
            ? 'IMPORTANTE: Recuperación de contraseña - SPECTRUM Platform (Correo de respaldo)'
            : 'Recuperación de contraseña - SPECTRUM Platform';
        const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
            .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
            .code { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SPECTRUM Platform</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              ${isBackup ? '<p><strong>NOTA IMPORTANTE:</strong> Este es un correo de respaldo enviado por nuestro sistema. Si ya recibiste un correo anterior con un código de recuperación, puedes usar cualquiera de los dos códigos.</p>' : ''}
              <p>Has solicitado restablecer tu contraseña en la plataforma SPECTRUM. Utiliza el siguiente código para completar el proceso:</p>

              <div class="code">${resetCode}</div>

              <p>Este código es válido por 24 horas. Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.</p>
              ${isBackup ? '<p><strong>Problemas con el correo anterior?</strong> A veces los correos automáticos pueden ser filtrados por los sistemas de correo. Si no encuentras el correo anterior, revisa tu carpeta de spam o utiliza este código.</p>' : ''}

              <p>Saludos,<br>El equipo de SPECTRUM</p>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
      ${isBackup ? 'IMPORTANTE: ' : ''}Recuperación de contraseña - SPECTRUM Platform${isBackup ? ' (Correo de respaldo)' : ''}

      Hola,
      ${isBackup ? 'NOTA IMPORTANTE: Este es un correo de respaldo enviado por nuestro sistema. Si ya recibiste un correo anterior con un código de recuperación, puedes usar cualquiera de los dos códigos.' : ''}
      Has solicitado restablecer tu contraseña en la plataforma SPECTRUM. Utiliza el siguiente código para completar el proceso:

      ${resetCode}

      Este código es válido por 24 horas. Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.
      ${isBackup ? 'Problemas con el correo anterior? A veces los correos automáticos pueden ser filtrados por los sistemas de correo. Si no encuentras el correo anterior, revisa tu carpeta de spam o utiliza este código.' : ''}

      Saludos,
      El equipo de SPECTRUM

      Este es un correo automático, por favor no respondas a este mensaje.
      © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
    `;
        try {
            console.log('Calling sendEmail method for password reset');
            const messageId = await this.sendEmail({
                to,
                subject,
                text,
                html
            });
            console.log('Password reset email sent successfully', { to, messageId });
            return messageId;
        }
        catch (error) {
            console.error('Error sending password reset email', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                to
            });
            throw error;
        }
    }
    async sendVerificationEmail(to, verificationCode, isBackup = false) {
        console.log('Preparing email verification email', { to, verificationCode: '******', isBackup });
        const subject = isBackup
            ? 'IMPORTANTE: Verificación de correo electrónico - SPECTRUM Platform (Correo de respaldo)'
            : 'Verificación de correo electrónico - SPECTRUM Platform';
        const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
            .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
            .code { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>SPECTRUM Platform</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              ${isBackup ? '<p><strong>NOTA IMPORTANTE:</strong> Este es un correo de respaldo enviado por nuestro sistema. Si ya recibiste un correo anterior con un código de verificación, puedes usar cualquiera de los dos códigos.</p>' : ''}
              <p>Gracias por registrarte en la plataforma SPECTRUM. Para verificar tu dirección de correo electrónico, utiliza el siguiente código:</p>

              <div class="code">${verificationCode}</div>

              <p>Este código es válido por 24 horas. Si no te registraste en SPECTRUM, puedes ignorar este correo.</p>
              ${isBackup ? '<p><strong>Problemas con el correo anterior?</strong> A veces los correos automáticos pueden ser filtrados por los sistemas de correo. Si no encuentras el correo anterior, revisa tu carpeta de spam o utiliza este código.</p>' : ''}

              <p>Saludos,<br>El equipo de SPECTRUM</p>
            </div>
            <div class="footer">
              <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
      </html>
    `;
        const text = `
      ${isBackup ? 'IMPORTANTE: ' : ''}Verificación de correo electrónico - SPECTRUM Platform${isBackup ? ' (Correo de respaldo)' : ''}

      Hola,
      ${isBackup ? 'NOTA IMPORTANTE: Este es un correo de respaldo enviado por nuestro sistema. Si ya recibiste un correo anterior con un código de verificación, puedes usar cualquiera de los dos códigos.' : ''}
      Gracias por registrarte en la plataforma SPECTRUM. Para verificar tu dirección de correo electrónico, utiliza el siguiente código:

      ${verificationCode}

      Este código es válido por 24 horas. Si no te registraste en SPECTRUM, puedes ignorar este correo.
      ${isBackup ? 'Problemas con el correo anterior? A veces los correos automáticos pueden ser filtrados por los sistemas de correo. Si no encuentras el correo anterior, revisa tu carpeta de spam o utiliza este código.' : ''}

      Saludos,
      El equipo de SPECTRUM

      Este es un correo automático, por favor no respondas a este mensaje.
      © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
    `;
        try {
            console.log('Calling sendEmail method for email verification');
            const messageId = await this.sendEmail({
                to,
                subject,
                text,
                html
            });
            console.log('Email verification email sent successfully', { to, messageId });
            return messageId;
        }
        catch (error) {
            console.error('Error sending email verification email', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                to
            });
            throw error;
        }
    }
    async verifyEmailIdentity(email) {
        try {
            this.logger.info('Verifying email identity', { email });
            const command = new client_ses_1.VerifyEmailIdentityCommand({
                EmailAddress: email
            });
            await this.client.send(command);
            this.logger.info('Verification email sent', { email });
        }
        catch (error) {
            this.logger.error('Error verifying email identity', {
                error,
                email
            });
            throw new Error(`Failed to verify email identity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.EmailService = EmailService;
//# sourceMappingURL=email.service.js.map