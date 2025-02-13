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
  AdminDeleteUserCommand
} from "@aws-sdk/client-cognito-identity-provider";
import * as crypto from 'crypto';
import { NodeHttpHandler } from "@aws-sdk/node-http-handler";
import { Logger } from '@shared/utils/logger';
import { config } from '@shared/config/config.service';
import { AuthenticationError, ValidationError } from '@shared/utils/errors';
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

  async refreshUserTokens(refreshToken: string): Promise<any> {
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken
        }
      });

      return await this.client.send(command);
      
    } catch (error) {
      this.logger.error('Error refreshing user tokens', { error });
      
      if ((error as Error).name === 'NotAuthorizedException') {
        throw new AuthenticationError('Invalid refresh token');
      }

      throw new AuthenticationError(
        'Failed to refresh tokens: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private calculateSecretHash(username: string, clientId: string, clientSecret: string): string {
    const message = username + clientId;
    const hmac = crypto.createHmac('SHA256', clientSecret);
    const secretHash = hmac.update(message).digest('base64');
    return secretHash;
  }

  async registerUser(credentials: RegisterCredentials): Promise<void> {
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
        this.clientId,
        process.env.COGNITO_CLIENT_SECRET || ''
      );

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
      await this.client.send(command);
      const duration = Date.now() - startTime;

      console.log('Cognito registration complete', { 
          email: credentials.email,
          duration
      });

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
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: credentials.email,
          PASSWORD: credentials.password
        }
      });

      const response = await this.client.send(command);
      
      if (!response.AuthenticationResult) {
        throw new AuthenticationError('Authentication failed: No tokens received');
      }

      const tokens: AuthTokens = {
        accessToken: response.AuthenticationResult.AccessToken!,
        refreshToken: response.AuthenticationResult.RefreshToken!,
        idToken: response.AuthenticationResult.IdToken!,
        expiresIn: response.AuthenticationResult.ExpiresIn || 3600
      };

      this.logger.info('User authenticated successfully', {
        email: credentials.email
      });

      return tokens;

    } catch (error) {
      this.logger.error('Error authenticating user', {
        error,
        email: credentials.email
      });

      if ((error as Error).name === 'NotAuthorizedException') {
        throw new AuthenticationError('Invalid credentials');
      }

      if ((error as Error).name === 'UserNotFoundException') {
        throw new AuthenticationError('User not found');
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

  async getUserByEmail(email: string): Promise<Record<string, string>> {
    try {
      const command = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: email
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

      return attributes;

    } catch (error) {
      this.logger.error('Error getting user from Cognito', { error, email });
      
      if ((error as Error).name === 'UserNotFoundException') {
        throw new AuthenticationError('User not found');
      }

      throw new AuthenticationError(
        'Failed to get user: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      const command = new GlobalSignOutCommand({
        AccessToken: accessToken
      });

      await this.client.send(command);
      
      this.logger.info('User signed out successfully');

    } catch (error) {
      this.logger.error('Error signing out user', { error });
      throw new AuthenticationError(
        'Failed to sign out: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }
}