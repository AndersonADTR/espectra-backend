// services/auth/utils/token-refresh.helper.ts

import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('TokenRefreshHelper');

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  idToken?: string;
  error?: string;
}

export class TokenRefreshHelper {
  private static cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1'
  });

  /**
   * SPECTRUM: Refresh access token using refresh token
   * Útil para mantener sesiones activas sin requerir login
   */
  public static async refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult> {
    try {
      logger.info('SPECTRUM: Attempting to refresh access token');

      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: process.env.COGNITO_CLIENT_ID!,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          SECRET_HASH: process.env.COGNITO_CLIENT_SECRET ? 
            await this.calculateSecretHash(refreshToken) : undefined
        }
      });

      const response = await this.cognitoClient.send(command);

      if (response.AuthenticationResult?.AccessToken) {
        logger.info('SPECTRUM: Token refresh successful');
        
        return {
          success: true,
          accessToken: response.AuthenticationResult.AccessToken,
          idToken: response.AuthenticationResult.IdToken
        };
      } else {
        logger.warn('SPECTRUM: Token refresh failed - no tokens in response');
        return {
          success: false,
          error: 'No tokens received from Cognito'
        };
      }

    } catch (error) {
      logger.error('SPECTRUM: Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Calculate secret hash for Cognito (if client secret is configured)
   */
  private static async calculateSecretHash(username: string): Promise<string> {
    const crypto = await import('crypto');
    const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
    const clientId = process.env.COGNITO_CLIENT_ID!;
    
    return crypto
      .createHmac('sha256', clientSecret)
      .update(username + clientId)
      .digest('base64');
  }

  /**
   * SPECTRUM: Check if token is close to expiration
   * Útil para determinar cuándo hacer refresh preventivo
   */
  public static isTokenNearExpiration(token: string, bufferMinutes: number = 5): boolean {
    try {
      // Decode JWT payload (sin verificar firma - solo para leer exp)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const expirationTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const bufferTime = bufferMinutes * 60 * 1000; // Convert minutes to milliseconds

      return (expirationTime - currentTime) <= bufferTime;
    } catch (error) {
      logger.warn('SPECTRUM: Could not decode token for expiration check', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return true; // Assume expired if we can't decode
    }
  }

  /**
   * SPECTRUM: Get token expiration info
   * Útil para debugging y logging
   */
  public static getTokenExpirationInfo(token: string): {
    isValid: boolean;
    expiresAt?: Date;
    minutesUntilExpiration?: number;
  } {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const expirationTime = payload.exp * 1000;
      const currentTime = Date.now();
      const minutesUntilExpiration = Math.floor((expirationTime - currentTime) / (1000 * 60));

      return {
        isValid: expirationTime > currentTime,
        expiresAt: new Date(expirationTime),
        minutesUntilExpiration
      };
    } catch (error) {
      return {
        isValid: false
      };
    }
  }
}
