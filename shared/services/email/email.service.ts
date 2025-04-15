// shared/services/email/email.service.ts

import { SESClient, SendEmailCommand, VerifyEmailIdentityCommand } from '@aws-sdk/client-ses';
import { Logger } from '@shared/utils/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

export class EmailService {
  private static instance: EmailService;
  private client: SESClient;
  private logger: Logger;
  private defaultSender: string;
  private region: string;

  private constructor() {
    this.logger = new Logger('EmailService');
    this.region = process.env.REGION || 'us-east-1';
    this.defaultSender = process.env.SES_FROM_EMAIL || 'anderson.montilva@technoapes.co';

    console.log('Initializing EmailService', {
      region: this.region,
      defaultSender: this.defaultSender,
      environment: process.env.NODE_ENV,
      stage: process.env.STAGE
    });

    this.client = new SESClient({
      region: this.region
    });

    this.logger.info('EmailService initialized', {
      region: this.region,
      defaultSender: this.defaultSender
    });
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Envía un correo electrónico usando Amazon SES
   */
  public async sendEmail(options: EmailOptions): Promise<string> {
    try {
      const { to, subject, text, html, from, replyTo } = options;

      // Convertir destinatarios a array si es necesario
      const toAddresses = Array.isArray(to) ? to : [to];

      // Usar el remitente predeterminado si no se proporciona uno
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

      // Crear comando para enviar email
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

      const command = new SendEmailCommand(commandParams);

      // Enviar email
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

    } catch (error) {
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

      // Verificar si es un error de SES
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

  /**
   * Envía un correo de recuperación de contraseña
   */
  public async sendPasswordResetEmail(to: string, resetCode: string): Promise<string> {
    console.log('Preparing password reset email', { to, resetCode: '******' });

    const subject = 'Recuperación de contraseña - SPECTRUM Platform';

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
              <p>Has solicitado restablecer tu contraseña en la plataforma SPECTRUM. Utiliza el siguiente código para completar el proceso:</p>

              <div class="code">${resetCode}</div>

              <p>Este código es válido por 24 horas. Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.</p>

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
      Recuperación de contraseña - SPECTRUM Platform

      Hola,

      Has solicitado restablecer tu contraseña en la plataforma SPECTRUM. Utiliza el siguiente código para completar el proceso:

      ${resetCode}

      Este código es válido por 24 horas. Si no solicitaste restablecer tu contraseña, puedes ignorar este correo.

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
    } catch (error) {
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

  /**
   * Verifica una dirección de correo electrónico en SES
   */
  public async verifyEmailIdentity(email: string): Promise<void> {
    try {
      this.logger.info('Verifying email identity', { email });

      const command = new VerifyEmailIdentityCommand({
        EmailAddress: email
      });

      await this.client.send(command);

      this.logger.info('Verification email sent', { email });

    } catch (error) {
      this.logger.error('Error verifying email identity', {
        error,
        email
      });

      throw new Error(`Failed to verify email identity: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
