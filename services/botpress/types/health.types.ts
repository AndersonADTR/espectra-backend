// services/botpress/types/health.types.ts

export interface HealthCheckResult {
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    components: {
      api: ComponentHealth;
      nlu: ComponentHealth;
      database: ComponentHealth;
    };
    lastChecked: string;
    details?: Record<string, any>;
}
  
export interface ComponentHealth {
    status: 'operational' | 'degraded' | 'down';
    latency?: number;
    error?: string;
}