// shared/services/cache/redis.service.ts

import Redis, { Pipeline } from 'ioredis';
import { config } from '@shared/config/config.service';

export class RedisService {
    private static instance: RedisService;
    private readonly client: Redis;
    private isConnected: boolean = false;

    private constructor() {
        this.client = new Redis({
            host: "master.espectra-backend-dev-redis.xvy4ni.use1.cache.amazonaws.com",//config.getRequired<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT', 6379),
            //password: config.get<string>('REDIS_PASSWORD'), // Descomenta si usas contraseña
            connectTimeout: 20000, // Aumentamos a 20 segundos
            commandTimeout: 10000,  // Aumentamos a 10 segundos
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log('Redis connection failed multiple times');
                    return null; // Detener los reintentos después de 3 intentos
                }
                return Math.min(times * 100, 3000); // Reintentar con un retraso creciente
            },
            maxRetriesPerRequest: 3, // Máximo de reintentos por operación
            enableReadyCheck: true // Verificar si Redis está listo
        });

        // Manejadores de eventos
        this.client.on('connect', () => {
            this.isConnected = true;
            console.log('Redis client connected');
        });

        this.client.on('error', (error) => {
            this.isConnected = false;
            console.error('Redis client error', { error });
        });

        this.client.on('close', () => {
            this.isConnected = false;
            console.log('Redis connection closed');
        });

        this.client.on('reconnecting', (delay: any) => {
            console.log('Redis client reconnecting', { delay });
        });
    }

    static getInstance(): RedisService {
        if (!RedisService.instance) {
            RedisService.instance = new RedisService();
        }
        return RedisService.instance;
    }

    getClient(): Redis {
        if (!this.isConnected) {
            console.warn('Redis client not connected, attempting operation anyway');
        }
        return this.client;
    }

    async set(key: string, value: string, ...args: any[]): Promise<string> {
        return await this.client.set(key, value, ...args);
    }

    async get(key: string): Promise<string | null> {
        return await this.client.get(key);
    }

    async del(...keys: string[]): Promise<number> {
        return await this.client.del(...keys);
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        return await this.client.sadd(key, ...members);
    }

    multi(): Pipeline {
        return this.client.multi() as Pipeline;
    }

    async checkConnection(): Promise<boolean> {
        try {
            await this.client.ping();
            return true;
        } catch (error) {
            console.error('Redis connection check failed', { error });
            return false;
        }
    }

    async cleanup(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
        }
    }
}