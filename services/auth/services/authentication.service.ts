// services/auth/services/authentication.service.ts

import { Logger } from '@shared/utils/logger';
import { EmailService } from '@shared/services/email/email.service';
import {
  ValidationError,
  ConflictError,
  AuthenticationError
} from '@shared/utils/errors';
import {
  LoginCredentials,
  RegisterCredentials,
  AuthenticationResult,
  AuthenticatedUser
} from '../types/auth.types';
import { CognitoService } from './cognito.service';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { TokenService } from './token.service';
import { UserModel, UserStatus } from '../models/user.model';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  GetCommand,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import { ObservabilityService } from '@shared/services/observability/observability.service';
import { AnomalyDetectionService } from '@shared/services/observability/anomaly-detection.service';

import { MetricsService } from '@shared/utils/metrics';

export class AuthenticationService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly cognitoService: CognitoService;
  private readonly botpressService: BotpressService;
  private readonly tokenService: TokenService;
  private readonly dynamodb: DynamoDBDocumentClient;
  private readonly observability: ObservabilityService;
  private readonly anomalyDetection: AnomalyDetectionService;

  constructor() {
    this.logger = new Logger('AuthenticationService');
    this.metrics = new MetricsService('Authentication');
    this.cognitoService = new CognitoService();
    this.tokenService = new TokenService();

    const ddbClient = new DynamoDBClient({});
    this.dynamodb = DynamoDBDocumentClient.from(ddbClient);

    this.botpressService = BotpressService.getInstance();
    this.observability = ObservabilityService.getInstance();
    this.anomalyDetection = AnomalyDetectionService.getInstance();

  }

  /**
   * Inicia el proceso de recuperación de contraseña para un usuario
   *
   * Este método verifica si el usuario existe y envía un código de recuperación
   * a su dirección de correo electrónico a través de Cognito. Por razones de seguridad,
   * no se revela si el email existe o no en la respuesta.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<{destination?: string, deliveryMedium?: string}> - Detalles de la entrega del código
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async forgotPassword(email: string): Promise<{destination?: string, deliveryMedium?: string}> {
    try {
      this.logger.info('Starting password recovery process', { email });
      console.log('Starting password recovery process', {
        email,
        timestamp: new Date().toISOString()
      });

      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      // Verificar que el usuario existe en DynamoDB
      const user = await this.getUserByEmail(normalizedEmail);
      console.log('User lookup result in DynamoDB:', {
        userExists: !!user,
        email: normalizedEmail,
        userId: user?.userId,
        userSub: user?.userSub,
        userStatus: user?.status,
        timestamp: new Date().toISOString()
      });

      if (!user) {
        // No informamos al cliente si el email existe o no por seguridad
        this.logger.info('Password recovery requested for non-existent user in DynamoDB', { email: normalizedEmail });
        console.log('Password recovery requested for non-existent user in DynamoDB', { email: normalizedEmail });

        // Intentamos verificar si existe en Cognito de todas formas
        try {
          console.log('Checking if user exists in Cognito despite not being in DynamoDB', { email: normalizedEmail });
          await this.cognitoService.getUserByEmail(normalizedEmail);
          console.log('User exists in Cognito but not in DynamoDB', { email: normalizedEmail });
        } catch (cognitoCheckError) {
          console.log('User does not exist in Cognito either', {
            email: normalizedEmail,
            errorName: cognitoCheckError instanceof Error ? cognitoCheckError.name : 'Unknown'
          });

          // Continuamos con el proceso para mantener el comportamiento consistente
          // y no revelar si el usuario existe o no
        }
      } else {
        // Verificar que el usuario tenga un userSub válido (necesario para Cognito)
        if (!user.userSub) {
          this.logger.warn('User does not have a valid userSub', { email: normalizedEmail, userId: user.userId });
          console.log('User does not have a valid userSub', { email: normalizedEmail, userId: user.userId });

          // Intentamos recuperar el userSub de Cognito
          try {
            const cognitoUser = await this.cognitoService.getUserByEmail(normalizedEmail);
            if (cognitoUser && cognitoUser.sub) {
              // Actualizar el userSub en la base de datos
              await this.updateUserSub(user.userId, cognitoUser.sub);
              user.userSub = cognitoUser.sub;
              this.logger.info('Updated user with Cognito sub', {
                email: normalizedEmail,
                userId: user.userId,
                sub: cognitoUser.sub
              });
              console.log('Updated user with Cognito sub', {
                email: normalizedEmail,
                userId: user.userId,
                sub: cognitoUser.sub
              });
            }
          } catch (subError) {
            this.logger.error('Error retrieving userSub from Cognito', {
              error: subError,
              email: normalizedEmail,
              userId: user.userId
            });
            console.error('Error retrieving userSub from Cognito', {
              error: subError,
              email: normalizedEmail,
              userId: user.userId
            });
            // Continuamos con el proceso a pesar del error
          }
        }
      }

      // Enviar el código de recuperación a través de Cognito
      console.log('Sending password reset code via Cognito', { email: normalizedEmail });

      let deliveryDetails;
      try {
        deliveryDetails = await this.cognitoService.forgotPassword(normalizedEmail);

        console.log('Cognito forgotPassword call successful', {
          email: normalizedEmail,
          deliveryDetails
        });

        this.logger.info('Password recovery code sent successfully via Cognito', {
          email: normalizedEmail,
          deliveryDetails
        });

        // Mostrar información importante sobre el código
        console.log('IMPORTANT INFORMATION ABOUT THE RESET CODE:');
        console.log('1. The code has been sent to: ' + (deliveryDetails.destination || normalizedEmail));
        console.log('2. The code is valid for a limited time (usually 1 hour)');
        console.log('3. The code must be used with the /auth/reset-password endpoint');
        console.log('4. The code format is 6 digits (e.g., 123456)');
        console.log('5. The code is case-sensitive and must be entered exactly as received');

        // Enviar también un correo personalizado con SES como respaldo e instrucciones adicionales
        try {
          console.log('Also sending a custom email via SES with additional instructions', { email: normalizedEmail });

          const emailService = EmailService.getInstance();

          // No enviamos un código personalizado, sino instrucciones sobre cómo usar el código de Cognito
          await emailService.sendPasswordResetInstructions(normalizedEmail);

          console.log('Custom password reset instructions email sent successfully via SES', { email: normalizedEmail });
        } catch (sesError) {
          // Si falla el envío del correo personalizado, solo registramos el error pero continuamos
          console.error('Error sending custom instructions email via SES (non-blocking):', {
            error: sesError,
            name: sesError instanceof Error ? sesError.name : 'Unknown',
            message: sesError instanceof Error ? sesError.message : String(sesError),
            stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
          });
          // No propagamos este error ya que el flujo principal con Cognito ya funcionó
        }

        // Registrar métricas
        await this.metrics.incrementCounter('PasswordRecoveryRequested');
        await this.observability.trackAuthEvent('PasswordRecoveryRequested', {
          email: normalizedEmail,
          deliveryMedium: deliveryDetails.deliveryMedium
        });

        return deliveryDetails;

      } catch (cognitoError) {
        console.error('Error sending password reset code via Cognito:', {
          error: cognitoError,
          name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
          message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
          stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace',
          email: normalizedEmail
        });

        // Propagar el error para que sea manejado adecuadamente
        throw cognitoError;
      }

    } catch (error) {
      this.logger.error('Error in password recovery process', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        email
      });

      console.error('Error in password recovery process', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email
      });

      await this.metrics.incrementCounter('PasswordRecoveryFailed');

      // Mejorar los mensajes de error para casos específicos
      if (error instanceof Error) {
        // No propagamos el error para no revelar si el email existe
        if (error.name === 'UserNotFoundException') {
          console.log('UserNotFoundException handled silently', { email });
          return { destination: email, deliveryMedium: 'EMAIL' };
        }

        // Errores de límite de intentos
        if (error.name === 'LimitExceededException') {
          throw new AuthenticationError(
            'Too many attempts. Please wait a few minutes before requesting a new code.'
          );
        }

        // Errores de configuración de email
        if (error.name === 'InvalidParameterException' ||
            error.name === 'InvalidEmailRoleAccessPolicyException' ||
            error.message.includes('email')) {

          if (error.message.includes('not verified') ||
              error.message.includes('identity') ||
              error.message.includes('verification')) {
            throw new AuthenticationError(
              'Email delivery configuration error: The sender email is not verified in SES. Please contact support.'
            );
          }

          throw new AuthenticationError(
            'Email delivery configuration error: ' + error.message
          );
        }
      }

      throw new AuthenticationError(
        'Password recovery failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Actualiza el userSub de un usuario
   *
   * @param userId - ID del usuario
   * @param userSub - Sub de Cognito
   */
  private async updateUserSub(userId: string, userSub: string): Promise<void> {
    try {
      await this.dynamodb.send(new UpdateCommand({
        TableName: `${process.env.RESOURCE_PREFIX}-users`,
        Key: {
          userId: userId
        },
        UpdateExpression: 'SET userSub = :userSub',
        ExpressionAttributeValues: {
          ':userSub': userSub
        }
      }));

      this.logger.info('User sub updated successfully', { userId, userSub });
    } catch (error) {
      this.logger.error('Error updating user sub', { error, userId, userSub });
      // No lanzamos el error para no interrumpir el flujo principal
    }
  }

  /**
   * Restablece la contraseña de un usuario utilizando un código de confirmación
   *
   * Este método verifica el código de confirmación enviado al usuario y establece
   * la nueva contraseña. También actualiza el estado del usuario si es necesario.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @param newPassword - La nueva contraseña
   * @param confirmationCode - El código de confirmación enviado al usuario
   * @returns Promise<void | { message: string, deliveryDetails?: any }> - No devuelve ningún valor en caso de éxito,
   *         o devuelve un objeto con un mensaje en caso de código expirado con nuevo código enviado
   * @throws ValidationError - Si el código de confirmación es inválido o ha expirado
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resetPassword(email: string, newPassword: string, confirmationCode: string): Promise<void | { message: string, deliveryDetails?: any }> {
    try {
      this.logger.info('Starting password reset process', { email });
      console.log('Starting password reset process', {
        email,
        confirmationCodeLength: confirmationCode ? confirmationCode.length : 0,
        timestamp: new Date().toISOString()
      });

      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      // Normalizar el código de confirmación (eliminar espacios y otros caracteres no válidos)
      const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');

      console.log('Normalized inputs', {
        email: normalizedEmail,
        codeLength: normalizedCode.length,
        codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
        timestamp: new Date().toISOString()
      });

      // Verificar que el código tenga el formato correcto
      if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
        console.warn('Confirmation code format is invalid', {
          email: normalizedEmail,
          codeLength: normalizedCode.length,
          isNumeric: /^\d+$/.test(normalizedCode),
          codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
          timestamp: new Date().toISOString()
        });

        if (normalizedCode.length !== 6) {
          throw new ValidationError(
            `Invalid confirmation code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`
          );
        }

        if (!/^\d+$/.test(normalizedCode)) {
          throw new ValidationError(
            'Invalid confirmation code format: Code must contain only digits.'
          );
        }
      }

      // Verificar que el usuario existe en DynamoDB antes de intentar restablecer la contraseña
      const user = await this.getUserByEmail(normalizedEmail);
      console.log('User lookup result in DynamoDB:', {
        userExists: !!user,
        email: normalizedEmail,
        userId: user?.userId,
        userSub: user?.userSub,
        userStatus: user?.status,
        timestamp: new Date().toISOString()
      });

      // Confirmar el código y establecer la nueva contraseña
      console.log('Calling Cognito to confirm forgot password', {
        email: normalizedEmail,
        codeLength: normalizedCode.length,
        codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
        timestamp: new Date().toISOString()
      });

      try {
        await this.cognitoService.confirmForgotPassword(normalizedEmail, normalizedCode, newPassword);

        console.log('Cognito confirmForgotPassword call successful', {
          email: normalizedEmail,
          timestamp: new Date().toISOString()
        });
      } catch (confirmError) {
        console.error('Error from Cognito during confirmForgotPassword in authentication service', {
          error: confirmError,
          errorName: confirmError instanceof Error ? confirmError.name : 'Unknown',
          errorMessage: confirmError instanceof Error ? confirmError.message : String(confirmError),
          stack: confirmError instanceof Error ? confirmError.stack : 'No stack trace',
          email: normalizedEmail,
          codeLength: normalizedCode.length,
          codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
          timestamp: new Date().toISOString()
        });

        // Propagar el error para que sea manejado por el bloque catch principal
        throw confirmError;
      }

      // Actualizar el estado del usuario si es necesario
      if (user) {
        if (user.status === UserStatus.PENDING_PASSWORD_RESET ||
            user.status === UserStatus.PENDING_VERIFICATION) {
          console.log('Updating user status to ACTIVE', {
            email: normalizedEmail,
            userId: user.userId,
            currentStatus: user.status
          });

          await this.updateUserStatus(user.userId, UserStatus.ACTIVE);

          console.log('User status updated to ACTIVE', {
            email: normalizedEmail,
            userId: user.userId
          });
        } else {
          console.log('No need to update user status, already active', {
            email: normalizedEmail,
            userId: user.userId,
            status: user.status
          });
        }
      } else {
        console.log('User not found in DynamoDB, but password reset in Cognito was successful', {
          email: normalizedEmail
        });

        // Intentar obtener información del usuario de Cognito
        try {
          const cognitoUser = await this.cognitoService.getUserByEmail(normalizedEmail);
          console.log('User exists in Cognito but not in DynamoDB', {
            email: normalizedEmail,
            cognitoStatus: cognitoUser.UserStatus,
            sub: cognitoUser.sub
          });

          // Crear el usuario en DynamoDB si existe en Cognito
          if (cognitoUser && cognitoUser.sub) {
            console.log('Creating user record in DynamoDB based on Cognito data', {
              email: normalizedEmail,
              sub: cognitoUser.sub
            });

            await this.getOrCreateUserRecord(cognitoUser);

            console.log('User record created in DynamoDB', {
              email: normalizedEmail
            });
          }
        } catch (cognitoError) {
          console.error('Error getting user from Cognito after password reset', {
            error: cognitoError,
            email: normalizedEmail,
            errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
            errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
          });
          // Continuamos con el proceso a pesar del error
        }
      }

      // Enviar un correo de confirmación
      try {
        console.log('Sending password reset confirmation email', { email: normalizedEmail });

        const emailService = EmailService.getInstance();
        await emailService.sendEmail({
          to: normalizedEmail,
          subject: 'Contraseña restablecida con éxito - SPECTRUM Platform',
          html: `
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
                  .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
                  .success { color: #5cb85c; font-weight: bold; }
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

                    <p class="success">¡Tu contraseña ha sido restablecida con éxito!</p>

                    <p>Ya puedes iniciar sesión en la plataforma SPECTRUM con tu nueva contraseña.</p>

                    <p>Si no realizaste esta acción, por favor contacta inmediatamente a nuestro equipo de soporte.</p>

                    <p>Saludos,<br>El equipo de SPECTRUM</p>
                  </div>
                  <div class="footer">
                    <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
                    <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.</p>
                  </div>
                </div>
              </body>
            </html>
          `,
          text: `
            Contraseña restablecida con éxito - SPECTRUM Platform

            Hola,

            ¡Tu contraseña ha sido restablecida con éxito!

            Ya puedes iniciar sesión en la plataforma SPECTRUM con tu nueva contraseña.

            Si no realizaste esta acción, por favor contacta inmediatamente a nuestro equipo de soporte.

            Saludos,
            El equipo de SPECTRUM

            Este es un correo automático, por favor no respondas a este mensaje.
            © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
          `
        });

        console.log('Password reset confirmation email sent successfully', { email: normalizedEmail });
      } catch (emailError) {
        // Si falla el envío del correo, solo registramos el error pero continuamos
        console.error('Error sending password reset confirmation email (non-blocking):', {
          error: emailError,
          email: normalizedEmail,
          errorName: emailError instanceof Error ? emailError.name : 'Unknown',
          errorMessage: emailError instanceof Error ? emailError.message : String(emailError)
        });
        // No propagamos este error ya que el restablecimiento de contraseña ya fue exitoso
      }

      this.logger.info('Password reset completed successfully', { email: normalizedEmail });
      console.log('Password reset completed successfully', {
        email: normalizedEmail,
        timestamp: new Date().toISOString()
      });

      await this.metrics.incrementCounter('PasswordResetSuccess');
      await this.observability.trackAuthEvent('PasswordResetCompleted', { email: normalizedEmail });

    } catch (error) {
      this.logger.error('Error in password reset process', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      console.error('Error in password reset process', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      await this.metrics.incrementCounter('PasswordResetFailed');

      // Manejar errores específicos
      if (error instanceof Error) {
        switch (error.name) {
          case 'CodeMismatchException':
            // Código incorrecto
            throw new ValidationError(
              'The confirmation code is incorrect. Please check the code and try again.'
            );

          case 'ExpiredCodeException':
            // Código expirado - enviar un nuevo código automáticamente
            this.logger.info('Confirmation code has expired, sending a new code', {
              email,
              timestamp: new Date().toISOString()
            });

            console.log('Confirmation code has expired, sending a new code', {
              email,
              timestamp: new Date().toISOString()
            });

            try {
              // Enviar un nuevo código inmediatamente
              const deliveryDetails = await this.cognitoService.forgotPassword(email);

              // Registrar el éxito
              this.logger.info('New confirmation code sent successfully', {
                email,
                deliveryDetails,
                timestamp: new Date().toISOString()
              });

              console.log('New confirmation code sent successfully', {
                email,
                deliveryDetails,
                timestamp: new Date().toISOString()
              });

              // Devolver un objeto con el mensaje para que el handler pueda responder adecuadamente
              return {
                message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.',
                deliveryDetails
              };
            } catch (sendError) {
              this.logger.error('Failed to send a new confirmation code', {
                error: sendError,
                email,
                timestamp: new Date().toISOString()
              });

              throw new ValidationError(
                'The confirmation code has expired. Please request a new code using the forgot password feature.'
              );
            }

          case 'InvalidParameterException':
            // Verificar si es un error de código inválido
            if (error.message.includes('Invalid code provided')) {
              // Código inválido - sugerir solicitar un nuevo código
              this.logger.info('Invalid code provided, suggesting to request a new code', {
                email,
                errorName: error.name,
                errorMessage: error.message
              });

              console.log('Invalid code provided, attempting to send a new code', {
                email,
                errorName: error.name,
                errorMessage: error.message
              });

              // Intentar enviar un nuevo código automáticamente
              try {
                this.logger.info('Attempting to send a new confirmation code', { email });
                console.log('Attempting to send a new confirmation code', { email });

                // Enviar un nuevo código
                const deliveryDetails = await this.forgotPassword(email);

                // Registrar el éxito
                this.logger.info('New confirmation code sent successfully', {
                  email,
                  deliveryDetails
                });

                console.log('New confirmation code sent successfully', {
                  email,
                  deliveryDetails,
                  timestamp: new Date().toISOString()
                });

                // Devolver un objeto con el mensaje para que el handler pueda responder adecuadamente
                return {
                  message: 'The confirmation code is invalid. We have sent a new code to your email. Please check your inbox and try again with the new code.'
                };
              } catch (sendError) {
                this.logger.error('Failed to send a new confirmation code', {
                  error: sendError,
                  email,
                  originalError: error
                });

                console.error('Failed to send a new confirmation code', {
                  error: sendError,
                  email,
                  originalError: error,
                  errorName: sendError instanceof Error ? sendError.name : 'Unknown',
                  errorMessage: sendError instanceof Error ? sendError.message : String(sendError)
                });

                throw new ValidationError(
                  'The confirmation code is invalid. Please request a new code using the forgot password feature.'
                );
              }
            }

            // Otros errores de parámetros inválidos
            throw new ValidationError(
              'Invalid parameters: ' + error.message
            );

          case 'LimitExceededException':
            throw new ValidationError(
              'Too many attempts. Please try again after some time.'
            );

          case 'UserNotFoundException':
            throw new ValidationError(
              'User not found. Please check your email address and try again.'
            );

          case 'NotAuthorizedException':
            throw new ValidationError(
              'Not authorized: ' + error.message
            );

          default:
            throw new AuthenticationError(
              'Password reset failed: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Password reset failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Verifica la dirección de correo electrónico de un usuario
   *
   * Este método verifica el código de confirmación enviado al usuario y actualiza
   * el estado del usuario a ACTIVE si la verificación es exitosa.
   *
   * @param email - La dirección de correo electrónico a verificar
   * @param code - El código de verificación enviado al usuario
   * @returns Promise<void> - No devuelve ningún valor
   * @throws ValidationError - Si el código de verificación es inválido o ha expirado
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async verifyEmail(email: string, code: string): Promise<void> {
    try {
      this.logger.info('Starting email verification process', { email });

      // Confirmar el código de verificación
      await this.cognitoService.confirmSignUpWithCode(email, code);

      // Actualizar el estado del usuario
      const user = await this.getUserByEmail(email);
      if (user && user.status === UserStatus.PENDING_VERIFICATION) {
        await this.updateUserStatus(user.userId, UserStatus.ACTIVE);
      }

      this.logger.info('Email verification completed successfully', { email });
      await this.metrics.incrementCounter('EmailVerificationSuccess');
      await this.observability.trackAuthEvent('EmailVerified', { email });

    } catch (error) {
      this.logger.error('Error in email verification process', { error, email });
      await this.metrics.incrementCounter('EmailVerificationFailed');

      if ((error as Error).name === 'CodeMismatchException') {
        throw new ValidationError('Invalid verification code');
      }

      if ((error as Error).name === 'ExpiredCodeException') {
        throw new ValidationError('Verification code has expired');
      }

      throw new AuthenticationError(
        'Email verification failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Reenvía el código de verificación de correo electrónico
   *
   * Este método solicita a Cognito que envíe un nuevo código de verificación
   * al correo electrónico del usuario y devuelve información sobre la entrega del código.
   *
   * @param email - La dirección de correo electrónico a verificar
   * @returns Promise<{destination?: string, deliveryMedium?: string, userStatus?: string}> - Detalles de la entrega del código
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resendVerificationCode(email: string): Promise<{destination?: string, deliveryMedium?: string, userStatus?: string}> {
    try {
      this.logger.info('Starting resend verification code process', { email });
      console.log('Starting resend verification code process', { email });

      // Verificar que el usuario existe
      const user = await this.getUserByEmail(email);

      // Verificar si el usuario ya está activo en DynamoDB
      if (user && user.status === UserStatus.ACTIVE) {
        console.log('User is already active in DynamoDB, checking Cognito status', { email });
      }

      // Reenviar el código a través de Cognito
      const deliveryDetails = await this.cognitoService.resendConfirmationCode(email);

      // Verificar si el usuario ya está confirmado en Cognito
      if (deliveryDetails.userStatus === 'CONFIRMED') {
        console.log('User is already confirmed in Cognito', { email });

        // Si el usuario existe en DynamoDB pero no está activo, actualizarlo
        if (user && user.status !== UserStatus.ACTIVE) {
          console.log('Updating user status in DynamoDB to ACTIVE', { email, userId: user.userId });

          // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
          const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;

          await this.dynamodb.send(new UpdateCommand({
            TableName: tableName,
            Key: {
              userId: user.userId
            },
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': UserStatus.ACTIVE
            }
          }));

          this.logger.info('User status updated to ACTIVE', { email, userId: user.userId });
        }

        return {
          destination: email,
          deliveryMedium: 'EMAIL',
          userStatus: 'CONFIRMED'
        };
      }

      // Enviar un correo con instrucciones como respaldo
      /*try {
        console.log('Sending backup instructional email', { email });
        await this.sendInstructionalEmail(email);
        console.log('Backup instructional email sent successfully', { email });
      } catch (sesError) {
        // No fallamos si el correo de respaldo falla
        console.error('Error sending backup instructional email', {
          error: sesError,
          email,
          errorName: sesError instanceof Error ? sesError.name : 'Unknown',
          errorMessage: sesError instanceof Error ? sesError.message : String(sesError)
        });
      }

      this.logger.info('Verification code resent successfully', {
        email,
        destination: deliveryDetails.destination,
        deliveryMedium: deliveryDetails.deliveryMedium
      });*/

      return deliveryDetails;
    } catch (error) {
      this.logger.error('Error resending verification code', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      console.error('Error in verification code resend process', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        email
      });
      await this.metrics.incrementCounter('VerificationCodeResendFailed');

      // No propagamos el error si el usuario no existe para no revelar información
      if (error instanceof Error && error.name === 'UserNotFoundException') {
        this.logger.info('Verification code requested for non-existent user', { email });
        return {
          destination: email,
          deliveryMedium: 'EMAIL',
          userStatus: 'UNKNOWN'
        };
      }

      // Si es un error de validación, lo propagamos
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new AuthenticationError(
        'Failed to resend verification code: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Actualiza el estado de un usuario
   *
   * Este método actualiza el estado de un usuario en la base de datos.
   * No lanza errores para no interrumpir el flujo principal, pero registra
   * cualquier error que ocurra.
   *
   * @param userId - El ID único del usuario
   * @param status - El nuevo estado del usuario
   * @returns Promise<void> - No devuelve ningún valor
   */
  private async updateUserStatus(userId: string, status: UserStatus): Promise<void> {
    try {
      await this.dynamodb.send(new UpdateCommand({
        TableName: `${process.env.RESOURCE_PREFIX}-users`,
        Key: {
          userId: userId
        },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        }
      }));

      this.logger.info('User status updated successfully', { userId, status });

    } catch (error) {
      this.logger.error('Error updating user status', { error, userId, status });
      // No lanzamos el error ya que esto no debería interrumpir el flujo principal
    }
  }

  async registerUser(credentials: RegisterCredentials): Promise<AuthenticatedUser> {
    const startTime = Date.now();
    console.log('Starting user registration process', {
      body: credentials
    });
    try {
      this.logger.info('Starting user registration process', {
        email: credentials.email,
        userType: credentials.userType
      });

      // Verificar disponibilidad del email
      await this.verifyEmailAvailability(credentials.email);

      console.log('Email availability verified', {
        email: credentials.email
      });

      let userSub: string;

      // Registrar en Cognito
      try {
        userSub = await this.cognitoService.registerUser(credentials) || '';
        this.logger.info('Cognito registration completed', { email: credentials.email });
      } catch (error) {
        this.logger.error('Cognito registration failed', { error, email: credentials.email });
        await this.metrics.incrementCounter('RegistrationFailureCognito');
        throw error;
      }

      const userId = uuidv4();
      let botpressUserKeyId: string | undefined;

      // Crear usuario en Botpress
      try {
        const botpressResponse = await this.botpressService.createBotpressUser(userId, credentials.email);
        botpressUserKeyId = botpressResponse.key;
        this.logger.info('Botpress user created', { name: credentials.email });
      } catch (error) {
        this.logger.error('Botpress user creation failed', { error, email: credentials.email });
        await this.metrics.incrementCounter('RegistrationFailureBotpress');
      }

      // Preparar el usuario
      const user = new UserModel({
        userId: userId,
        userSub: userSub,
        email: credentials.email,
        name: credentials.name,
        botpressUserKeyId: botpressUserKeyId,
        phoneNumber: credentials.phoneNumber,
        userType: credentials.userType || 'basic',
        language: credentials.language || 'es',
        status: UserStatus.PENDING_VERIFICATION,
        createdAt: new Date().toISOString()
      });

      // Preparar transacción DynamoDB
      const transactItems = [{
        Put: {
          TableName: `${process.env.RESOURCE_PREFIX}-users`,
          Item: user.toDynamoDB(),
          ConditionExpression: 'attribute_not_exists(email)',
        }
      }];

      this.logger.info('User record prepared', { user });

      // Confirmar transacción DynamoDB
      try {
        await this.dynamodb.send(new TransactWriteCommand({
          TransactItems: transactItems
        }));
        console.log('User record created in DynamoDB', { email: credentials.email });
      } catch (error) {
        // Si falla DynamoDB, intentar limpiar el usuario de Cognito
        console.log('DynamoDB transaction failed', { error, email: credentials.email });
        try {
          await this.cognitoService.deleteUser(credentials.email);
          console.log('Cognito user cleaned up after DynamoDB failure', { email: credentials.email });
        } catch (cleanupError) {
          this.logger.error('Failed to cleanup Cognito user after DynamoDB failure', {
            originalError: error,
            cleanupError,
            email: credentials.email
          });
          console.error('Failed to cleanup Cognito user after DynamoDB failure', { error, cleanupError, email: credentials.email });
        }
        throw error;
      }

      try {

      } catch (error) {
        console.log('Error in user registration', { error, email: credentials.email });
        this.logger.error('Error in user registration', { error, email: credentials.email });
        await this.metrics.incrementCounter('RegistrationFailureDynamoDB');
        throw error;
      }

      console.log('User registration completed successfully', {
        email: credentials.email,
        duration: Date.now() - startTime
      });

      // Verificar configuración de auto-confirmación
      const shouldAutoConfirm = process.env.STAGE === 'dev' && process.env.AUTO_CONFIRM_USERS === 'true';
      console.log('Checking auto-confirmation settings', {
        stage: process.env.STAGE,
        autoConfirmUsers: process.env.AUTO_CONFIRM_USERS,
        shouldAutoConfirm
      });

      if (shouldAutoConfirm) {
        // Auto-confirmar en desarrollo si está habilitado
        try {
          console.log('Auto-confirming user in development environment', { email: credentials.email });
          await this.cognitoService.confirmSignUp(credentials.email);
          user.status = UserStatus.ACTIVE;
          this.logger.info('User auto-confirmed in development environment', { email: credentials.email });

          // Informar al usuario que la cuenta ha sido auto-confirmada
          console.log('IMPORTANTE: La cuenta ha sido auto-confirmada automáticamente porque AUTO_CONFIRM_USERS=true');
          console.log('Para probar el flujo de verificación, establece AUTO_CONFIRM_USERS=false');
        } catch (confirmError) {
          console.error('Error auto-confirming user', {
            error: confirmError,
            email: credentials.email,
            errorName: confirmError instanceof Error ? confirmError.name : 'Unknown',
            errorMessage: confirmError instanceof Error ? confirmError.message : String(confirmError)
          });

          // Intentar enviar correo de verificación como fallback
          console.log('Auto-confirmation failed, falling back to sending verification email', { email: credentials.email });
          await this.sendVerificationEmail(credentials.email);
        }
      } else {
        // Enviar correo de verificación
        console.log('Auto-confirmation disabled, sending verification email', { email: credentials.email });
        await this.sendVerificationEmail(credentials.email);

        // Informar al usuario sobre el siguiente paso
        console.log('IMPORTANTE: Se ha enviado un correo de verificación a ' + credentials.email);
        console.log('El usuario debe usar el código recibido en el endpoint /auth/verify-email para confirmar su cuenta');
        console.log('Hasta que la cuenta no sea confirmada, el usuario no podrá iniciar sesión');
      }


      // Registrar métricas
      const duration = Date.now() - startTime;
      await this.metrics.recordLatency('RegistrationDuration', duration);
      await this.metrics.incrementCounter('RegistrationSuccess');

      await this.observability.trackAuthEvent('UserRegistered', {
        userType: user.userType,
        duration
      });
      console.log('User registration completed successfully', {
        userId: user.userId,
        email: credentials.email,
        duration
      });
      this.logger.info('User registration completed successfully', {
        userId: user.userId,
        email: user.email,
        duration
      });

      return user;

    } catch (error) {
      // Registrar métricas de error

      console.log('User registration failed', { error, email: credentials.email });

      await this.metrics.incrementCounter('RegistrationFailure');

      this.logger.error('User registration failed', {
        error,
        email: credentials.email,
        duration: Date.now() - startTime
      });

      if (error instanceof ConflictError || error instanceof ValidationError) {
        throw error;
      }

      throw new AuthenticationError(
        'Registration failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthenticationResult> {
    try {
      this.logger.info('Starting login process', {
        email: credentials.email,
        timestamp: new Date().toISOString()
      });

      console.log('Starting login process', {
        email: credentials.email,
        timestamp: new Date().toISOString()
      });

      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = credentials.email.toLowerCase().trim();

      // Verificar si el usuario existe en DynamoDB antes de intentar autenticar
      try {
        console.log('Checking if user exists in DynamoDB', { email: normalizedEmail });
        const existingUser = await this.getUserByEmail(normalizedEmail);

        if (existingUser) {
          console.log('User exists in DynamoDB', {
            email: normalizedEmail,
            userId: existingUser.userId,
            status: existingUser.status
          });

          // Verificar si el usuario está activo en DynamoDB
          if (existingUser.status !== UserStatus.ACTIVE) {
            console.log('User is not active in DynamoDB', {
              email: normalizedEmail,
              status: existingUser.status
            });

            // Si el usuario no está activo, verificar su estado en Cognito
            try {
              const cognitoAttributes = await this.cognitoService.getUserByEmail(normalizedEmail);
              console.log('User status in Cognito', {
                email: normalizedEmail,
                cognitoStatus: cognitoAttributes.UserStatus
              });

              // Si el usuario está confirmado en Cognito pero no activo en DynamoDB, actualizarlo
              if (cognitoAttributes.UserStatus === 'CONFIRMED' && existingUser.status !== UserStatus.ACTIVE) {
                console.log('User is confirmed in Cognito but not active in DynamoDB, updating status', {
                  email: normalizedEmail,
                  cognitoStatus: cognitoAttributes.UserStatus,
                  dynamoStatus: existingUser.status
                });

                // Actualizar el estado del usuario en DynamoDB
                const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
                await this.dynamodb.send(new UpdateCommand({
                  TableName: tableName,
                  Key: {
                    userId: existingUser.userId
                  },
                  UpdateExpression: 'SET #status = :status',
                  ExpressionAttributeNames: {
                    '#status': 'status'
                  },
                  ExpressionAttributeValues: {
                    ':status': UserStatus.ACTIVE
                  }
                }));

                console.log('User status updated to ACTIVE in DynamoDB', {
                  email: normalizedEmail,
                  userId: existingUser.userId
                });
              }
            } catch (cognitoError) {
              console.error('Error checking user status in Cognito', {
                error: cognitoError,
                email: normalizedEmail
              });
              // Continuamos con el proceso a pesar del error
            }
          }
        } else {
          console.log('User does not exist in DynamoDB, will be created after successful authentication', {
            email: normalizedEmail
          });
        }
      } catch (dbError) {
        console.error('Error checking user in DynamoDB', {
          error: dbError,
          email: normalizedEmail
        });
        // Continuamos con el proceso a pesar del error
      }

      // Autenticar con Cognito
      console.log('Authenticating with Cognito', { email: normalizedEmail });
      const tokens = await this.cognitoService.authenticateUser({
        email: normalizedEmail,
        password: credentials.password
      });

      console.log('Authentication successful, tokens received', {
        email: normalizedEmail,
        accessTokenLength: tokens.accessToken.length,
        idTokenLength: tokens.idToken.length,
        refreshTokenLength: tokens.refreshToken.length
      });

      // Obtener información del usuario
      console.log('Getting user attributes from Cognito', { email: normalizedEmail });
      const userAttributes = await this.cognitoService.getUserByEmail(normalizedEmail);

      console.log('User attributes received from Cognito', {
        email: normalizedEmail,
        userStatus: userAttributes.UserStatus,
        emailVerified: userAttributes['email_verified']
      });

      // Actualizar último login en DynamoDB
      console.log('Creating or updating user record in DynamoDB', { email: normalizedEmail });
      const user = await this.getOrCreateUserRecord(userAttributes);

      console.log('User record created or updated', {
        email: normalizedEmail,
        userId: user.userId,
        status: user.status
      });

      await this.observability.trackAuthEvent('LoginSuccess', {
        userId: user.userId
      });

      this.logger.info('Login successful', {
        email: normalizedEmail,
        userId: user.userId,
        timestamp: new Date().toISOString()
      });

      return {
        user,
        tokens
      };

    } catch (error) {
      this.logger.error('Error in login', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        email: credentials.email
      });

      console.error('Error in login', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email: credentials.email
      });

      await this.observability.trackAuthEvent('LoginFailure', {
        email: credentials.email,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      await this.anomalyDetection.trackMetric(
        credentials.email,
        'failedLogins'
      );

      // Mejorar el mensaje de error según el tipo de error
      if (error instanceof Error) {
        if (error.message.includes('not confirmed')) {
          throw new AuthenticationError('User is not confirmed. Please verify your email before logging in.');
        }

        if (error.message.includes('Invalid credentials')) {
          throw new AuthenticationError('Invalid email or password. Please check your credentials and try again.');
        }

        if (error.message.includes('No tokens received')) {
          throw new AuthenticationError('Authentication failed: Unable to generate authentication tokens. Please try again or contact support.');
        }
      }

      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Login failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async logout(accessToken: string): Promise<void> {
    try {
      // Log directo a CloudWatch para verificar que los logs se están enviando
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Starting logout process',
        accessTokenLength: accessToken ? accessToken.length : 0,
        accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      }));

      this.logger.info('Starting logout process');
      console.log('Starting logout process', {
        accessTokenLength: accessToken ? accessToken.length : 0,
        accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      });

      if (!accessToken) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: No access token provided for logout',
          timestamp: new Date().toISOString()
        }));
        console.error('No access token provided for logout');
        throw new AuthenticationError('No access token provided');
      }

      // Verificar que el token tenga un formato válido (JWT)
      if (!accessToken.includes('.') || accessToken.split('.').length !== 3) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Invalid token format',
          accessTokenLength: accessToken.length,
          accessTokenFirstChars: accessToken.substring(0, 10) + '...',
          timestamp: new Date().toISOString()
        }));
        console.error('Invalid token format', {
          accessTokenLength: accessToken.length,
          accessTokenFirstChars: accessToken.substring(0, 10) + '...'
        });
        throw new AuthenticationError('Invalid token format');
      }

      try {
        // Intentar obtener información del usuario a partir del token
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Verifying token before logout',
          timestamp: new Date().toISOString()
        }));
        console.log('Verifying token before logout');
        const payload = await this.tokenService.verifyToken(accessToken);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Token verified successfully',
          sub: payload.sub,
          username: payload.username,
          hasEmail: !!payload.email,
          timestamp: new Date().toISOString()
        }));
        console.log('Token verified successfully', {
          sub: payload.sub,
          username: payload.username,
          hasEmail: !!payload.email
        });
      } catch (verifyError) {
        // Si hay un error al verificar el token, lo registramos pero continuamos con el proceso
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Error verifying token before logout',
          errorName: verifyError instanceof Error ? verifyError.name : 'Unknown',
          errorMessage: verifyError instanceof Error ? verifyError.message : String(verifyError),
          timestamp: new Date().toISOString()
        }));
        console.error('Error verifying token before logout', {
          error: verifyError,
          errorName: verifyError instanceof Error ? verifyError.name : 'Unknown',
          errorMessage: verifyError instanceof Error ? verifyError.message : String(verifyError)
        });
        // No lanzamos el error para permitir que el proceso de logout continúe
      }

      // Invalidar el token en Cognito
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Invalidating token in Cognito',
        timestamp: new Date().toISOString()
      }));
      console.log('Invalidating token in Cognito');
      try {
        await this.cognitoService.signOut(accessToken);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Token invalidated successfully in Cognito',
          timestamp: new Date().toISOString()
        }));
        console.log('Token invalidated successfully in Cognito');
      } catch (cognitoError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Error invalidating token in Cognito',
          errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
          errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
          timestamp: new Date().toISOString()
        }));
        console.error('Error invalidating token in Cognito', {
          error: cognitoError,
          errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
          errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
        });

        // Si el error es de token inválido o expirado, continuamos con el proceso
        if (cognitoError instanceof Error &&
            (cognitoError.name === 'NotAuthorizedException' ||
             cognitoError.message.includes('expired'))) {
          console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Token already invalid or expired in Cognito, continuing with local invalidation',
            timestamp: new Date().toISOString()
          }));
          console.log('Token already invalid or expired in Cognito, continuing with local invalidation');
        } else {
          // Para otros errores, lanzamos la excepción
          throw cognitoError;
        }
      }

      // Agregar el token a la blacklist local
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Adding token to local blacklist',
        timestamp: new Date().toISOString()
      }));
      console.log('Adding token to local blacklist');
      try {
        await this.tokenService.invalidateToken(accessToken);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Token added to local blacklist successfully',
          timestamp: new Date().toISOString()
        }));
        console.log('Token added to local blacklist successfully');
      } catch (blacklistError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Error adding token to local blacklist',
          errorName: blacklistError instanceof Error ? blacklistError.name : 'Unknown',
          errorMessage: blacklistError instanceof Error ? blacklistError.message : String(blacklistError),
          timestamp: new Date().toISOString()
        }));
        console.error('Error adding token to local blacklist', {
          error: blacklistError,
          errorName: blacklistError instanceof Error ? blacklistError.name : 'Unknown',
          errorMessage: blacklistError instanceof Error ? blacklistError.message : String(blacklistError)
        });

        // Si hay un error al agregar el token a la blacklist, lo registramos pero no lanzamos excepción
        // ya que el token ya fue invalidado en Cognito
      }

      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Logout completed successfully',
        timestamp: new Date().toISOString()
      }));
      this.logger.info('Logout completed successfully');
      console.log('Logout completed successfully', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Error in logout',
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      }));
      this.logger.error('Error in logout', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      console.error('Error in logout', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Logout failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async verifyEmailAvailability(email: string): Promise<void> {
    try {
      console.log('Verifying email availability', { email });
      // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
      const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
      console.log('Using table name:', { tableName });

      const result = await this.dynamodb.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        },
        Limit: 1
      }));

      if (result.Items && result.Items.length > 0) {
        console.log('Email already registered', { email });
        throw new ConflictError('Email already registered');
      }
      console.log('Email availability verified', { email });
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      console.log('Error verifying email availability', { error, email });
      this.logger.error('Error verifying email availability', { error, email });
      throw new Error('Error verifying email availability');
    }
  }

  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      // Verificar el token JWT
      const payload = await this.tokenService.verifyToken(token);
      this.logger.info('Token verified successfully', {
        sub: payload.sub,
        username: payload.username,
        hasEmail: !!payload.email
      });

      // Imprimir el payload completo para depuración
      this.logger.debug('Token payload', { payload: JSON.stringify(payload) });

      // Intentar buscar al usuario por email primero
      let user: AuthenticatedUser | null = null;
      let searchMethods: string[] = [];
      let searchErrors: Record<string, string> = {};

      if (payload.email && payload.email.trim() !== '') {
        this.logger.info('Searching user by email', { email: payload.email });
        searchMethods.push('email');
        try {
          user = await this.getUserByEmail(payload.email);
          if (user) {
            this.logger.info('User found by email', { userId: user.userId, email: payload.email });
            return user; // Retornar inmediatamente si encontramos al usuario
          }
        } catch (emailError) {
          const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
          this.logger.warn('Error searching user by email', { error: errorMessage, email: payload.email });
          searchErrors['email'] = errorMessage;
          // Continuamos con otros métodos de búsqueda
        }
      }

      // Si no se encuentra por email o no hay email, intentar buscar por username/sub
      if (payload.username) {
        this.logger.info('Searching user by username', { username: payload.username });
        searchMethods.push('username');
        try {
          user = await this.getUserBySub(payload.username);
          if (user) {
            this.logger.info('User found by username', { userId: user.userId, username: payload.username });
            return user; // Retornar inmediatamente si encontramos al usuario
          }
        } catch (usernameError) {
          const errorMessage = usernameError instanceof Error ? usernameError.message : String(usernameError);
          this.logger.warn('Error searching user by username', { error: errorMessage, username: payload.username });
          searchErrors['username'] = errorMessage;
          // Continuamos con otros métodos de búsqueda
        }
      }

      // Si aún no se encuentra, intentar buscar por sub directamente
      if (payload.sub) {
        this.logger.info('Searching user by sub', { sub: payload.sub });
        searchMethods.push('sub');
        try {
          user = await this.getUserBySub(payload.sub);
          if (user) {
            this.logger.info('User found by sub', { userId: user.userId, sub: payload.sub });
            return user; // Retornar inmediatamente si encontramos al usuario
          }
        } catch (subError) {
          const errorMessage = subError instanceof Error ? subError.message : String(subError);
          this.logger.warn('Error searching user by sub', { error: errorMessage, sub: payload.sub });
          searchErrors['sub'] = errorMessage;
        }
      }

      // Si llegamos aquí, no encontramos al usuario por ningún método
      this.logger.error('User not found after trying multiple methods', {
        searchMethods,
        searchErrors,
        sub: payload.sub,
        username: payload.username,
        hasEmail: !!payload.email
      });

      // Construir un mensaje de error detallado
      let errorMessage = `User not found. Tried searching by: ${searchMethods.join(', ')}`;

      // Agregar detalles de errores si los hay
      if (Object.keys(searchErrors).length > 0) {
        const errorDetails = Object.entries(searchErrors)
          .map(([method, error]) => `${method}: ${error}`)
          .join('; ');
        errorMessage += `. Errors: ${errorDetails}`;
      }

      throw new AuthenticationError(errorMessage);

    } catch (error) {
      this.logger.error('Error validating token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Token validation failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async getOrCreateUserRecord(attributes: Record<string, any>): Promise<AuthenticatedUser> {
    try {
      console.log('getOrCreateUserRecord called with attributes', {
        hasAttributes: !!attributes,
        attributeKeys: attributes ? Object.keys(attributes) : []
      });

      // Verificar que tengamos atributos
      if (!attributes || Object.keys(attributes).length === 0) {
        throw new Error('No user attributes provided');
      }

      // Obtener el email del usuario
      const email = attributes.email || attributes['email'];
      if (!email) {
        console.error('Email not found in user attributes', { attributes });
        throw new Error('Email not found in user attributes');
      }

      // Normalizar el email
      const normalizedEmail = email.toLowerCase().trim();

      console.log('Looking for existing user record', { email: normalizedEmail });

      // Intentar obtener el usuario existente
      const existingUser = await this.getUserByEmail(normalizedEmail);

      if (existingUser) {
        console.log('Existing user found, updating last login', {
          email: normalizedEmail,
          userId: existingUser.userId,
          status: existingUser.status
        });

        // Verificar si el usuario está activo
        if (existingUser.status !== UserStatus.ACTIVE && attributes.UserStatus === 'CONFIRMED') {
          console.log('User is confirmed in Cognito but not active in DynamoDB, updating status', {
            email: normalizedEmail,
            cognitoStatus: attributes.UserStatus,
            dynamoStatus: existingUser.status
          });

          // Actualizar el estado del usuario en DynamoDB
          const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
          await this.dynamodb.send(new UpdateCommand({
            TableName: tableName,
            Key: {
              userId: existingUser.userId
            },
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': UserStatus.ACTIVE
            }
          }));

          console.log('User status updated to ACTIVE', {
            email: normalizedEmail,
            userId: existingUser.userId
          });

          // Actualizar el objeto existingUser
          existingUser.status = UserStatus.ACTIVE;
        }

        // Actualizar último login
        await this.updateLastLogin(existingUser.userId);

        console.log('Last login updated successfully', {
          email: normalizedEmail,
          userId: existingUser.userId
        });

        return existingUser;
      }

      console.log('User not found, creating new record', { email: normalizedEmail });

      // Extraer el sub (identificador único de Cognito)
      const userSub = attributes.sub || '';

      // Verificar si el email está verificado en Cognito
      const emailVerified = attributes['email_verified'] === 'true' || attributes.UserStatus === 'CONFIRMED';

      // Determinar el estado del usuario
      let userStatus = UserStatus.PENDING_VERIFICATION;
      if (emailVerified || attributes.UserStatus === 'CONFIRMED') {
        userStatus = UserStatus.ACTIVE;
      }

      console.log('Creating new user with status', {
        email: normalizedEmail,
        userStatus,
        emailVerified,
        cognitoStatus: attributes.UserStatus
      });

      // Si no existe, crear nuevo registro
      const newUser = new UserModel({
        email: normalizedEmail,
        name: attributes.name || '',
        userType: attributes['custom:userType'] || 'basic',
        status: userStatus,
        userSub: userSub
      });

      console.log('New user model created', {
        email: normalizedEmail,
        userId: newUser.userId,
        status: newUser.status,
        userSub: newUser.userSub
      });

      // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
      const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
      this.logger.debug('Using table name for creating user record:', { tableName });

      console.log('Saving new user to DynamoDB', {
        email: normalizedEmail,
        tableName
      });

      await this.dynamodb.send(new PutCommand({
        TableName: tableName,
        Item: newUser.toDynamoDB()
      }));

      console.log('New user saved successfully', {
        email: normalizedEmail,
        userId: newUser.userId,
        status: newUser.status
      });

      return newUser;

    } catch (error) {
      console.error('Error in getOrCreateUserRecord', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      throw new AuthenticationError(
        'Failed to process user record: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async getUserByEmail(email: string): Promise<AuthenticatedUser | null> {
    if (!email || email.trim() === '') {
      this.logger.warn('Empty email provided to getUserByEmail');
      return null;
    }

    try {
      // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
      const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
      this.logger.debug('Using table name for getUserByEmail:', { tableName });

      const response = await this.dynamodb.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'EmailIndex', // Asegúrate de que este sea el nombre correcto del índice
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        },
        Limit: 1
      }));

      if (!response.Items || response.Items.length === 0) {
        return null;
      }

      return UserModel.fromDynamoDB(response.Items[0]);

    } catch (error) {
      this.logger.error('Error getting user by email', { error, email });
      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async getUserBySub(sub: string): Promise<AuthenticatedUser | null> {
    if (!sub || sub.trim() === '') {
      this.logger.warn('Empty sub provided to getUserBySub');
      return null;
    }

    try {
      // Intentar primero con el índice SubIndex (que es el correcto según la infraestructura)
      this.logger.info('Searching user by sub using SubIndex', { sub });

      try {
        // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
        const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
        this.logger.debug('Using table name for getUserBySub:', { tableName });

        const queryResponse = await this.dynamodb.send(new QueryCommand({
          TableName: tableName,
          IndexName: 'SubIndex', // Nombre correcto del índice según infrastructure/dynamodb/user-tables.yml
          KeyConditionExpression: 'userSub = :userSub',
          ExpressionAttributeValues: {
            ':userSub': sub
          },
          Limit: 1
        }));

        if (queryResponse.Items && queryResponse.Items.length > 0) {
          this.logger.info('User found by SubIndex', { sub });
          return UserModel.fromDynamoDB(queryResponse.Items[0]);
        }

        this.logger.info('User not found using SubIndex', { sub });
      } catch (indexError) {
        // Si hay un error con el índice, continuamos con los otros métodos
        this.logger.warn('Error using SubIndex, falling back to scan', {
          error: indexError instanceof Error ? indexError.message : String(indexError),
          sub
        });
      }

      // Si no encontramos con el índice o hubo un error, intentamos con scan
      this.logger.info('Scanning for user by userSub', { sub });

      const scanResponse = await this.dynamodb.send(new ScanCommand({
        TableName: `${process.env.RESOURCE_PREFIX}-users`,
        FilterExpression: 'userSub = :userSub',
        ExpressionAttributeValues: {
          ':userSub': sub
        },
        Limit: 1
      }));

      if (scanResponse.Items && scanResponse.Items.length > 0) {
        this.logger.info('User found by userSub scan', { sub });
        return UserModel.fromDynamoDB(scanResponse.Items[0]);
      }

      // Si no encontramos por userSub, intentamos buscar por userId
      // (en caso de que el sub se esté usando como userId)
      this.logger.info('Trying to get user by userId', { userId: sub });

      const getResponse = await this.dynamodb.send(new GetCommand({
        TableName: `${process.env.RESOURCE_PREFIX}-users`,
        Key: {
          userId: sub
        }
      }));

      if (getResponse.Item) {
        this.logger.info('User found by userId', { userId: sub });
        return UserModel.fromDynamoDB(getResponse.Item);
      }

      this.logger.info('User not found by any method', { sub });
      return null;

    } catch (error) {
      this.logger.error('Error getting user by sub', { error, sub });
      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Obtiene la información de un usuario por su ID
   *
   * Este método busca un usuario en la base de datos utilizando su ID único.
   *
   * @param userId - El ID único del usuario
   * @returns Promise<AuthenticatedUser | null> - La información del usuario o null si no existe
   * @throws AuthenticationError - Si ocurre un error durante la consulta
   */
  async getUserById(userId: string): Promise<AuthenticatedUser | null> {
    try {
      this.logger.info('Getting user by ID', { userId });

      // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
      const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
      this.logger.debug('Using table name for getUserById:', { tableName });

      const response = await this.dynamodb.send(new GetCommand({
        TableName: tableName,
        Key: {
          userId: userId
        }
      }));

      if (!response.Item) {
        this.logger.info('User not found', { userId });
        return null;
      }

      this.logger.info('User found', { userId });
      return UserModel.fromDynamoDB(response.Item);

    } catch (error) {
      this.logger.error('Error getting user by ID', { error, userId });
      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async updateLastLogin(userId: string): Promise<void> {
    try {
      // Usar la variable de entorno USERS_TABLE si está disponible, o construir el nombre de la tabla
      const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
      this.logger.debug('Using table name for updateLastLogin:', { tableName });

      await this.dynamodb.send(new UpdateCommand({
        TableName: tableName,
        Key: {
          userId: userId
        },
        UpdateExpression: 'SET lastLogin = :now',
        ExpressionAttributeValues: {
          ':now': new Date().toISOString()
        }
      }));
    } catch (error) {
      this.logger.error('Error updating last login', { error, userId });
      // No lanzamos el error ya que esto no debería interrumpir el flujo de login
    }
  }

  async refreshTokens(userSub: string, refreshToken: string): Promise<AuthenticationResult> {
    try {
      // Utilizar el CognitoService para refrescar los tokens
      const response = await this.cognitoService.refreshUserTokens(userSub, refreshToken);

      console.log('Tokens refreshed', { response });

      if (!response) {
        throw new AuthenticationError('Failed to refresh tokens');
      }

      // Obtener información del usuario del token ID
      const decodedToken = await this.tokenService.verifyToken(response.accessToken);

      console.log('Decoded token', { decodedToken });

      // Obtener información del usuario
      const userAttributes = await this.cognitoService.getUserBySub(userSub);

      // Actualizar último login en DynamoDB
      const user = await this.getOrCreateUserRecord(userAttributes);

      console.log('User record updated', { user });

      const result = {
        user,
        tokens: {
          accessToken: response.accessToken!,
          refreshToken: response.refreshToken!,
          idToken: response.idToken!,
          expiresIn: response.expiresIn || 3600
        }
      };
      console.log('Token refresh successful', { result });

      return result;
    } catch (error) {
      console.log('Error refreshing tokens', { error });

      if ((error as Error).name === 'NotAuthorizedException') {
        throw new AuthenticationError('Invalid refresh token');
      }

      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Token refresh failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async cleanup(): Promise<void> {
    await this.tokenService.cleanup();
  }

  /**
   * Envía un correo de verificación al usuario
   *
   * Este método intenta enviar un correo de verificación utilizando Cognito, que es el método oficial
   * para confirmar cuentas. El código enviado por Cognito es el único que funcionará con
   * el endpoint /auth/verify-email.
   *
   * Si Cognito falla en enviar el correo, se intenta enviar un correo personalizado con SES
   * que incluye instrucciones para solicitar un nuevo código a través del endpoint /auth/resend-verification-code.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<void>
   */
  private async sendVerificationEmail(email: string): Promise<void> {
    try {
      this.logger.info('Sending verification email', { email });
      console.log('Sending verification email', { email });

      // Intentar enviar el código de verificación a través de Cognito
      console.log('Sending verification code via Cognito', { email });

      try {
        const deliveryDetails = await this.cognitoService.resendConfirmationCode(email);
        console.log('Cognito resendConfirmationCode call successful', {
          email,
          deliveryDetails
        });

        // Verificar si el usuario ya está confirmado
        if (deliveryDetails.userStatus === 'CONFIRMED') {
          console.log('User is already confirmed, no need to send verification code', { email });
          this.logger.info('User is already confirmed, no need to send verification code', { email });
          return;
        }

        this.logger.info('Verification code sent successfully via Cognito', {
          email,
          destination: deliveryDetails.destination,
          deliveryMedium: deliveryDetails.deliveryMedium
        });

        // Agregar mensaje informativo para el usuario
        console.log('IMPORTANTE: El código de verificación ha sido enviado por Cognito a ' +
          (deliveryDetails.destination || email) + ' via ' + (deliveryDetails.deliveryMedium || 'EMAIL') + '. ' +
          'Este código debe ser utilizado en el endpoint /auth/verify-email para confirmar la cuenta.');

        // También enviar un correo personalizado con SES como respaldo
        // Este correo no incluye un código, solo instrucciones para solicitar uno nuevo
        try {
          console.log('Sending backup email with instructions via SES', { email });

          // Enviar correo con instrucciones (sin código)
          await this.sendInstructionalEmail(email);

          console.log('Backup instructional email sent successfully via SES', { email });
        } catch (sesError) {
          // No fallamos si el correo de respaldo falla
          console.error('Error sending backup instructional email', {
            error: sesError,
            email,
            errorName: sesError instanceof Error ? sesError.name : 'Unknown',
            errorMessage: sesError instanceof Error ? sesError.message : String(sesError)
          });
        }

      } catch (cognitoError) {
        console.error('Error sending verification code via Cognito', {
          error: cognitoError,
          email,
          errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
          errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
        });

        // Si falla Cognito, enviar un correo con instrucciones para solicitar un nuevo código
        console.log('Cognito failed, sending instructional email via SES', { email });

        try {
          await this.sendInstructionalEmail(email);
          console.log('Instructional email sent successfully via SES after Cognito failure', { email });
        } catch (sesError) {
          console.error('Error sending instructional email via SES', {
            error: sesError,
            email,
            errorName: sesError instanceof Error ? sesError.name : 'Unknown',
            errorMessage: sesError instanceof Error ? sesError.message : String(sesError)
          });

          // Propagar el error original de Cognito
          throw cognitoError;
        }
      }
    } catch (error) {
      this.logger.error('Error sending verification email', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      console.error('Failed to send verification email', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      // No propagamos el error para no interrumpir el flujo de registro
      // El usuario puede solicitar reenvío del código más tarde
    }
  }

  /**
   * Envía un correo con instrucciones para verificar la cuenta
   *
   * Este método envía un correo con instrucciones para solicitar un nuevo código
   * de verificación a través del endpoint /auth/resend-verification-code.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<void>
   */
  private async sendInstructionalEmail(email: string): Promise<void> {
    try {
      console.log('Preparing instructional email', { email });

      const emailService = EmailService.getInstance();
      const subject = 'Instrucciones para verificar tu cuenta - SPECTRUM Platform';

      // IMPORTANTE: Este código NO es el código de Cognito y NO funcionará para verificar la cuenta
      // Solo se incluye para que el usuario sepa cómo se ve un código de verificación
      const sampleCode = Math.floor(100000 + Math.random() * 900000).toString();

      const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
              .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
              .instructions { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
              .code { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
              .warning { color: #e74c3c; font-weight: bold; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
              .button { display: inline-block; background-color: #4a90e2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>SPECTRUM Platform</h1>
              </div>
              <div class="content">
                <p>Hola,</p>
                <p>Gracias por registrarte en la plataforma SPECTRUM. Para completar tu registro, necesitas verificar tu dirección de correo electrónico.</p>

                <div class="instructions">
                  <h3>Instrucciones para verificar tu cuenta:</h3>
                  <p>1. Deberías haber recibido un correo de AWS Cognito con un código de verificación de 6 dígitos.</p>
                  <p>2. Si no has recibido el código, puedes solicitar uno nuevo utilizando el endpoint <strong>/auth/resend-verification-code</strong>.</p>
                  <p>3. Una vez que tengas el código, utilízalo con el endpoint <strong>/auth/verify-email</strong> para confirmar tu cuenta.</p>
                </div>

                <p><strong>¿No recibiste el código de AWS Cognito?</strong> Revisa tu carpeta de spam o solicita un nuevo código.</p>

                <p class="warning">IMPORTANTE: El código de verificación debe venir de un correo de AWS Cognito, no de este correo.</p>

                <p>Un código de verificación se ve así (este es solo un ejemplo y NO funcionará para verificar tu cuenta):</p>
                <div class="code">${sampleCode}</div>

                <p><strong>¿Problemas para verificar tu cuenta?</strong> Contacta a nuestro equipo de soporte.</p>

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
        Instrucciones para verificar tu cuenta - SPECTRUM Platform

        Hola,

        Gracias por registrarte en la plataforma SPECTRUM. Para completar tu registro, necesitas verificar tu dirección de correo electrónico.

        Instrucciones para verificar tu cuenta:

        1. Deberías haber recibido un correo de AWS Cognito con un código de verificación de 6 dígitos.
        2. Si no has recibido el código, puedes solicitar uno nuevo utilizando el endpoint /auth/resend-verification-code.
        3. Una vez que tengas el código, utilízalo con el endpoint /auth/verify-email para confirmar tu cuenta.

        IMPORTANTE: El código de verificación debe venir de un correo de AWS Cognito, no de este correo.

        Un código de verificación se ve así (este es solo un ejemplo y NO funcionará para verificar tu cuenta):
        ${sampleCode}

        ¿No recibiste el código? Revisa tu carpeta de spam o solicita un nuevo código.
        ¿Problemas para verificar tu cuenta? Contacta a nuestro equipo de soporte.

        Saludos,
        El equipo de SPECTRUM

        Este es un correo automático, por favor no respondas a este mensaje.
        © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
      `;

      await emailService.sendEmail({
        to: email,
        subject,
        text,
        html
      });

      console.log('Instructional email sent successfully', { email });

    } catch (error) {
      console.error('Error sending instructional email', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }
}