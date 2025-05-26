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
      // Log directo a CloudWatch para verificar que los logs se están enviando
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: TokenService.verifyToken called',
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      }));

      console.log('TokenService: Verifying token', {
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null'
      });

      if (!token || token.trim() === '') {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Empty JWT provided',
          timestamp: new Date().toISOString()
        }));
        throw new AuthenticationError('Empty JWT provided');
      }

      // Verificar si el token está en la blacklist
      let isBlacklisted = false;
      try {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Checking if token is blacklisted',
          timestamp: new Date().toISOString()
        }));
        isBlacklisted = await this.isTokenBlacklisted(token);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token blacklist check result',
          isBlacklisted,
          timestamp: new Date().toISOString()
        }));
      } catch (redisError) {
        // Si hay un error con Redis, asumimos que el token no está en la blacklist
        // y continuamos con la verificación
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error checking token blacklist',
          error: redisError instanceof Error ? redisError.message : String(redisError),
          stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        }));
        console.warn('Error checking token blacklist, assuming token valid', {
          error: redisError instanceof Error ? redisError.message : String(redisError)
        });
        isBlacklisted = false;
      }

      if (isBlacklisted) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token has been revoked',
          timestamp: new Date().toISOString()
        }));
        throw new AuthenticationError('Token has been revoked');
      }

      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: Token not blacklisted, verifying with Cognito',
        timestamp: new Date().toISOString()
      }));
      console.log('TokenService: Token not blacklisted');

      // Verificar el token con Cognito
      try {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Verifying token with Cognito',
          timestamp: new Date().toISOString()
        }));
        const payload = await this.verifier.verify(token);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token verified successfully',
          sub: payload.sub,
          username: payload.username || payload.sub,
          hasEmail: !!payload.email,
          timestamp: new Date().toISOString()
        }));
        console.log('TokenService: Token verified');

        try {
          await this.observability.trackAuthEvent('TokenValidationSuccess');
          console.log('TokenService: Tracking auth event');
        } catch (observabilityError) {
          // Si hay un error con el servicio de observabilidad, lo registramos pero continuamos
          console.log(JSON.stringify({
            message: 'CLOUDWATCH DEBUG: Error tracking auth event',
            error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError),
            timestamp: new Date().toISOString()
          }));
          console.warn('Error tracking auth event', {
            error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
          });
        }

        // Imprimir el payload completo para depuración
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token payload',
          payload: JSON.stringify(payload),
          timestamp: new Date().toISOString()
        }));
        console.log('TokenService: Token payload', JSON.stringify(payload, null, 2));

        // Extraer el username (que es el sub en Cognito)
        const sub = payload.sub;

      // Crear el objeto TokenPayload con los campos disponibles
      return {
        sub: sub,
        // El email puede no estar presente en el token de acceso
        email: payload.email || '',
        // El userType puede estar en custom:userType o no estar presente
        userType: payload['custom:userType'] || 'basic',
        // El nombre puede no estar presente
        name: payload.name || '',
        iat: payload.iat,
        exp: payload.exp,
        // Agregar el username para poder buscar al usuario
        username: payload.username || sub
      };

      } catch (cognitoError) {
        // Si hay un error con Cognito, lo registramos y lanzamos una excepción
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error verifying token with Cognito',
          error: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
          stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        }));
        console.error('Error verifying token with Cognito', {
          error: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
          stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
        });

        try {
          await this.observability.trackAuthEvent('TokenValidationFailure');
        } catch (observabilityError) {
          console.warn('Error tracking token validation failure', {
            error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
          });
        }

        throw new AuthenticationError(
          'Invalid token: ' + ((cognitoError as Error).message || 'Unknown error')
        );
      }
    } catch (error) {
      // Log detallado del error
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: Error in verifyToken',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      }));
      console.error('Error verifying token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      try {
        await this.observability.trackAuthEvent('TokenValidationFailure');
      } catch (observabilityError) {
        console.warn('Error tracking token validation failure', {
          error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
        });
      }

      throw new AuthenticationError(
        'Invalid token: ' + ((error as Error).message || 'Unknown error')
      );
    }
  }

  async invalidateToken(token: string): Promise<void> {
    try {
      // Log directo a CloudWatch para verificar que los logs se están enviando
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: TokenService.invalidateToken called',
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
        timestamp: new Date().toISOString()
      }));

      console.log('TokenService: Invalidating token', {
        tokenLength: token ? token.length : 0,
        tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null'
      });

      // Verificar el token con Cognito
      let payload;
      try {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Verifying token before invalidation',
          timestamp: new Date().toISOString()
        }));
        payload = await this.verifier.verify(token);
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token verified successfully',
          sub: payload.sub,
          username: payload.username || payload.sub,
          hasEmail: !!payload.email,
          timestamp: new Date().toISOString()
        }));
      } catch (verifyError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error verifying token before invalidation',
          error: verifyError instanceof Error ? verifyError.message : String(verifyError),
          stack: verifyError instanceof Error ? verifyError.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        }));
        console.error('Error verifying token before invalidation', {
          error: verifyError instanceof Error ? verifyError.message : String(verifyError),
          stack: verifyError instanceof Error ? verifyError.stack : 'No stack trace'
        });

        // Si el token no se puede verificar, asumimos que ya está invalidado
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token is already invalid or expired',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // Calcular tiempo restante de expiración
      const now = Math.floor(Date.now() / 1000);
      const timeToExpire = payload.exp - now;

      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: Token expiration details',
        timeToExpire,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        now: new Date(now * 1000).toISOString(),
        timestamp: new Date().toISOString()
      }));

      if (timeToExpire <= 0) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token is already expired, no need to blacklist',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // Verificar si Redis está disponible
      const isConnected = await this.redis.checkConnection().catch(() => false);

      if (!isConnected) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Redis is not connected, cannot blacklist token',
          timestamp: new Date().toISOString()
        }));
        console.warn('Redis is not connected, cannot blacklist token');
        // No lanzamos error para no interrumpir el flujo de logout
        return;
      }

      // Agregar token a la blacklist
      try {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Adding token to blacklist',
          timeToExpire,
          timestamp: new Date().toISOString()
        }));

        await Promise.race([
          this.redis.getClient().setex(
            `blacklist:${token}`,
            timeToExpire,
            'true'
          ),
          new Promise<string>((_, reject) =>
            setTimeout(() => {
              console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Redis operation timed out',
                timestamp: new Date().toISOString()
              }));
              reject(new Error('Redis operation timed out'));
            }, 3000)
          )
        ]);

        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token added to blacklist successfully',
          timestamp: new Date().toISOString()
        }));
      } catch (redisError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error adding token to blacklist',
          error: redisError instanceof Error ? redisError.message : String(redisError),
          stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        }));
        console.warn('Error adding token to blacklist', {
          error: redisError instanceof Error ? redisError.message : String(redisError),
          stack: redisError instanceof Error ? redisError.stack : 'No stack trace'
        });
        // No lanzamos error para no interrumpir el flujo de logout
      }

      // Registrar evento de observabilidad
      try {
        await this.observability.trackAuthEvent('TokenInvalidated');
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Token invalidation event tracked',
          timestamp: new Date().toISOString()
        }));
      } catch (observabilityError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error tracking token invalidation event',
          error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError),
          timestamp: new Date().toISOString()
        }));
        console.warn('Error tracking token invalidation event', {
          error: observabilityError instanceof Error ? observabilityError.message : String(observabilityError)
        });
        // No lanzamos error para no interrumpir el flujo de logout
      }

    } catch (error) {
      // Log detallado del error
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: Error in invalidateToken',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      }));
      console.error('Error invalidating token', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });

      // No lanzamos error para no interrumpir el flujo de logout
      // En lugar de lanzar un error, simplemente registramos el error y continuamos
    }
  }

  private async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
        // Log directo a CloudWatch para verificar que los logs se están enviando
        console.log(JSON.stringify({
            message: 'CLOUDWATCH DEBUG: Checking if token is blacklisted in Redis',
            tokenLength: token ? token.length : 0,
            tokenFirstChars: token ? token.substring(0, 10) + '...' : 'null',
            timestamp: new Date().toISOString()
        }));

        // Verificar si Redis está disponible
        const isConnected = await this.redis.checkConnection().catch(() => false);

        if (!isConnected) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Redis is not connected, assuming token is valid',
                timestamp: new Date().toISOString()
            }));
            console.warn('Redis is not connected, assuming token is valid');
            return false;
        }

        console.log(JSON.stringify({
            message: 'CLOUDWATCH DEBUG: Redis is connected, checking blacklist',
            timestamp: new Date().toISOString()
        }));

        // Verificar si el token está en la blacklist con un timeout
        const exists = await Promise.race([
            this.redis.getClient().exists(`blacklist:${token}`),
            new Promise<number>((_, reject) =>
                setTimeout(() => {
                    console.log(JSON.stringify({
                        message: 'CLOUDWATCH DEBUG: Redis operation timed out',
                        timestamp: new Date().toISOString()
                    }));
                    reject(new Error('Redis operation timed out'));
                }, 3000)
            )
        ]);

        console.log(JSON.stringify({
            message: 'CLOUDWATCH DEBUG: Token blacklist check result',
            exists,
            isBlacklisted: exists === 1,
            timestamp: new Date().toISOString()
        }));

        return exists === 1;
    } catch (error) {
        // Log detallado del error
        console.log(JSON.stringify({
            message: 'CLOUDWATCH DEBUG: Error checking token blacklist',
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace',
            timestamp: new Date().toISOString()
        }));
        console.warn('Error checking token blacklist, assuming token valid', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        return false;
    }
}

  async cleanup(): Promise<void> {
    try {
      // Log directo a CloudWatch para verificar que los logs se están enviando
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: TokenService.cleanup called',
        timestamp: new Date().toISOString()
      }));

      console.log('TokenService: Cleaning up');

      // Verificar si Redis está disponible
      const isConnected = await this.redis.checkConnection().catch(() => false);

      if (!isConnected) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Redis is not connected, skipping cleanup',
          timestamp: new Date().toISOString()
        }));
        console.warn('Redis is not connected, skipping cleanup');
        return;
      }

      // Limpiar Redis
      try {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Cleaning up Redis',
          timestamp: new Date().toISOString()
        }));

        await Promise.race([
          this.redis.cleanup(),
          new Promise<void>((_, reject) =>
            setTimeout(() => {
              console.log(JSON.stringify({
                message: 'CLOUDWATCH DEBUG: Redis cleanup operation timed out',
                timestamp: new Date().toISOString()
              }));
              reject(new Error('Redis cleanup operation timed out'));
            }, 3000)
          )
        ]);

        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Redis cleaned up successfully',
          timestamp: new Date().toISOString()
        }));
      } catch (redisError) {
        console.log(JSON.stringify({
          message: 'CLOUDWATCH DEBUG: Error cleaning up Redis',
          error: redisError instanceof Error ? redisError.message : String(redisError),
          stack: redisError instanceof Error ? redisError.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        }));
        console.warn('Error cleaning up Redis', {
          error: redisError instanceof Error ? redisError.message : String(redisError),
          stack: redisError instanceof Error ? redisError.stack : 'No stack trace'
        });
      }
    } catch (error) {
      // Log detallado del error
      console.log(JSON.stringify({
        message: 'CLOUDWATCH DEBUG: Error in cleanup',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        timestamp: new Date().toISOString()
      }));
      console.error('Error cleaning up TokenService', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
    }
  }
}