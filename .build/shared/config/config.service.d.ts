export declare class ConfigurationError extends Error {
    constructor(message: string);
}
export declare class ConfigService {
    private static instance;
    private static logger;
    private readonly configs;
    private constructor();
    private loadConfigurations;
    private validateCriticalConfigs;
    private static getInstance;
    static get<T>(key: string, defaultValue?: T): T;
    static getRequired<T>(key: string): T;
    static set(key: string, value: any): void;
    static has(key: string): boolean;
    static getAll(): Record<string, any>;
}
export declare const config: typeof ConfigService;
//# sourceMappingURL=config.service.d.ts.map