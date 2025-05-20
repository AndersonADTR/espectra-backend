"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cached = Cached;
const cache_service_1 = require("./cache.service");
function Cached(options = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const cacheService = cache_service_1.CacheService.getInstance();
        target.toString();
        descriptor.value = async function (...args) {
            const key = options.keyGenerator
                ? options.keyGenerator(args)
                : `${String(propertyKey)}:${JSON.stringify(args)}`;
            const fullKey = `${options.keyPrefix || ''}${key}`;
            const cachedValue = await cacheService.get(fullKey, options);
            if (cachedValue !== null) {
                return cachedValue;
            }
            const result = await originalMethod.apply(this, args);
            if (result !== null && result !== undefined) {
                await cacheService.set(fullKey, result, options);
            }
            return result;
        };
        return descriptor;
    };
}
//# sourceMappingURL=cache.decorator.js.map