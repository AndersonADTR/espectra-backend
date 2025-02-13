// shared/services/cache/cache.decorator.ts

import { CacheService, CacheOptions } from './cache.service';

export interface CacheDecoratorOptions extends CacheOptions {
  keyPrefix?: string;
  keyGenerator?: (args: any[]) => string;
}

type MethodDecorator = <T>(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>
) => TypedPropertyDescriptor<T> | void;

export function Cached(options: CacheDecoratorOptions = {}): MethodDecorator {
  return function (
    target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const cacheService = CacheService.getInstance();
  
    target.toString();
  
    descriptor.value = async function (...args: any[]) {
      // Generar clave de caché
      const key = options.keyGenerator
        ? options.keyGenerator(args)
        : `${String(propertyKey)}:${JSON.stringify(args)}`;

      const fullKey = `${options.keyPrefix || ''}${key}`;

      // Intentar obtener del caché
      const cachedValue = await cacheService.get(fullKey, options);
      if (cachedValue !== null) {
        return cachedValue;
      }

      // Ejecutar método original si no está en caché
      const result = await originalMethod.apply(this, args);

      // Guardar en caché si hay resultado
      if (result !== null && result !== undefined) {
        await cacheService.set(fullKey, result, options);
      }

      return result;
    };

    return descriptor;
  };
}