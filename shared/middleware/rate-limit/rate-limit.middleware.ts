// shared/middleware/rate-limit/rate-limit.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { RedisService } from '@shared/services/cache/redis.service';
import { TooManyRequestsError } from '@shared/utils/errors/rate-limit-error';

export interface RateLimitConfig {
  windowMs: number;      // Ventana de tiempo en milisegundos
  max: number;           // Número máximo de intentos por ventana
  keyPrefix?: string;    // Prefijo para las claves en Redis
}

export class RateLimitMiddleware {
  private static logger = new Logger('RateLimitMiddleware');

  static rateLimit(config: RateLimitConfig) {
    return (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => {
      return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
        try {
          // Obtener IP del cliente - compatible con REST API y HTTP API
          const clientIp = event.requestContext?.identity?.sourceIp ||
                          (event.requestContext as any)?.http?.sourceIp ||
                          '127.0.0.1'; // IP por defecto si no se puede determinar

          // Construir key para Redis
          const key = `${config.keyPrefix || 'rateLimit'}:${clientIp}:${event.path}`;

          // Variables para rate limiting
          let count = 1;
          let ttl = config.windowMs;
          let headers: { [key: string]: string | number | boolean } = {};

          try {
            // Obtener instancia del servicio Redis centralizado
            const redisService = RedisService.getInstance();

            // Verificar si Redis está conectado
            const isConnected = await redisService.checkConnection();

            if (isConnected) {
              const redis = redisService.getClient();

              // Usar Redis para tracking
              const multi = redisService.multi();
              multi.incr(key);
              multi.pttl(key);

              const results = await multi.exec();

              if (results) {
                count = results[0][1] as number;
                ttl = results[1][1] as number;

                // Si es el primer intento, establecer TTL
                if (count === 1) {
                  await redis.pexpire(key, config.windowMs);
                  ttl = config.windowMs;
                }

                // Verificar límite
                if (count > config.max) {
                  const resetTime = new Date(Date.now() + ttl);

                  throw new TooManyRequestsError('Rate limit exceeded', {
                    retryAfter: Math.ceil(ttl / 1000),
                    resetTime: resetTime.toISOString()
                  });
                }

                // Agregar headers de rate limit
                headers = {
                  'X-RateLimit-Limit': config.max.toString(),
                  'X-RateLimit-Remaining': Math.max(0, config.max - count).toString(),
                  'X-RateLimit-Reset': new Date(Date.now() + ttl).toISOString()
                };
              } else {
                this.logger.warn('Redis multi command returned null results, skipping rate limiting');
              }
            } else {
              this.logger.warn('Redis is not connected, skipping rate limiting');
            }
          } catch (redisError) {
            // Si hay un error con Redis, lo registramos pero permitimos que la solicitud continúe
            this.logger.error('Error in Redis operations, skipping rate limiting', {
              error: redisError instanceof Error ? redisError.message : String(redisError),
              stack: redisError instanceof Error ? redisError.stack : undefined
            });
          }

          // Ejecutar el handler
          const result = await handler(event, context, () => {});

          // Agregar headers al resultado
          if (!result) {
            return {
              statusCode: 500,
              body: JSON.stringify({
                success: false,
                message: 'Internal server error',
                data: null,
                errors: {
                  server: ['An unexpected error occurred']
                }
              }),
              headers: {
                'Content-Type': 'application/json',
                ...headers
              }
            };
          }

          return {
            ...result,
            statusCode: result.statusCode || 200,
            body: result.body || '',
            headers: {
              ...(result.headers || {}),
              ...headers
            }
          };

        } catch (error) {
          if (error instanceof TooManyRequestsError) {
            const headers: { [key: string]: string | number | boolean } = {
              'Content-Type': 'application/json',
              'Retry-After': error.metadata?.retryAfter?.toString() || '60',
              'X-RateLimit-Reset': (error.metadata?.resetTime?.toString() || new Date(Date.now() + 60000).toISOString())
            };
            return {
              statusCode: 429,
              headers,
              body: JSON.stringify({
                success: false,
                message: 'Too many requests, please try again later',
                data: null,
                errors: {
                  rateLimit: ['Rate limit exceeded. Please try again later.']
                }
              })
            };
          }
          throw error;
        } finally {
          // No cerramos la conexión aquí, ya que el servicio Redis es centralizado
          // y se encarga de su propio ciclo de vida
        }
      };
    };
  }
}

// Configuraciones predefinidas
export const rateLimitPresets = {
  strict: {
    windowMs: 60000,     // 1 minuto
    max: 5,             // 5 intentos por minuto para endpoints críticos
    keyPrefix: 'rl:str'
  },
  moderate: {
    windowMs: 300000,    // 5 minutos
    max: 100,           // 100 intentos por 5 minutos
    keyPrefix: 'rl:mod'
  },
  relaxed: {
    windowMs: 3600000,   // 1 hora
    max: 1000,          // 1000 intentos por hora
    keyPrefix: 'rl:rel'
  }
};

// Helper para uso más simple
export const rateLimit = (config: RateLimitConfig = rateLimitPresets.moderate) =>
  RateLimitMiddleware.rateLimit(config);