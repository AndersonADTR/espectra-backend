// shared/middleware/security/security.service.ts

import { Logger } from '@shared/utils/logger';
import { AuthenticationError } from '@shared/utils/errors';
import { MetricsService } from '@shared/utils/metrics';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { config } from '@shared/config/config.service';

export interface SecurityUser {
  userId: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
}

export class SecurityService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  private readonly verifier: any;

  constructor() {
    this.logger = new Logger('SecurityService');
    this.metrics = new MetricsService('Security');

    this.verifier = CognitoJwtVerifier.create({
      userPoolId: config.getRequired<string>('COGNITO_USER_POOL_ID'),
      tokenUse: "access",
      clientId: config.getRequired<string>('COGNITO_CLIENT_ID')
    });
  }

  async validateToken(token: string): Promise<SecurityUser> {
    try {
      const payload = await this.verifier.verify(token);
      
      const user: SecurityUser = {
        userId: payload.sub,
        email: payload.email,
        roles: payload['custom:roles']?.split(','),
        permissions: payload['custom:permissions']?.split(','),
        metadata: payload
      };

      this.metrics.incrementCounter('TokenValidationSuccess');
      return user;

    } catch (error) {
      this.logger.error('Token validation failed', { error });
      this.metrics.incrementCounter('TokenValidationFailure');
      throw new AuthenticationError('Invalid or expired token');
    }
  }

  async validatePermissions(user: SecurityUser, requiredPermissions: string[]): Promise<boolean> {
    if (!user.permissions) {
      return false;
    }
    return requiredPermissions.every(permission => user.permissions!.includes(permission));
  }

  async validateRoles(user: SecurityUser, requiredRoles: string[]): Promise<boolean> {
    if (!user.roles) {
      return false;
    }
    return requiredRoles.some(role => user.roles!.includes(role));
  }
}