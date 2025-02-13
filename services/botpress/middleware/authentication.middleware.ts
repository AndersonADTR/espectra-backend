// services/botpress/middleware/authentication.middleware.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthenticationError, BaseError, ValidationError } from '@shared/utils/errors';
import { BotpressConfig } from '../types/botpress.types';

interface AuthenticatedRequest {
  userId: string;
  userGroups?: string[];
  planType: string;
  metadata?: Record<string, any>;
}

export class AuthenticationMiddleware {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly jwtVerifier: CognitoJwtVerifier<any, any, any>;
  private readonly config: BotpressConfig;

  constructor(config: BotpressConfig) {
    this.logger = new Logger('AuthenticationMiddleware');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.config = config;
    this.config.botId;
    this.jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      clientId: process.env.COGNITO_CLIENT_ID!,
      tokenUse: 'access'
    });
  }

  async authenticate(token: string): Promise<AuthenticatedRequest> {
    try {
      if (!token) {
        throw new ValidationError('No authentication token provided');
      }

      const startTime = Date.now();
      const payload = await this.jwtVerifier.verify(token);
      
      this.metrics.recordLatency('AuthenticationTime', Date.now() - startTime);

      if (!payload.sub) {
        throw new AuthenticationError('Invalid token payload');
      }

      const authRequest: AuthenticatedRequest = {
        userId: payload.sub,
        userGroups: payload['cognito:groups'],
        planType: this.getPlanType(payload),
        metadata: this.extractMetadata(payload)
      };

      this.metrics.incrementCounter('SuccessfulAuthentications');
      
      this.logger.info('User authenticated successfully', {
        userId: authRequest.userId,
        planType: authRequest.planType
      });

      return authRequest;
    } catch (error) {
      this.metrics.incrementCounter('FailedAuthentications');
      
      this.logger.error('Authentication failed', { error });
      
      if (error instanceof ValidationError) {
        throw error;
      }

      throw new AuthenticationError('Authentication failed', {
        originalError: (error as BaseError).message
      });
    }
  }

  async validatePermissions(
    userId: string,
    requiredPermissions: string[]
  ): Promise<boolean> {
    try {
      // Obtener permisos del usuario desde DynamoDB o caché
      const userPermissions = await this.getUserPermissions(userId);

      const hasPermissions = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!hasPermissions) {
        this.metrics.incrementCounter('InsufficientPermissions');
        
        this.logger.warn('Insufficient permissions', {
          userId,
          requiredPermissions,
          userPermissions
        });
      }

      return hasPermissions;
    } catch (error) {
      this.logger.error('Failed to validate permissions', {
        error,
        userId,
        requiredPermissions
      });
      throw error;
    }
  }

  async validateBotpressAccess(userId: string, planType: string): Promise<void> {
    try {
      // Verificar si el usuario tiene acceso activo a Botpress
      const hasAccess = await this.checkBotpressAccess(userId, planType);

      if (!hasAccess) {
        this.metrics.incrementCounter('AccessDenied');
        
        throw new AuthenticationError('No active Botpress access', {
          userId,
          planType
        });
      }

      this.metrics.incrementCounter('AccessGranted');
    } catch (error) {
      this.logger.error('Failed to validate Botpress access', {
        error,
        userId,
        planType
      });
      throw error;
    }
  }

  private getPlanType(payload: any): string {
    // Extraer plan del token o claims
    const plan = payload['custom:plan'] || 'basic';
    
    // Validar que sea un plan válido
    const validPlans = ['basic', 'pro', 'business', 'enterprise'];
    return validPlans.includes(plan) ? plan : 'basic';
  }

  private extractMetadata(payload: any): Record<string, any> {
    return {
      email: payload.email,
      emailVerified: payload.email_verified,
      lastAuthenticated: new Date().toISOString(),
      customAttributes: Object.keys(payload)
        .filter(key => key.startsWith('custom:'))
        .reduce((acc, key) => ({
          ...acc,
          [key.replace('custom:', '')]: payload[key]
        }), {})
    };
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    // Implementar lógica para obtener permisos del usuario
    // Esto podría venir de DynamoDB, Redis, o otro almacenamiento
    userId.length;
    return ['botpress:chat', 'botpress:history'];
  }

  private async checkBotpressAccess(
    userId: string,
    planType: string
  ): Promise<boolean> {
    // Verificar acceso basado en plan y estado de la cuenta
    // Esto podría incluir verificación de pagos, límites, etc.
    return userId === 'admin' || planType !== 'basic';
  }

  public createAuthContext(authRequest: AuthenticatedRequest): Record<string, any> {
    return {
      userId: authRequest.userId,
      planType: authRequest.planType,
      timestamp: new Date().toISOString(),
      metadata: {
        ...authRequest.metadata,
        groups: authRequest.userGroups
      }
    };
  }
}