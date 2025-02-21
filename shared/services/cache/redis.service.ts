// shared/services/cache/redis.service.ts

import Redis, { Pipeline } from 'ioredis';
import { config } from '@shared/config/config.service';

export class RedisService {
    private static instance: RedisService;
    private readonly client: Redis;
    private isConnected: boolean = false;

    private constructor() {
        this.client = new Redis({
            host: config.getRequired<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT', 6379),
            //password: config.get<string>('REDIS_PASSWORD'),
            connectTimeout: 10000, // 10 segundos
            commandTimeout: 5000,  // 5 segundos
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log('Redis connection failed multiple times');
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true
        });

        // Manejadores de eventos
        this.client.on('connect', () => {
            this.isConnected = true;
            console.log('Redis client connected');
        });

        this.client.on('error', (error) => {
            this.isConnected = false;
            console.log('Redis client error', { error });
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
            console.log('Redis client not connected, attempting operation anyway');
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
            console.log('Redis connection check failed', { error });
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