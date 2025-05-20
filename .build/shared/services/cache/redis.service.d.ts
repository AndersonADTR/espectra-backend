import Redis, { Pipeline } from 'ioredis';
export declare class RedisService {
    private static instance;
    private readonly client;
    private isConnected;
    private reconnectAttempts;
    private readonly maxReconnectAttempts;
    private circuitOpen;
    private circuitResetTimeout;
    private constructor();
    static getInstance(): RedisService;
    getClient(): Redis;
    private diagnoseConnection;
    checkConnection(): Promise<boolean>;
    set(key: string, value: string, ...args: any[]): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    exists(key: string): Promise<number>;
    multi(): Pipeline;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=redis.service.d.ts.map