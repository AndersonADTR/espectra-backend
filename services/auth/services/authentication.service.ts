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
   * a su dirección de correo electrónico. Por razones de seguridad, no se revela
   * si el email existe o no en la respuesta.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<void> - No devuelve ningún valor
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async forgotPassword(email: string): Promise<void> {
    try {
      this.logger.info('Starting password recovery process', { email });
      console.log('Starting password recovery process', { email });

      // Verificar que el usuario existe
      const user = await this.getUserByEmail(email);
      console.log('User lookup result:', {
        userExists: !!user,
        email,
        userId: user?.userId,
        userSub: user?.userSub,
        userStatus: user?.status
      });

      if (!user) {
        // No informamos al cliente si el email existe o no por seguridad
        this.logger.info('Password recovery requested for non-existent user', { email });
        console.log('Password recovery requested for non-existent user', { email });
        return;
      }

      // Verificar que el usuario tenga un userSub válido (necesario para Cognito)
      if (!user.userSub) {
        this.logger.warn('User does not have a valid userSub', { email, userId: user.userId });
        console.log('User does not have a valid userSub', { email, userId: user.userId });
        // Intentamos recuperar el userSub de Cognito
        try {
          const cognitoUser = await this.cognitoService.getUserByEmail(email);
          if (cognitoUser && cognitoUser.sub) {
            // Actualizar el userSub en la base de datos
            await this.updateUserSub(user.userId, cognitoUser.sub);
            user.userSub = cognitoUser.sub;
            this.logger.info('Updated user with Cognito sub', { email, userId: user.userId, sub: cognitoUser.sub });
            console.log('Updated user with Cognito sub', { email, userId: user.userId, sub: cognitoUser.sub });
          }
        } catch (subError) {
          this.logger.error('Error retrieving userSub from Cognito', {
            error: subError,
            email,
            userId: user.userId
          });
          console.error('Error retrieving userSub from Cognito', {
            error: subError,
            email,
            userId: user.userId
          });
        }
      }

      try {
        // Usar directamente nuestro servicio de correo personalizado
        console.log('Sending password reset email via direct SES', { email });

        // Intentar primero con Cognito para mantener la compatibilidad con el flujo de reset-password
        try {
          console.log('Trying to send password reset code via Cognito first', { email });
          await this.cognitoService.forgotPassword(email);
          console.log('Cognito forgotPassword call successful', { email });
          this.logger.info('Password recovery code sent successfully via Cognito', { email });

          // Enviar también un correo personalizado con SES como respaldo
          console.log('Also sending a custom email via SES as backup', { email });

          // Generar un código de 6 dígitos (solo para el correo personalizado)
          const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

          try {
            const emailService = EmailService.getInstance();
            console.log('EmailService instance created', {
              defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
              region: process.env.REGION || 'us-east-1'
            });

            // Enviar correo personalizado con instrucciones claras
            await emailService.sendPasswordResetEmail(email, resetCode, true);

            console.log('Custom password reset email sent successfully via direct SES', { email });
            this.logger.info('Custom password reset email sent successfully via direct SES', { email });
          } catch (sesError) {
            // Si falla el envío del correo personalizado, solo registramos el error pero continuamos
            console.error('Error sending custom email via direct SES (non-blocking):', {
              error: sesError,
              name: sesError instanceof Error ? sesError.name : 'Unknown',
              message: sesError instanceof Error ? sesError.message : String(sesError),
              stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
            });
            // No propagamos este error ya que el flujo principal con Cognito ya funcionó
          }

        } catch (cognitoError) {
          console.error('Error sending password reset code via Cognito:', {
            error: cognitoError,
            name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
            message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
            stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
          });

          // Si falla Cognito, usar exclusivamente nuestro servicio de correo
          console.log('Cognito failed, using only direct SES as fallback', { email });

          // Generar un código de 6 dígitos
          const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

          // Guardar el código en Redis para validarlo después
          // TODO: Implementar almacenamiento del código

          // Enviar correo con el código
          try {
            const emailService = EmailService.getInstance();
            console.log('EmailService instance created', {
              defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
              region: process.env.REGION || 'us-east-1'
            });

            await emailService.sendPasswordResetEmail(email, resetCode);

            console.log('Password reset email sent successfully via direct SES', { email });
            this.logger.info('Password reset email sent successfully via direct SES', { email });
          } catch (sesError) {
            console.error('Error sending email via direct SES:', {
              error: sesError,
              name: sesError instanceof Error ? sesError.name : 'Unknown',
              message: sesError instanceof Error ? sesError.message : String(sesError),
              stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
            });

            // Propagar el error original de Cognito si SES también falla
            throw cognitoError;
          }
        }

        await this.metrics.incrementCounter('PasswordRecoveryRequested');
        await this.observability.trackAuthEvent('PasswordRecoveryRequested', { email });

      } catch (emailError) {
        console.error('All email delivery methods failed:', {
          error: emailError,
          name: emailError instanceof Error ? emailError.name : 'Unknown',
          message: emailError instanceof Error ? emailError.message : String(emailError),
          stack: emailError instanceof Error ? emailError.stack : 'No stack trace'
        });

        throw new AuthenticationError(
          'Failed to send password recovery email: ' + ((emailError as Error).message || 'Unknown error')
        );
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
        email
      });
      await this.metrics.incrementCounter('PasswordRecoveryFailed');

      // No propagamos el error para no revelar si el email existe
      if (error instanceof Error && error.name === 'UserNotFoundException') {
        console.log('UserNotFoundException handled silently', { email });
        return;
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
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
   * @returns Promise<void | { message: string }> - No devuelve ningún valor en caso de éxito,
   *         o devuelve un objeto con un mensaje en caso de código expirado con nuevo código enviado
   * @throws ValidationError - Si el código de confirmación es inválido o ha expirado
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resetPassword(email: string, newPassword: string, confirmationCode: string): Promise<void | { message: string }> {
    try {
      this.logger.info('Starting password reset process', { email });

      // Confirmar el código y establecer la nueva contraseña
      await this.cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);

      // Actualizar el estado del usuario si es necesario
      const user = await this.getUserByEmail(email);
      if (user && user.status === UserStatus.PENDING_PASSWORD_RESET) {
        await this.updateUserStatus(user.userId, UserStatus.ACTIVE);
      }

      this.logger.info('Password reset completed successfully', { email });
      await this.metrics.incrementCounter('PasswordResetSuccess');
      await this.observability.trackAuthEvent('PasswordResetCompleted', { email });

    } catch (error) {
      this.logger.error('Error in password reset process', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      await this.metrics.incrementCounter('PasswordResetFailed');

      // Manejar errores específicos
      if ((error as Error).name === 'CodeMismatchException') {
        // Código incorrecto
        throw new ValidationError(
          'The confirmation code is incorrect. Please check the code and try again.'
        );
      }

      // Verificar si es un error de código expirado
      if ((error as Error).name === 'ExpiredCodeException' ||
          ((error as Error).message && (error as Error).message.includes('Invalid code provided'))) {

        // Código expirado - sugerir solicitar un nuevo código
        this.logger.info('Confirmation code has expired or is invalid, suggesting to request a new code', {
          email,
          errorName: (error as Error).name,
          errorMessage: (error as Error).message
        });

        // Intentar enviar un nuevo código automáticamente
        try {
          this.logger.info('Attempting to send a new confirmation code', { email });

          // Enviar un nuevo código
          await this.forgotPassword(email);

          // Registrar el éxito
          this.logger.info('New confirmation code sent successfully', {
            email,
            message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.'
          });

          // Devolver un objeto con el mensaje para que el handler pueda responder adecuadamente
          return {
            message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.'
          };
        } catch (sendError) {
          this.logger.error('Failed to send a new confirmation code', {
            error: sendError,
            email,
            originalError: error
          });

          throw new ValidationError(
            'The confirmation code has expired. Please request a new code using the forgot password feature.'
          );
        }
      }

      if ((error as Error).name === 'LimitExceededException') {
        throw new ValidationError(
          'Too many attempts. Please try again after some time.'
        );
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
   * al correo electrónico del usuario.
   *
   * @param email - La dirección de correo electrónico a verificar
   * @returns Promise<void> - No devuelve ningún valor
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resendVerificationCode(email: string): Promise<void> {
    try {
      this.logger.info('Starting resend verification code process', { email });
      console.log('Starting resend verification code process', { email });

      // Verificar que el usuario existe
      const user = await this.getUserByEmail(email);

      if (!user) {
        // No informamos al cliente si el email existe o no por seguridad
        this.logger.info('Verification code requested for non-existent user', { email });
        console.log('Verification code requested for non-existent user', { email });
        return;
      }

      // Verificar si el usuario ya está verificado
      if (user.status === UserStatus.ACTIVE) {
        this.logger.info('User is already verified', { email, userId: user.userId });
        console.log('User is already verified', { email, userId: user.userId });
        throw new ValidationError('Email is already verified');
      }

      try {
        // Intentar primero con Cognito
        console.log('Trying to resend verification code via Cognito', { email });
        await this.cognitoService.resendConfirmationCode(email);
        console.log('Cognito resendConfirmationCode call successful', { email });
        this.logger.info('Verification code resent successfully via Cognito', { email });

        // Enviar también un correo personalizado con SES como respaldo
        console.log('Also sending a custom verification email via SES as backup', { email });

        // Generar un código de 6 dígitos (solo para el correo personalizado)
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        try {
          const emailService = EmailService.getInstance();
          console.log('EmailService instance created', {
            defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
            region: process.env.REGION || 'us-east-1'
          });

          // Enviar correo personalizado con instrucciones claras
          await emailService.sendVerificationEmail(email, verificationCode);

          console.log('Custom verification email sent successfully via direct SES', { email });
          this.logger.info('Custom verification email sent successfully via direct SES', { email });
        } catch (sesError) {
          // Si falla el envío del correo personalizado, solo registramos el error pero continuamos
          console.error('Error sending custom email via direct SES (non-blocking):', {
            error: sesError,
            name: sesError instanceof Error ? sesError.name : 'Unknown',
            message: sesError instanceof Error ? sesError.message : String(sesError),
            stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
          });
          // No propagamos este error ya que el flujo principal con Cognito ya funcionó
        }

      } catch (cognitoError) {
        console.error('Error resending verification code via Cognito:', {
          error: cognitoError,
          name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
          message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
          stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
        });

        // Si falla Cognito, usar exclusivamente nuestro servicio de correo
        console.log('Cognito failed, using only direct SES as fallback', { email });

        // Generar un código de 6 dígitos
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Guardar el código en Redis para validarlo después
        // TODO: Implementar almacenamiento del código

        // Enviar correo con el código
        try {
          const emailService = EmailService.getInstance();
          console.log('EmailService instance created', {
            defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
            region: process.env.REGION || 'us-east-1'
          });

          await emailService.sendVerificationEmail(email, verificationCode);

          console.log('Verification email sent successfully via direct SES', { email });
          this.logger.info('Verification email sent successfully via direct SES', { email });
        } catch (sesError) {
          console.error('Error sending email via direct SES:', {
            error: sesError,
            name: sesError instanceof Error ? sesError.name : 'Unknown',
            message: sesError instanceof Error ? sesError.message : String(sesError),
            stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
          });

          // Propagar el error original de Cognito si SES también falla
          throw cognitoError;
        }
      }

      this.logger.info('Verification code resent successfully', { email });
      await this.metrics.incrementCounter('VerificationCodeResent');
      await this.observability.trackAuthEvent('VerificationCodeResent', { email });

    } catch (error) {
      this.logger.error('Error resending verification code', { error, email });
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
        return;
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
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
          TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
      // Auto-confirmar en desarrollo
      if (process.env.STAGE === 'dev') {
        await this.cognitoService.confirmSignUp(credentials.email);
        user.status = UserStatus.ACTIVE;
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
      // Autenticar con Cognito
      const tokens = await this.cognitoService.authenticateUser(credentials);

      // Obtener información del usuario
      const userAttributes = await this.cognitoService.getUserByEmail(credentials.email);

      // Actualizar último login en DynamoDB
      const user = await this.getOrCreateUserRecord(userAttributes);

      await this.observability.trackAuthEvent('LoginSuccess', {
        userId: user.userId
      });

      return {
        user,
        tokens
      };

    } catch (error) {
      console.log('Error in login', { error });
      await this.observability.trackAuthEvent('LoginFailure');
      await this.anomalyDetection.trackMetric(
        credentials.email,
        'failedLogins'
      );
      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Login failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async logout(accessToken: string): Promise<void> {
    try {
      // Invalidar el token en Cognito
      await this.cognitoService.signOut(accessToken);

      // Agregar el token a la blacklist
      await this.tokenService.invalidateToken(accessToken);

    } catch (error) {
      this.logger.error('Error in logout', { error });
      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Logout failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async verifyEmailAvailability(email: string): Promise<void> {
    try {
      console.log('Verifying email availability', { email });
      const result = await this.dynamodb.send(new QueryCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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

  private async getOrCreateUserRecord(attributes: Record<string, string>): Promise<AuthenticatedUser> {
    try {
      const email = attributes.email;
      if (!email) {
        throw new Error('Email not found in user attributes');
      }

      // Intentar obtener el usuario existente
      const existingUser = await this.getUserByEmail(email);

      if (existingUser) {
        // Actualizar último login
        await this.updateLastLogin(existingUser.userId);
        return existingUser;
      }

      // Si no existe, crear nuevo registro
      const newUser = new UserModel({
        email: email,
        name: attributes.name || '',
        userType: attributes['custom:userType'] || 'basic',
        status: UserStatus.ACTIVE
      });

      await this.dynamodb.send(new PutCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
        Item: newUser.toDynamoDB()
      }));

      return newUser;

    } catch (error) {
      console.log('Error in getOrCreateUserRecord', { error });
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
      const response = await this.dynamodb.send(new QueryCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
        const queryResponse = await this.dynamodb.send(new QueryCommand({
          TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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

      const response = await this.dynamodb.send(new GetCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
      await this.dynamodb.send(new UpdateCommand({
        TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
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
}