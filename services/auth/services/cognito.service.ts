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
  ListUsersCommand
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

      // Generar SECRET_HASH
      const secretHash = this.calculateSecretHash(
        credentials.email,
        this.clientId
      );

      console.log('Calculated secret hash', { secret: secretHash });

      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: credentials.email,
          PASSWORD: credentials.password,
          SECRET_HASH: secretHash
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

      console.log('User authenticated successfully', {
        email: credentials.email
      });

      return tokens;

    } catch (error) {
      console.log('Error authenticating user', {
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
      console.log('Error getting user from Cognito', { error, email });
      
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