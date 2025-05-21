// services/auth/services/cognito.service.ts

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  GlobalSignOutCommand,
  AuthFlowType,
  AttributeType,
  AdminDeleteUserCommand,
  ListUsersCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand
} from "@aws-sdk/client-cognito-identity-provider";
import * as crypto from 'crypto';
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import { Logger } from '@shared/utils/logger';
import { config } from '@shared/config/config.service';
import { AuthenticationError } from '@shared/utils/errors';
import { LoginCredentials, RegisterCredentials, AuthTokens } from '../types/auth.types';

export class CognitoService {
  readonly client: CognitoIdentityProviderClient;
  private readonly logger: Logger;
  private readonly userPoolId: string;
  private readonly clientId: string;

  constructor() {
    this.logger = new Logger('CognitoService');

    // Agregar configuración de timeout
    this.client = new CognitoIdentityProviderClient({
        region: config.getRequired<string>('AWS_REGION'),
        maxAttempts: 3,
        retryMode: "adaptive",
        requestHandler: new NodeHttpHandler({
            connectionTimeout: 5000,
            socketTimeout: 5000
        })
    });

    this.userPoolId = config.getRequired<string>('COGNITO_USER_POOL_ID');
    this.clientId = config.getRequired<string>('COGNITO_CLIENT_ID');

    this.logger.info('CognitoService initialized', {
        userPoolId: this.userPoolId,
        clientId: this.clientId,
        region: config.getRequired<string>('AWS_REGION')
    });
  }

  private calculateSecretHash(username: string, clientId: string): string {
    const clientSecret = process.env.COGNITO_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error('Client secret not found in environment variables');
    }
    const message = username + clientId;
    const hmac = crypto.createHmac('SHA256', clientSecret);
    return hmac.update(message).digest('base64');
  }

  async refreshUserTokens(userSub: string, refreshToken: string): Promise<any> {
    try {

      console.log('Starting token refresh cognito service', {
        cognitoSub: userSub,
        refreshToken: refreshToken
      });

      // Calcular SECRET_HASH
      const secretHash = this.calculateSecretHash(
        userSub,
        this.clientId
      );

      console.log('Calculated secret hash', { secret: secretHash });

      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: secretHash,
          USERNAME: userSub
        }
      });

      console.log('Sending refresh token command', { command });

      const response = await this.client.send(command);

      if (!response.AuthenticationResult) {
          throw new AuthenticationError('Failed to refresh tokens: No authentication result');
      }

      console.log('Token refresh successful');

      return {
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken || refreshToken,
        expiresIn: response.AuthenticationResult.ExpiresIn || 3600
      };

    } catch (error) {
      console.log('Error refreshing user tokens', { error });

      if ((error as Error).name === 'NotAuthorizedException') {
        throw new AuthenticationError('Invalid refresh token');
      }

      throw new AuthenticationError(
        'Failed to refresh tokens: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async registerUser(credentials: RegisterCredentials): Promise<string | undefined> {
    try {
      console.log('Starting Cognito user registration', {
          email: credentials.email,
          userPoolId: this.userPoolId,
          clientId: this.clientId
      });

      const userAttributes: AttributeType[] = [
          { Name: 'email', Value: credentials.email },
          { Name: 'name', Value: credentials.name },
          { Name: 'phone_number', Value: credentials.phoneNumber },
          { Name: 'custom:language', Value: credentials.language }
      ];

      if (credentials.userType) {
          userAttributes.push({ Name: 'custom:userType', Value: credentials.userType });
      }

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        credentials.email,
        this.clientId
      );

      console.log('Calculated secret hash', { secret: secretHash });

      const command = new SignUpCommand({
          ClientId: this.clientId,
          Username: credentials.email,
          Password: credentials.password,
          UserAttributes: userAttributes,
          SecretHash: secretHash
      });

      console.log('Sending SignUp command to Cognito', {
          command: JSON.stringify(command, null, 2)
      });

      const startTime = Date.now();
      const user = await this.client.send(command);
      const duration = Date.now() - startTime;

      console.log('Cognito registration complete', {
          email: credentials.email,
          duration
      });

      return user.UserSub;

    } catch (error) {
      console.log('Error in Cognito registration', {
          error,
          email: credentials.email,
          errorName: (error as Error).name,
          errorMessage: (error as Error).message,
          // Agregar stack trace en desarrollo
          stack: process.env.STAGE === 'dev' ? (error as Error).stack : undefined
      });

      throw error;
    }
  }

  async authenticateUser(credentials: LoginCredentials): Promise<AuthTokens> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = credentials.email.toLowerCase().trim();

      console.log('CognitoService.authenticateUser called', {
        email: normalizedEmail,
        userPoolId: this.userPoolId,
        clientId: this.clientId,
        timestamp: new Date().toISOString()
      });

      // Verificar si el usuario existe y su estado en Cognito
      try {
        console.log('Verifying user status in Cognito before authentication', { email: normalizedEmail });
        const userInfo = await this.getUserByEmail(normalizedEmail);
        console.log('User exists in Cognito, checking status', {
          email: normalizedEmail,
          userStatus: userInfo.UserStatus,
          userCreatedAt: userInfo.UserCreateDate,
          userLastModified: userInfo.UserLastModifiedDate
        });

        // Verificar si el usuario está confirmado
        if (userInfo.UserStatus === 'UNCONFIRMED') {
          console.error('User is not confirmed in Cognito', { email: normalizedEmail });
          throw new AuthenticationError('User is not confirmed. Please verify your email before logging in.');
        }
      } catch (userError) {
        if ((userError as Error).name === 'UserNotFoundException') {
          console.error('User not found in Cognito during pre-authentication check', { email: normalizedEmail });
          throw new AuthenticationError('User not found');
        }

        console.error('Error checking user status before authentication', {
          error: userError,
          errorName: userError instanceof Error ? userError.name : 'Unknown',
          errorMessage: userError instanceof Error ? userError.message : String(userError),
          email: normalizedEmail
        });

        // Continuamos con el proceso a pesar del error
      }

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        normalizedEmail,
        this.clientId
      );

      console.log('SECRET_HASH generated successfully for authentication', {
        email: normalizedEmail,
        secretHashLength: secretHash ? secretHash.length : 0
      });

      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: normalizedEmail,
          PASSWORD: credentials.password,
          SECRET_HASH: secretHash
        }
      });

      console.log('Sending InitiateAuthCommand to Cognito', {
        email: normalizedEmail,
        authFlow: AuthFlowType.USER_PASSWORD_AUTH,
        clientId: this.clientId,
        hasSecretHash: !!secretHash
      });

      const response = await this.client.send(command);
      console.log('InitiateAuthCommand response received', {
        hasResponse: !!response,
        hasAuthResult: !!response.AuthenticationResult,
        hasChallenge: !!response.ChallengeName,
        challengeName: response.ChallengeName,
        timestamp: new Date().toISOString()
      });

      if (!response.AuthenticationResult) {
        console.error('No AuthenticationResult in response', {
          email: normalizedEmail,
          response: JSON.stringify(response),
          challengeName: response.ChallengeName,
          challengeParameters: response.ChallengeParameters
        });

        // Si hay un desafío, manejarlo adecuadamente
        if (response.ChallengeName) {
          console.log('Authentication challenge required', {
            email: normalizedEmail,
            challengeName: response.ChallengeName,
            challengeParameters: response.ChallengeParameters
          });

          throw new AuthenticationError(`Authentication challenge required: ${response.ChallengeName}`);
        }

        throw new AuthenticationError('Authentication failed: No tokens received');
      }

      // Verificar que todos los tokens estén presentes
      if (!response.AuthenticationResult.AccessToken ||
          !response.AuthenticationResult.IdToken ||
          !response.AuthenticationResult.RefreshToken) {
        console.error('Missing tokens in AuthenticationResult', {
          email: normalizedEmail,
          hasAccessToken: !!response.AuthenticationResult.AccessToken,
          hasIdToken: !!response.AuthenticationResult.IdToken,
          hasRefreshToken: !!response.AuthenticationResult.RefreshToken
        });

        throw new AuthenticationError('Authentication failed: Incomplete tokens received');
      }

      const tokens: AuthTokens = {
        accessToken: response.AuthenticationResult.AccessToken!,
        refreshToken: response.AuthenticationResult.RefreshToken!,
        idToken: response.AuthenticationResult.IdToken!,
        expiresIn: response.AuthenticationResult.ExpiresIn || 3600
      };

      console.log('User authenticated successfully', {
        email: normalizedEmail,
        accessTokenLength: tokens.accessToken.length,
        idTokenLength: tokens.idToken.length,
        refreshTokenLength: tokens.refreshToken.length,
        expiresIn: tokens.expiresIn
      });

      return tokens;

    } catch (error) {
      console.error('Error authenticating user', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email: credentials.email
      });

      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAuthorizedException':
            if (error.message.includes('not confirmed')) {
              throw new AuthenticationError('User is not confirmed. Please verify your email before logging in.');
            }
            throw new AuthenticationError('Invalid credentials');

          case 'UserNotFoundException':
            throw new AuthenticationError('User not found');

          case 'UserNotConfirmedException':
            throw new AuthenticationError('User is not confirmed. Please verify your email before logging in.');

          case 'PasswordResetRequiredException':
            throw new AuthenticationError('Password reset required. Please use the forgot password feature.');

          case 'LimitExceededException':
            throw new AuthenticationError('Too many attempts. Please try again after some time.');

          default:
            throw new AuthenticationError(
              'Authentication failed: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Authentication failed: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async deleteUser(email: string): Promise<void> {
    try {
        const command = new AdminDeleteUserCommand({
            UserPoolId: this.userPoolId,
            Username: email
        });

        await this.client.send(command);

        this.logger.info('User deleted from Cognito', { email });

    } catch (error) {
        this.logger.error('Error deleting user from Cognito', { error, email });

        if ((error as Error).name === 'UserNotFoundException') {
            // Si el usuario no existe, consideramos que la operación fue exitosa
            return;
        }

        throw new AuthenticationError(
            'Failed to delete user: ' + ((error as Error).message || 'Unknown error')
        );
    }
}

  async confirmSignUp(email: string): Promise<void> {
    try {
      const command = new AdminConfirmSignUpCommand({
        UserPoolId: this.userPoolId,
        Username: email
      });

      await this.client.send(command);

      this.logger.info('User confirmed successfully', { email });

    } catch (error) {
      this.logger.error('Error confirming user', { error, email });
      throw new AuthenticationError(
        'Failed to confirm user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async getUserBySub(userSub: string): Promise<Record<string, string>> {
    try {

      const listUsersCommand = new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `sub = "${userSub}"`,
        Limit: 1
      });

      const listResponse = await this.client.send(listUsersCommand);

      if (!listResponse.Users || listResponse.Users.length === 0) {
        throw new Error('User not found');
      }

      const username = listResponse.Users[0].Username;

      if (!username) {
        throw new Error('Username not found for the provided Sub');
      }

      const command = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: username
      });

      const response = await this.client.send(command);

      if (!response.UserAttributes) {
        throw new Error('No user attributes found');
      }

      // Convertir los atributos a un objeto
      const attributes: Record<string, string> = {};
      response.UserAttributes.forEach(attr => {
        if (attr.Name && attr.Value) {
          attributes[attr.Name] = attr.Value;
        }
      });

      this.logger.info('User retrieved by Sub successfully', { userSub });
      return attributes;

    } catch (error) {
      this.logger.error('Error getting user from Cognito by Sub', { error, userSub });

      if ((error as Error).name === 'UserNotFoundException') {
        throw new AuthenticationError('User not found');
      }

      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }


  async getUserByEmail(email: string): Promise<Record<string, any>> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      console.log('CognitoService.getUserByEmail called', {
        email: normalizedEmail,
        userPoolId: this.userPoolId,
        timestamp: new Date().toISOString()
      });

      const command = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: normalizedEmail
      });

      console.log('Sending AdminGetUserCommand to Cognito', {
        email: normalizedEmail,
        userPoolId: this.userPoolId
      });

      const response = await this.client.send(command);

      console.log('AdminGetUserCommand response received', {
        hasResponse: !!response,
        hasUserAttributes: !!response.UserAttributes,
        userStatus: response.UserStatus,
        enabled: response.Enabled,
        timestamp: new Date().toISOString()
      });

      // Crear un objeto con los atributos básicos del usuario
      const attributes: Record<string, any> = {
        UserStatus: response.UserStatus,
        Enabled: response.Enabled,
        UserCreateDate: response.UserCreateDate,
        UserLastModifiedDate: response.UserLastModifiedDate
      };

      // Agregar los atributos personalizados
      if (response.UserAttributes) {
        response.UserAttributes.forEach(attr => {
          if (attr.Name && attr.Value !== undefined) {
            attributes[attr.Name] = attr.Value;
          }
        });
      } else {
        console.warn('No user attributes found in response', {
          email: normalizedEmail,
          userStatus: response.UserStatus
        });
      }

      console.log('User retrieved successfully from Cognito', {
        email: normalizedEmail,
        userStatus: attributes.UserStatus,
        enabled: attributes.Enabled,
        sub: attributes.sub,
        emailVerified: attributes['email_verified']
      });

      return attributes;

    } catch (error) {
      console.error('Error getting user from Cognito', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email
      });

      if ((error as Error).name === 'UserNotFoundException') {
        console.log('User not found in Cognito', { email });
        throw new AuthenticationError('User not found');
      }

      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      // Log directo a CloudWatch para verificar que los logs se están enviando
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: CognitoService.signOut called',
        accessTokenLength: accessToken ? accessToken.length : 0,
        accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      }));

      console.log('CognitoService.signOut called', {
        accessTokenLength: accessToken ? accessToken.length : 0,
        accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      });

      if (!accessToken) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: No access token provided for sign out',
          timestamp: new Date().toISOString()
        }));
        console.error('No access token provided for sign out');
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

      const command = new GlobalSignOutCommand({
        AccessToken: accessToken
      });

      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Sending GlobalSignOutCommand to Cognito',
        timestamp: new Date().toISOString()
      }));
      console.log('Sending GlobalSignOutCommand to Cognito');

      try {
        const response = await this.client.send(command);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: GlobalSignOutCommand response received',
          success: true,
          responseType: typeof response,
          hasResponse: !!response,
          timestamp: new Date().toISOString()
        }));
        console.log('GlobalSignOutCommand response received', {
          success: true,
          responseType: typeof response,
          hasResponse: !!response,
          timestamp: new Date().toISOString()
        });
      } catch (signOutError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH TEST: Error from Cognito during sign out',
          errorName: signOutError instanceof Error ? signOutError.name : 'Unknown',
          errorMessage: signOutError instanceof Error ? signOutError.message : String(signOutError),
          timestamp: new Date().toISOString()
        }));
        console.error('Error from Cognito during sign out', {
          error: signOutError,
          errorName: signOutError instanceof Error ? signOutError.name : 'Unknown',
          errorMessage: signOutError instanceof Error ? signOutError.message : String(signOutError),
          stack: signOutError instanceof Error ? signOutError.stack : 'No stack trace'
        });

        // Manejar errores específicos
        if (signOutError instanceof Error) {
          if (signOutError.name === 'NotAuthorizedException') {
            console.log(JSON.stringify({
              message: 'CLOUDWATCH TEST: Invalid or expired access token',
              timestamp: new Date().toISOString()
            }));
            throw new AuthenticationError('Invalid or expired access token');
          }

          if (signOutError.name === 'InvalidParameterException') {
            console.log(JSON.stringify({
              message: 'CLOUDWATCH TEST: Invalid token parameter',
              errorMessage: signOutError.message,
              timestamp: new Date().toISOString()
            }));
            throw new AuthenticationError('Invalid token parameter: ' + signOutError.message);
          }

          console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Failed to sign out',
            errorMessage: signOutError.message,
            timestamp: new Date().toISOString()
          }));
          throw new AuthenticationError('Failed to sign out: ' + signOutError.message);
        }

        throw signOutError;
      }

      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: User signed out successfully',
        timestamp: new Date().toISOString()
      }));
      this.logger.info('User signed out successfully');
      console.log('User signed out successfully');

    } catch (error) {
      console.log(JSON.stringify({
        message: 'CLOUDWATCH TEST: Error signing out user',
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      }));
      this.logger.error('Error signing out user', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      console.error('Error signing out user', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      throw error instanceof AuthenticationError ? error : new AuthenticationError(
        'Failed to sign out: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Inicia el proceso de recuperación de contraseña para un usuario
   *
   * Este método envía un código de recuperación de contraseña al correo electrónico
   * del usuario a través de Cognito.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<{destination?: string, deliveryMedium?: string}> - Detalles de la entrega del código
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async forgotPassword(email: string): Promise<{destination?: string, deliveryMedium?: string}> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      console.log('CognitoService.forgotPassword called', {
        email: normalizedEmail,
        userPoolId: this.userPoolId,
        clientId: this.clientId,
        timestamp: new Date().toISOString()
      });

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        normalizedEmail,
        this.clientId
      );

      console.log('SECRET_HASH generated successfully');

      // Verificar si el usuario existe en Cognito antes de intentar recuperar la contraseña
      let userStatus = 'UNKNOWN';
      try {
        console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
        const userInfo = await this.getUserByEmail(normalizedEmail);
        userStatus = userInfo.UserStatus || 'UNKNOWN';

        console.log('User exists in Cognito', {
          email: normalizedEmail,
          userStatus: userInfo.UserStatus,
          userCreatedAt: userInfo.UserCreateDate,
          userLastModified: userInfo.UserLastModifiedDate
        });

        // Verificar si el usuario está confirmado
        if (userStatus !== 'CONFIRMED') {
          console.warn('User is not confirmed in Cognito, this may affect password reset', {
            email: normalizedEmail,
            userStatus
          });

          // No lanzamos error, pero registramos la advertencia
          this.logger.warn('User is not confirmed in Cognito, this may affect password reset', {
            email: normalizedEmail,
            userStatus
          });
        }
      } catch (userError) {
        if ((userError as Error).name === 'UserNotFoundException') {
          console.log('User not found in Cognito, attempting to proceed anyway', { email: normalizedEmail });
          // Continuamos con el proceso para mantener el comportamiento consistente
        } else {
          console.error('Error verifying user existence', {
            error: userError,
            errorName: userError instanceof Error ? userError.name : 'Unknown',
            errorMessage: userError instanceof Error ? userError.message : String(userError),
            email: normalizedEmail
          });
        }
      }

      // Crear el comando con el email normalizado
      const command = new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: normalizedEmail,
        SecretHash: secretHash
      });

      console.log('Sending ForgotPasswordCommand to Cognito', {
        clientId: this.clientId,
        username: normalizedEmail,
        timestamp: new Date().toISOString()
      });

      const response = await this.client.send(command);

      // Extraer detalles de entrega
      const deliveryDetails = response && response.CodeDeliveryDetails ? {
        destination: response.CodeDeliveryDetails.Destination,
        deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
        attributeName: response.CodeDeliveryDetails.AttributeName
      } : { destination: 'unknown', deliveryMedium: 'unknown' };

      console.log('ForgotPasswordCommand response received', {
        success: true,
        timestamp: new Date().toISOString(),
        deliveryDetails
      });

      // Verificar si tenemos detalles de entrega
      if (!response || !response.CodeDeliveryDetails) {
        console.warn('No code delivery details in Cognito response', {
          email: normalizedEmail,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('Code delivery details from Cognito', {
          destination: response.CodeDeliveryDetails.Destination,
          deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
          attributeName: response.CodeDeliveryDetails.AttributeName,
          timestamp: new Date().toISOString()
        });
      }

      // Agregar información importante sobre el código
      console.log('IMPORTANT: A password reset code has been sent. This code:');
      console.log('1. Is valid for a limited time (usually 1 hour)');
      console.log('2. Must be entered exactly as received (6 digits)');
      console.log('3. Should be used with the /auth/reset-password endpoint');
      console.log('4. Will replace any previously sent codes');

      this.logger.info('Password recovery code sent successfully', {
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
        deliveryDetails
      });

      console.log('Password recovery code sent successfully', {
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
        destination: deliveryDetails.destination,
        deliveryMedium: deliveryDetails.deliveryMedium
      });

      // Devolver detalles de entrega para uso en el servicio de autenticación
      return deliveryDetails;

    } catch (error) {
      this.logger.error('Error sending password recovery code', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        email
      });

      console.error('Detailed error sending password recovery code', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email
      });

      // Mejorar los mensajes de error para casos específicos
      if (error instanceof Error) {
        switch (error.name) {
          case 'UserNotFoundException':
            // No propagamos el error si el usuario no existe para no revelar información
            this.logger.info('Password recovery requested for non-existent user', { email });
            console.log('Password recovery requested for non-existent user (handled silently)', { email });
            return { destination: email, deliveryMedium: 'EMAIL' };

          case 'LimitExceededException':
            throw new AuthenticationError(
              'Too many attempts. Please wait a few minutes before requesting a new code.'
            );

          case 'InvalidParameterException':
            if (error.message.includes('Password reset required')) {
              throw new AuthenticationError(
                'This account requires a password reset through the AWS Console. Please contact support.'
              );
            }
            throw new AuthenticationError(
              'Invalid parameters: ' + error.message
            );

          case 'InvalidEmailRoleAccessPolicyException':
          case 'EmailSendingException':
            // Verificar si es un error de configuración de SES
            console.error('Email sending configuration issue', {
              error,
              message: error.message,
              email
            });

            // Verificar si el error es específico de SES no verificado
            if (error.message.includes('not verified') ||
                error.message.includes('identity') ||
                error.message.includes('verification')) {
              throw new AuthenticationError(
                'Email delivery configuration error: The sender email is not verified in SES. Please verify the email in the AWS SES console.'
              );
            }

            throw new AuthenticationError(
              'Email delivery configuration error: ' + error.message
            );

          default:
            throw new AuthenticationError(
              'Failed to send password recovery code: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Failed to send password recovery code: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Confirma el proceso de recuperación de contraseña con el código recibido
   *
   * Este método verifica el código de confirmación enviado al usuario y establece
   * la nueva contraseña.
   *
   * @param email - La dirección de correo electrónico del usuario
   * @param confirmationCode - El código de confirmación recibido por el usuario
   * @param newPassword - La nueva contraseña a establecer
   * @returns Promise<void> - No devuelve ningún valor
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<void> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      // Normalizar el código de confirmación (eliminar espacios y otros caracteres no válidos)
      const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');

      console.log('CognitoService.confirmForgotPassword called', {
        email: normalizedEmail,
        codeLength: normalizedCode.length,
        codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
        timestamp: new Date().toISOString()
      });

      // Verificar que el código tenga la longitud correcta (generalmente 6 dígitos)
      if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
        console.warn('Confirmation code format may be invalid', {
          email: normalizedEmail,
          codeLength: normalizedCode.length,
          isNumeric: /^\d+$/.test(normalizedCode),
          timestamp: new Date().toISOString()
        });

        // Si el código no tiene el formato correcto, lanzar un error más descriptivo
        if (normalizedCode.length !== 6) {
          throw new AuthenticationError(
            `Invalid confirmation code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`
          );
        }

        if (!/^\d+$/.test(normalizedCode)) {
          throw new AuthenticationError(
            'Invalid confirmation code format: Code must contain only digits.'
          );
        }
      }

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        normalizedEmail,
        this.clientId
      );

      // Crear el comando con los valores normalizados
      const command = new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: normalizedEmail,
        ConfirmationCode: normalizedCode,
        Password: newPassword,
        SecretHash: secretHash
      });

      console.log('Sending ConfirmForgotPasswordCommand to Cognito', {
        email: normalizedEmail,
        timestamp: new Date().toISOString()
      });

      // Intentar confirmar la contraseña olvidada
      const response = await this.client.send(command);

      console.log('ConfirmForgotPasswordCommand response received successfully', {
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
        response: response
      });

      this.logger.info('Password reset completed successfully', {
        email: normalizedEmail,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Error confirming password reset', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      console.error('Detailed error confirming password reset', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        email,
        timestamp: new Date().toISOString()
      });

      // Mejorar los mensajes de error para casos específicos
      if (error instanceof Error) {
        switch (error.name) {
          case 'CodeMismatchException':
            throw new AuthenticationError(
              'The confirmation code is incorrect. Please check the code and try again.'
            );

          case 'ExpiredCodeException':
            throw new AuthenticationError(
              'The confirmation code has expired. Please request a new code using the forgot password feature.'
            );

          case 'InvalidParameterException':
            if (error.message.includes('password') || error.message.includes('Password')) {
              throw new AuthenticationError(
                'The password does not meet the requirements: ' + error.message
              );
            }
            throw new AuthenticationError(
              'Invalid parameters: ' + error.message
            );

          case 'LimitExceededException':
            throw new AuthenticationError(
              'Too many attempts. Please wait a few minutes before trying again.'
            );

          case 'UserNotFoundException':
            throw new AuthenticationError(
              'User not found. Please check your email address and try again.'
            );

          case 'NotAuthorizedException':
            throw new AuthenticationError(
              'Not authorized: ' + error.message
            );

          default:
            throw new AuthenticationError(
              'Failed to reset password: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Failed to reset password: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async confirmSignUpWithCode(email: string, confirmationCode: string): Promise<void> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      // Normalizar el código de confirmación (eliminar espacios y otros caracteres no válidos)
      const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');

      console.log('CognitoService.confirmSignUpWithCode called', {
        email: normalizedEmail,
        codeLength: normalizedCode.length,
        codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
        userPoolId: this.userPoolId,
        clientId: this.clientId,
        timestamp: new Date().toISOString()
      });

      // Verificar que el código tenga la longitud correcta (generalmente 6 dígitos)
      if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
        console.warn('Confirmation code format may be invalid', {
          email: normalizedEmail,
          codeLength: normalizedCode.length,
          isNumeric: /^\d+$/.test(normalizedCode),
          code: normalizedCode
        });

        // Si el código no tiene el formato correcto, lanzar un error más descriptivo
        if (normalizedCode.length !== 6) {
          throw new AuthenticationError(
            `Invalid verification code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`
          );
        }

        if (!/^\d+$/.test(normalizedCode)) {
          throw new AuthenticationError(
            'Invalid verification code format: Code must contain only digits.'
          );
        }
      }

      // Verificar si el usuario existe en Cognito y obtener su estado
      let userStatus = 'UNKNOWN';
      try {
        console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
        const userInfo = await this.getUserByEmail(normalizedEmail);
        userStatus = userInfo.UserStatus || 'UNKNOWN';

        console.log('User exists in Cognito', {
          email: normalizedEmail,
          userStatus: userInfo.UserStatus,
          userCreatedAt: userInfo.UserCreateDate,
          userLastModified: userInfo.UserLastModifiedDate
        });

        // Verificar si el usuario ya está confirmado
        if (userStatus === 'CONFIRMED') {
          console.log('User is already confirmed', { email: normalizedEmail });
          this.logger.info('User is already confirmed', { email: normalizedEmail });

          // Devolver sin error, ya que el objetivo (tener un usuario confirmado) ya se cumplió
          return;
        }

      } catch (userError) {
        console.error('Error verifying user existence', {
          error: userError,
          errorName: userError instanceof Error ? userError.name : 'Unknown',
          errorMessage: userError instanceof Error ? userError.message : String(userError),
          email: normalizedEmail
        });

        // Si el usuario no existe, lanzar un error claro
        if ((userError as Error).name === 'UserNotFoundException') {
          throw new AuthenticationError('User not found. Please register first.');
        }

        // Para otros errores, continuamos con el proceso
      }

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        normalizedEmail,
        this.clientId
      );

      console.log('SECRET_HASH generated successfully');

      console.log('Creating ConfirmSignUpCommand', {
        clientId: this.clientId,
        username: normalizedEmail,
        confirmationCodeLength: normalizedCode.length,
        hasSecretHash: !!secretHash,
        userStatus
      });

      const command = new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: normalizedEmail,
        ConfirmationCode: normalizedCode,
        SecretHash: secretHash
      });

      console.log('Sending ConfirmSignUpCommand to Cognito');
      await this.client.send(command);
      console.log('ConfirmSignUpCommand response received successfully');

      this.logger.info('Email verification completed successfully', { email: normalizedEmail });

    } catch (error) {
      console.error('Error confirming email verification', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email
      });

      this.logger.error('Error confirming email verification', { error, email });

      // Mejorar los mensajes de error para casos específicos
      if (error instanceof Error) {
        switch (error.name) {
          case 'CodeMismatchException':
            console.log('Code mismatch error details', {
              email,
              errorMessage: error.message,
              timestamp: new Date().toISOString()
            });
            throw new AuthenticationError(
              'The verification code is incorrect. Please check the code and try again, or request a new code.'
            );

          case 'ExpiredCodeException':
            console.log('Code expired error details', {
              email,
              errorMessage: error.message,
              timestamp: new Date().toISOString()
            });
            throw new AuthenticationError(
              'The verification code has expired. Please request a new code using the /auth/resend-verification-code endpoint.'
            );

          case 'NotAuthorizedException':
            if (error.message.includes('already been confirmed')) {
              console.log('User already confirmed', {
                email,
                errorMessage: error.message,
                timestamp: new Date().toISOString()
              });
              // No lanzar error, simplemente devolver
              return;
            }
            throw new AuthenticationError(
              'Authorization error: ' + error.message
            );

          case 'UserNotFoundException':
            throw new AuthenticationError(
              'User not found. Please register first.'
            );

          case 'LimitExceededException':
            throw new AuthenticationError(
              'Too many attempts. Please wait a few minutes before trying again.'
            );

          default:
            throw new AuthenticationError(
              'Failed to verify email: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Failed to verify email: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  /**
   * Reenvía el código de confirmación para verificar el correo electrónico
   *
   * @param email - La dirección de correo electrónico del usuario
   * @returns Promise<{destination?: string, deliveryMedium?: string, userStatus?: string}> - Detalles de la entrega del código
   * @throws AuthenticationError - Si ocurre un error durante el proceso
   */
  async resendConfirmationCode(email: string): Promise<{destination?: string, deliveryMedium?: string, userStatus?: string}> {
    try {
      // Normalizar el email (convertir a minúsculas y eliminar espacios)
      const normalizedEmail = email.toLowerCase().trim();

      console.log('CognitoService.resendConfirmationCode called', {
        email: normalizedEmail,
        userPoolId: this.userPoolId,
        clientId: this.clientId,
        timestamp: new Date().toISOString()
      });

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        normalizedEmail,
        this.clientId
      );

      console.log('SECRET_HASH generated successfully');

      // Verificar si el usuario existe en Cognito y obtener su estado
      let userStatus = 'UNKNOWN';
      try {
        console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
        const userInfo = await this.getUserByEmail(normalizedEmail);
        userStatus = userInfo.UserStatus || 'UNKNOWN';

        console.log('User exists in Cognito', {
          email: normalizedEmail,
          userStatus: userInfo.UserStatus,
          userCreatedAt: userInfo.UserCreateDate,
          userLastModified: userInfo.UserLastModifiedDate
        });

        // Verificar si el usuario ya está confirmado
        if (userStatus === 'CONFIRMED') {
          console.log('User is already confirmed, no need to resend code', { email: normalizedEmail });
          this.logger.info('User is already confirmed, no need to resend code', { email: normalizedEmail });

          // Devolver información indicando que el usuario ya está confirmado
          return {
            destination: normalizedEmail,
            deliveryMedium: 'EMAIL',
            userStatus: 'CONFIRMED'
          };
        }

      } catch (userError) {
        if ((userError as Error).name === 'UserNotFoundException') {
          console.log('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });
          this.logger.info('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });

          throw new AuthenticationError('User not found. Please register first.');
        } else {
          console.error('Error verifying user existence', {
            error: userError,
            errorName: userError instanceof Error ? userError.name : 'Unknown',
            errorMessage: userError instanceof Error ? userError.message : String(userError),
            email: normalizedEmail
          });

          // Continuamos con el proceso a pesar del error
        }
      }

      console.log('Creating ResendConfirmationCodeCommand', {
        clientId: this.clientId,
        username: normalizedEmail,
        hasSecretHash: !!secretHash,
        userStatus
      });

      const command = new ResendConfirmationCodeCommand({
        ClientId: this.clientId,
        Username: normalizedEmail,
        SecretHash: secretHash,
        ClientMetadata: {
          // Esto puede ayudar a forzar la verificación por email
          'PreferredMfa': 'EMAIL'
        }
      });

      console.log('Sending ResendConfirmationCodeCommand to Cognito');
      const response = await this.client.send(command);

      // Extraer detalles de entrega
      const deliveryDetails = response && response.CodeDeliveryDetails ? {
        destination: response.CodeDeliveryDetails.Destination,
        deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
        attributeName: response.CodeDeliveryDetails.AttributeName
      } : { destination: 'unknown', deliveryMedium: 'unknown' };

      console.log('ResendConfirmationCodeCommand response received', {
        success: true,
        responseType: typeof response,
        hasResponse: !!response,
        timestamp: new Date().toISOString(),
        deliveryDetails
      });

      this.logger.info('Confirmation code resent successfully', {
        email: normalizedEmail,
        deliveryDetails
      });

      // Agregar información importante sobre el código
      console.log('IMPORTANT: A new verification code has been sent. This code:');
      console.log('1. Is valid for a limited time (usually 24 hours)');
      console.log('2. Must be entered exactly as received (6 digits)');
      console.log('3. Should be used with the /auth/verify-email endpoint');
      console.log('4. Will replace any previously sent codes');

      // Devolver detalles de entrega para uso en el servicio de autenticación
      return {
        destination: deliveryDetails.destination,
        deliveryMedium: deliveryDetails.deliveryMedium
      };

    } catch (error) {
      console.error('Error resending confirmation code', {
        error,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        email
      });

      this.logger.error('Error resending confirmation code', {
        error,
        email,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      // Mejorar los mensajes de error para casos específicos
      if (error instanceof Error) {
        switch (error.name) {
          case 'UserNotFoundException':
            throw new AuthenticationError('User not found. Please register first.');

          case 'LimitExceededException':
            throw new AuthenticationError(
              'Too many attempts. Please wait a few minutes before requesting a new code.'
            );

          case 'InvalidParameterException':
            throw new AuthenticationError(
              'Invalid parameters: ' + error.message
            );

          case 'NotAuthorizedException':
            if (error.message.includes('already been confirmed')) {
              return {
                destination: email,
                deliveryMedium: 'EMAIL',
                userStatus: 'CONFIRMED'
              };
            }
            throw new AuthenticationError(
              'Authorization error: ' + error.message
            );

          default:
            throw new AuthenticationError(
              'Failed to resend confirmation code: ' + (error.message || 'Unknown error')
            );
        }
      }

      throw new AuthenticationError(
        'Failed to resend confirmation code: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }
}