import { CacheOptions } from './cache.service';
export interface CacheDecoratorOptions extends CacheOptions {
    keyPrefix?: string;
    keyGenerator?: (args: any[]) => string;
}
type MethodDecorator = <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;
export declare function Cached(options?: CacheDecoratorOptions): MethodDecorator;
export {};
//# sourceMappingURL=cache.decorator.d.ts.map