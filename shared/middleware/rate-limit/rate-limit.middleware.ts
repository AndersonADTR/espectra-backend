// shared/middleware/rate-limit/rate-limit.middleware.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, Context } from 'aws-lambda';
import Redis from 'ioredis';
import { Logger } from '@shared/utils/logger';
import { config } from '@shared/config/config.service';
import { TooManyRequestsError } from '@shared/utils/errors/rate-limit-error';

export interface RateLimitConfig {
  windowMs: number;      // Ventana de tiempo en milisegundos
  max: number;           // Número máximo de intentos por ventana
  keyPrefix?: string;    // Prefijo para las claves en Redis
}

export class RateLimitMiddleware {
  private static logger = new Logger('RateLimitMiddleware');
  private static redis: Redis;

  private static async getRedisClient(): Promise<Redis> {
    if (!this.redis) {
      this.redis = new Redis({
        host: config.getRequired<string>('REDIS_HOST'),
        port: config.get<number>('REDIS_PORT', 6379),
        password: config.get<string>('REDIS_PASSWORD'),
        retryStrategy: (times) => {
          if (times > 3) {
            this.logger.error('Redis connection failed multiple times');
            return null;
          }
          return Math.min(times * 100, 3000);
        }
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis error', { error });
      });
    }

    return this.redis;
  }

  static rateLimit(config: RateLimitConfig) {
    return (handler: APIGatewayProxyHandler): APIGatewayProxyHandler => {
      return async (event: APIGatewayProxyEvent, context: Context) => {
        const redis = await this.getRedisClient();
        
        try {
          // Obtener IP del cliente
          const clientIp = event.requestContext.identity.sourceIp;
          
          // Construir key para Redis
          const key = `${config.keyPrefix || 'rateLimit'}:${clientIp}:${event.path}`;
          
          // Usar Redis para tracking
          const multi = redis.multi();
          multi.incr(key);
          multi.pttl(key);
          
          const [count, ttl] = await multi.exec() as unknown as [number, number][];
          
          // Si es el primer intento, establecer TTL
          if (count[1] === 1) {
            await redis.pexpire(key, config.windowMs);
          }

          // Verificar límite
          if (count[1] > config.max) {
            const resetTime = new Date(Date.now() + ttl[1]);
            
            throw new TooManyRequestsError('Rate limit exceeded', {
              retryAfter: Math.ceil(ttl[1] / 1000),
              resetTime: resetTime.toISOString()
            });
          }

          // Agregar headers de rate limit
          const headers: { [key: string]: string | number | boolean } = {
            'X-RateLimit-Limit': config.max.toString(),
            'X-RateLimit-Remaining': Math.max(0, config.max - count[1]).toString(),
            'X-RateLimit-Reset': new Date(Date.now() + ttl[1]).toISOString()
          };

          // Ejecutar el handler
          const result = await handler(event, context, () => {});

          // Agregar headers al resultado
          return {
            ...result,
            statusCode: result?.statusCode || 200,
            body: result?.body || '',
            headers: {
              ...(result?.headers || {}),
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
                code: 'TOO_MANY_REQUESTS',
                message: (error as TooManyRequestsError).message,
                retryAfter: (error as TooManyRequestsError).metadata?.retryAfter,
                resetTime: (error as TooManyRequestsError).metadata?.resetTime
              })
            };
          }
          throw error;
        }
      };
    };
  }

  static async cleanup(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Configuraciones predefinidas
export const rateLimitPresets = {
  strict: {
    windowMs: 60000,     // 1 minuto
    max: 30,            // 30 intentos por minuto
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