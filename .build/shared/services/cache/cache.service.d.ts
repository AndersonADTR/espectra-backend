export interface CacheOptions {
    ttl?: number;
    prefix?: string;
    serialize?: boolean;
}
export declare class CacheService {
    private static instance;
    private readonly redisService;
    private readonly defaultOptions;
    private constructor();
    static getInstance(): CacheService;
    private getFullKey;
    get<T>(key: string, options?: CacheOptions): Promise<T | null>;
    set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean>;
    delete(key: string, prefix?: string): Promise<boolean>;
    exists(key: string, prefix?: string): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    invalidateByPattern(pattern: string): Promise<boolean>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=cache.service.d.ts.map