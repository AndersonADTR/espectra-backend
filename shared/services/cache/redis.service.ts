// shared/services/cache/redis.service.ts

import Redis, { Pipeline } from 'ioredis';
import { config } from '@shared/config/config.service';

export class RedisService {
    private static instance: RedisService;
    private readonly client: Redis;
    private isConnected: boolean = false;
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 5;
    private circuitOpen: boolean = false;
    private circuitResetTimeout: NodeJS.Timeout | null = null;

    private constructor() {

        this.client = new Redis({
            host: config.getRequired<string>('REDIS_HOST'),
            port: config.get<number>('REDIS_PORT', 6379),
            connectTimeout: 5000,        // Reduced from 15000
            commandTimeout: 3000,        // Reduced from 10000
            maxRetriesPerRequest: 1,     // Reduced from 2
            enableOfflineQueue: false,   // Changed from true
            retryStrategy: (times: number) => {
                this.reconnectAttempts = times;
                console.info('Redis reconnect attempt ${times}');
                
                if (times > 2) { // Reduced from 5
                    console.error('Max reconnect attempts (${times}) reached');
                    this.circuitOpen = true;
                    return null;
                }
                
                return Math.min(times * 100, 1000); // Faster retry strategy
            },
            tls: {}, // Enable TLS
        });

        // Manejadores de eventos
        this.client.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.circuitOpen = false;
            console.info('Redis client connected');
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            console.info('Redis client ready');
        });

        this.client.on('error', (error) => {
            console.error('Redis client error', { 
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            
            if (this.reconnectAttempts > this.maxReconnectAttempts) {
                this.circuitOpen = true;
            }
        });

        this.client.on('close', () => {
            this.isConnected = false;
            console.info('Redis connection closed');
        });

        this.client.on('reconnecting', (delay: number) => {
            console.info('Redis client reconnecting', { delay });
        });

        this.diagnoseConnection();
        
        // Verificar conexión al inicio
        this.checkConnection().catch(err => {
            console.warn('Initial Redis connection check failed', { 
                error: err instanceof Error ? err.message : String(err)
            });
        });
    }

    static getInstance(): RedisService {
        if (!RedisService.instance) {
            RedisService.instance = new RedisService();
        }
        return RedisService.instance;
    }

    getClient(): Redis {
        if (this.circuitOpen) {
            console.warn('Circuit breaker is open, Redis operations will fail fast');
        } else if (!this.isConnected) {
            console.warn('Redis client not connected, attempting operation anyway');
        }
        return this.client;
    }

    private async diagnoseConnection(): Promise<void> {
        try {
            const networkInfo = {
                host: this.client.options.host,
                port: this.client.options.port,
                connected: this.client.status === 'ready'
            };
            
            console.info('Redis connection diagnostic:', networkInfo);
            
            // Test basic operation
            await this.client.set('diagnostic_test', 'test', 'EX', 10);
            const result = await this.client.get('diagnostic_test');
            console.info('Redis test operation result:', result === 'test');
        } catch (error) {
            console.error('Redis diagnostic failed:', error);
        }
    }

    async checkConnection(): Promise<boolean> {
        if (this.circuitOpen) {
            console.warn('Circuit breaker is open, skipping connection check');
            return false;
        }
        
        try {
            const result = await Promise.race([
                this.client.ping(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Redis ping timed out')), 2000) // Reduced timeout
                )
            ]);
            
            this.isConnected = result === 'PONG';
            return this.isConnected;
        } catch (error) {
            console.warn('Redis connection check failed', { 
                error: error instanceof Error ? error.message : String(error) 
            });
            
            this.isConnected = false;
            return false;
        }
    }

    // async checkConnection(): Promise<boolean> {
    //     // Si el circuit breaker está abierto, fallar rápido
    //     if (this.circuitOpen) {
    //         console.warn('Circuit breaker is open, skipping connection check');
    //         return false;
    //     }
        
    //     // Si ya hay una verificación en curso, reutilizarla
    //     if (this.connectionCheckPromise) {
    //         return this.connectionCheckPromise;
    //     }
        
    //     // Crear una nueva promesa de verificación
    //     this.connectionCheckPromise = new Promise<boolean>(async (resolve) => {
    //         try {
    //             const result = await Promise.race([
    //                 this.client.ping(),
    //                 new Promise((_, reject) => 
    //                     setTimeout(() => reject(new Error('Redis ping timed out')), 5000)
    //                 )
    //             ]);
                
    //             this.isConnected = result === 'PONG';
    //             resolve(this.isConnected);
    //         } catch (error) {
    //             console.warn('Redis connection check failed', { 
    //                 error: error instanceof Error ? error.message : String(error) 
    //             });
                
    //             this.isConnected = false;
    //             resolve(false);
    //         } finally {
    //             // Limpiar la promesa después de 10 segundos para permitir una nueva verificación
    //             setTimeout(() => {
    //                 this.connectionCheckPromise = null;
    //             }, 10000);
    //         }
    //     });
        
    //     return this.connectionCheckPromise;
    // }

    async set(key: string, value: string, ...args: any[]): Promise<string | null> {
        if (this.circuitOpen) return null;
        
        try {
            return await Promise.race([
                this.client.set(key, value, ...args),
                new Promise<null>((_, reject) => 
                    setTimeout(() => reject(new Error('Redis set operation timed out')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('Redis set operation failed', { 
                error: error instanceof Error ? error.message : String(error),
                key
            });
            return null;
        }
    }

    async get(key: string): Promise<string | null> {
        if (this.circuitOpen) return null;
        
        try {
            return await Promise.race([
                this.client.get(key),
                new Promise<null>((_, reject) => 
                    setTimeout(() => reject(new Error('Redis get operation timed out')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('Redis get operation failed', { 
                error: error instanceof Error ? error.message : String(error),
                key
            });
            return null;
        }
    }

    async del(...keys: string[]): Promise<number> {
        if (this.circuitOpen) return 0;
        
        try {
            return await Promise.race([
                this.client.del(...keys),
                new Promise<0>((_, reject) => 
                    setTimeout(() => reject(new Error('Redis del operation timed out')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('Redis del operation failed', { 
                error: error instanceof Error ? error.message : String(error),
                keys
            });
            return 0;
        }
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        if (this.circuitOpen) return 0;
        
        try {
            return await Promise.race([
                this.client.sadd(key, ...members),
                new Promise<0>((_, reject) => 
                    setTimeout(() => reject(new Error('Redis sadd operation timed out')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('Redis sadd operation failed', { 
                error: error instanceof Error ? error.message : String(error),
                key,
                members
            });
            return 0;
        }
    }

    async exists(key: string): Promise<number> {
        if (this.circuitOpen) return 0;
        
        try {
            return await Promise.race([
                this.client.exists(key),
                new Promise<0>((_, reject) => 
                    setTimeout(() => reject(new Error('Redis exists operation timed out')), 5000)
                )
            ]);
        } catch (error) {
            console.warn('Redis exists operation failed', { 
                error: error instanceof Error ? error.message : String(error),
                key
            });
            return 0;
        }
    }

    multi(): Pipeline {
        return this.client.multi() as Pipeline;
    }

    async cleanup(): Promise<void> {
        try {
            if (this.circuitResetTimeout) {
                clearTimeout(this.circuitResetTimeout);
            }
            
            if (this.isConnected) {
                await Promise.race([
                    this.client.quit(),
                    new Promise<void>((resolve) => setTimeout(resolve, 1000))
                ]);
            }
            
            this.isConnected = false;
            console.info('Redis service cleaned up');
        } catch (error) {
            console.error('Error in Redis cleanup', { 
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}