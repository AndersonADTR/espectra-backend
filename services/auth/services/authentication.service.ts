// services/auth/services/authentication.service.ts

import { Logger } from '@shared/utils/logger';
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
  GetCommand
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

      // Verificar que el usuario existe
      const user = await this.getUserByEmail(email);
      if (!user) {
        // No informamos al cliente si el email existe o no por seguridad
        this.logger.info('Password recovery requested for non-existent user', { email });
        return;
      }

      // Solicitar código de recuperación a Cognito
      await this.cognitoService.forgotPassword(email);

      this.logger.info('Password recovery code sent successfully', { email });
      await this.metrics.incrementCounter('PasswordRecoveryRequested');
      await this.observability.trackAuthEvent('PasswordRecoveryRequested', { email });

    } catch (error) {
      this.logger.error('Error in password recovery process', { error, email });
      await this.metrics.incrementCounter('PasswordRecoveryFailed');

      // No propagamos el error para no revelar si el email existe
      if ((error as Error).name === 'UserNotFoundException') {
        return;
      }

      throw new AuthenticationError(
        'Password recovery failed: ' + ((error as Error).message || 'Unknown error')
      );
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
   * @returns Promise<void> - No devuelve ningún valor
   * @throws ValidationError - Si el código de confirmación es inválido o ha expirado
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resetPassword(email: string, newPassword: string, confirmationCode: string): Promise<void> {
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
      this.logger.error('Error in password reset process', { error, email });
      await this.metrics.incrementCounter('PasswordResetFailed');

      if ((error as Error).name === 'CodeMismatchException') {
        throw new ValidationError('Invalid confirmation code');
      }

      if ((error as Error).name === 'ExpiredCodeException') {
        throw new ValidationError('Confirmation code has expired');
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
      const payload = await this.tokenService.verifyToken(token);
      const user = await this.getUserByEmail(payload.email);

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      return user;

    } catch (error) {
      this.logger.error('Error validating token', { error });
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