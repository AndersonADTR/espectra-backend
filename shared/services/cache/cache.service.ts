// shared/services/cache/cache.service.ts
import Redis from 'ioredis';
import { config } from '@shared/config/config.service';

export interface CacheOptions {
  ttl?: number;          // Tiempo de vida en segundos
  prefix?: string;       // Prefijo para las claves
  serialize?: boolean;   // Si se debe serializar el valor
}

export class CacheService {
  private static instance: CacheService;
  private readonly redis: Redis;
  private readonly defaultOptions: Required<CacheOptions> = {
    ttl: 3600,           // 1 hora por defecto
    prefix: 'cache:',
    serialize: true
  };
  private isConnected: boolean = false;

  private constructor() {
    this.redis = new Redis({
      host: config.getRequired<string>('REDIS_HOST'),
      port: config.get<number>('REDIS_PORT', 6379),
      connectTimeout: 5000,        // Reduced from 15000
      commandTimeout: 3000,        // Reduced from 10000
      maxRetriesPerRequest: 1,     // Reduced from 2
      enableOfflineQueue: false,   // Changed from true
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed multiple times');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      tls: {}, // Enable TLS
    });

    this.redis.on('error', (err) => {
      console.error('Redis client error', err);
      this.isConnected = false;
    });
    
    this.redis.on('connect', () => {
      console.info('Connected to Redis');
      this.isConnected = true;
    });

    // Conectar al inicializar
    this.connect();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.redis.connect();
      } catch (error) {
        console.error('Failed to connect to Redis', error);
        // Implementar fallback a caché en memoria si es necesario
      }
    }
  }

  private getFullKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.defaultOptions.prefix;
    return `${finalPrefix}${key}`;
  }

  /**
   * Obtiene un valor de la caché
   * @param key Clave a buscar
   * @returns Valor almacenado o null si no existe
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const fullKey = this.getFullKey(key, options.prefix);
      const value = await this.redis.get(fullKey);

      if (!value) {
        return null;
      }

      return options.serialize ?? this.defaultOptions.serialize
        ? JSON.parse(value)
        : value as unknown as T;

    } catch (error) {
      console.error('Error getting cache value', { error, key });
      return null;
    }
  }

  /**
   * Almacena un valor en la caché
   * @param key Clave para almacenar
   * @param value Valor a almacenar
   * @param ttlSeconds Tiempo de vida en segundos (opcional)
   * @returns true si se almacenó correctamente
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    try {
      
      if (!this.isConnected) {
        await this.connect();
      }

      const fullKey = this.getFullKey(key, options.prefix);
      const ttl = options.ttl ?? this.defaultOptions.ttl;
      const shouldSerialize = options.serialize ?? this.defaultOptions.serialize;

      const finalValue = shouldSerialize ? JSON.stringify(value) : String(value);

      await this.redis.set(fullKey, finalValue, 'EX', ttl);
      return true;

    } catch (error) {
      console.error('Error setting cache value', { error, key });
      return false;
    }
  }

  /**
   * Elimina un valor de la caché
   * @param key Clave a eliminar
   * @returns true si se eliminó correctamente
   */
  async delete(key: string, prefix?: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const fullKey = this.getFullKey(key, prefix);
      await this.redis.del(fullKey);
      return true;
    } catch (error) {
      console.error('Error deleting cache value', { error, key });
      return false;
    }
  }

  /**
   * Verifica si una clave existe en la caché
   * @param key Clave a verificar
   * @returns true si la clave existe
   */
  async exists(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, prefix);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      console.error('Error checking cache key existence', { error, key });
      return false;
    }
  }

  /**
   * Establece un tiempo de expiración para una clave
   * @param key Clave a expirar
   * @param ttlSeconds Tiempo de vida en segundos
   * @returns true si se estableció correctamente
   */
  public async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      const result = await this.redis.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      console.error('Error setting expiration for key', { error, key });
      return false;
    }
  }

  async invalidateByPattern(pattern: string): Promise<boolean> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      return true;

    } catch (error) {
      console.error('Error invalidating cache by pattern', { error, pattern });
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error cleaning up cache service', { error });
    }
  }
}