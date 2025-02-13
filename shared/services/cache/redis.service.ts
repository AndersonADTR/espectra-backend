// shared/services/cache/redis.service.ts

import Redis, { Pipeline } from 'ioredis';
import { Logger } from '@shared/utils/logger';
import { config } from '@shared/config/config.service';

export class RedisService {
    private static instance: RedisService;
    private readonly client: Redis;
    private readonly logger: Logger;

    private constructor() {
        this.logger = new Logger('RedisService');
        this.client = new Redis({
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

        this.client.on('error', (error) => {
            this.logger.error('Redis client error', { error });
        });

        this.client.on('connect', () => {
            this.logger.info('Redis client connected');
        });
    }

    static getInstance(): RedisService {
        if (!RedisService.instance) {
            RedisService.instance = new RedisService();
        }
        return RedisService.instance;
    }

    getClient(): Redis {
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

    async cleanup(): Promise<void> {
        await this.client.quit();
    }
}