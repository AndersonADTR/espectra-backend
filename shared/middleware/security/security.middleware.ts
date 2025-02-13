// shared/middleware/security/security.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { SecurityService } from './security.service';
import { ForbiddenError } from '@shared/utils/errors';
import { SecurityContextManager } from './security.context';
import { MetricsService } from '@shared/utils/metrics';

export interface SecurityOptions {
  requireAuth?: boolean;
  roles?: string[];
  permissions?: string[];
  ipWhitelist?: string[];
  customValidation?: (event: APIGatewayProxyEvent) => Promise<boolean>;
}

export class SecurityMiddleware {
  private static logger = new Logger('SecurityMiddleware');
  private static securityService = new SecurityService();
  private static metrics = new MetricsService('Security');

  static secure(options: SecurityOptions = {}) {
    return (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => {
      return async (event: APIGatewayProxyEvent, context: Context, callback: Callback) => {
        const startTime = Date.now();
        
        try {
          const contextManager = SecurityContextManager.getInstance();

          return await contextManager.run({
            traceId: context.awsRequestId,
            requestId: event.requestContext.requestId
          }, async () => {
            try {
              // Validar IP si hay whitelist
              if (options.ipWhitelist?.length) {
                const clientIp = event.requestContext.identity.sourceIp;
                if (!options.ipWhitelist.includes(clientIp)) {
                  this.metrics.incrementCounter('IpWhitelistRejection');
                  throw new ForbiddenError('IP not allowed');
                }
              }

              // Validar autenticación si es requerida
              if (options.requireAuth) {
                const token = this.extractToken(event);
                const user = await this.securityService.validateToken(token);

                // Validar roles
                if (options.roles?.length) {
                  const hasRole = options.roles.some(role => 
                    user.roles?.includes(role)
                  );
                  if (!hasRole) {
                    this.metrics.incrementCounter('InsufficientRoleRejection');
                    throw new ForbiddenError('Insufficient roles');
                  }
                }

                // Validar permisos
                if (options.permissions?.length) {
                  const hasPermissions = options.permissions.every(permission =>
                    user.permissions?.includes(permission)
                  );
                  if (!hasPermissions) {
                    this.metrics.incrementCounter('InsufficientPermissionsRejection');
                    throw new ForbiddenError('Insufficient permissions');
                  }
                }

                contextManager.updateContext({ user });
                this.metrics.incrementCounter('AuthenticationSuccess');
              }

              // Validación customizada
              if (options.customValidation) {
                const isValid = await options.customValidation(event);
                if (!isValid) {
                  this.metrics.incrementCounter('CustomValidationRejection');
                  throw new ForbiddenError('Custom validation failed');
                }
              }

              const result = await handler(event, context, callback);
              
              // Registrar métricas de latencia
              const duration = Date.now() - startTime;
              this.metrics.recordLatency('RequestDuration', duration);

              return result;
              
            } catch (error) {
              this.logger.error('Security check failed', { error });
              this.metrics.incrementCounter('SecurityCheckFailure');
              throw error;
            }
          });
        } catch (error) {
          this.logger.error('Security check failed', { error });
          this.metrics.incrementCounter('SecurityCheckFailure');
          throw error;
        }
      };
    };
  }

  private static extractToken(event: APIGatewayProxyEvent): string {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      this.metrics.incrementCounter('MissingAuthToken');
      throw new ForbiddenError('No authorization token provided');
    }
    return authHeader.replace('Bearer ', '');
  }
}