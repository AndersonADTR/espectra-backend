// services/botpress/types/cache.types.ts

export interface CacheConfig {
    ttl: number;
    prefix: string;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}