// services/auth/services/token.service.ts

import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from '@shared/config/config.service';
import { AuthenticationError } from '@shared/utils/errors';
import { TokenPayload } from '../types/auth.types';
import { RedisService } from '@shared/services/cache/redis.service';
import { ObservabilityService } from "@shared/services/observability/observability.service";

export class TokenService {
  
  private readonly verifier: any;
  private readonly redis: RedisService;
  private readonly observability: ObservabilityService;

  constructor() {
    
    // Solo configuramos el verificador de Cognito
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.getRequired<string>('COGNITO_USER_POOL_ID'),
      tokenUse: "access",
      clientId: config.getRequired<string>('COGNITO_CLIENT_ID')
    });

    this.redis = RedisService.getInstance();
    this.observability = ObservabilityService.getInstance();
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      console.log('TokenService: Verifying token');
      // Verificar si el token está en la blacklist
      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new AuthenticationError('Token has been revoked');
      }

      console.log('TokenService: Token not blacklisted');

      // Verificar el token con Cognito
      const payload = await this.verifier.verify(token);

      console.log('TokenService: Token verified');

      await this.observability.trackAuthEvent('TokenValidationSuccess');

      console.log('TokenService: Tracking auth event');
      
      return {
        sub: payload.sub,
        email: payload.email,
        userType: payload['custom:userType'],
        name: payload.name,
        iat: payload.iat,
        exp: payload.exp
      };

    } catch (error) {
      console.log('Token verification failed', { error });
      await this.observability.trackAuthEvent('TokenValidationFailure');
      
      throw new AuthenticationError(
        'Invalid token: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async invalidateToken(token: string): Promise<void> {
    try {
      const payload = await this.verifier.verify(token);
      
      // Calcular tiempo restante de expiración
      const now = Math.floor(Date.now() / 1000);
      const timeToExpire = payload.exp - now;
      
      if (timeToExpire > 0) {
        // Agregar token a la blacklist
        await this.redis.getClient().setex(
          `blacklist:${token}`,
          timeToExpire,
          'true'
        );
      }

      await this.observability.trackAuthEvent('TokenInvalidated');

    } catch (error) {
      console.log('Error invalidating token', { error });
      throw new AuthenticationError(
        'Failed to invalidate token: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  private async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
        const isConnected = await this.redis.checkConnection();
        if (!isConnected) {
            console.warn('Redis not connected, skipping blacklist check');
            return false;
        }

        const exists = await Promise.race([
            this.redis.getClient().exists(`blacklist:${token}`),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Redis operation timed out')), 5000)
            )
        ]);

        return exists === 1;
    } catch (error) {
        console.warn('Error checking token blacklist', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        // En caso de error con Redis, asumimos que el token es válido
        return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.cleanup();
    } catch (error) {
      console.log('Error cleaning up TokenService', { error });
    }
  }
}