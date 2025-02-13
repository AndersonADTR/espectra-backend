// shared/services/observability/anomaly-detection.service.ts

import { Logger } from '@shared/utils/logger';
import { RedisService } from '@shared/services/cache/redis.service';
import { MetricsService } from '@shared/utils/metrics';

export interface AnomalyRule {
  metricName: string;
  threshold: number;
  timeWindowSeconds: number;
  action: (violation: AnomalyViolation) => Promise<void>;
}

export interface AnomalyViolation {
  userId: string;
  sessionId?: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  timestamp: string;
}

export class AnomalyDetectionService {
  private static instance: AnomalyDetectionService;
  private readonly logger: Logger;
  private readonly redis: RedisService;
  private readonly metrics: MetricsService;
  private rules: Map<string, AnomalyRule>;

  private constructor() {
    this.logger = new Logger('AnomalyDetection');
    this.redis = RedisService.getInstance();
    this.metrics = new MetricsService('Security');
    this.rules = new Map();
    this.initializeRules();
  }

  static getInstance(): AnomalyDetectionService {
    if (!this.instance) {
      this.instance = new AnomalyDetectionService();
    }
    return this.instance;
  }

  private initializeRules() {
    this.addRule({
      metricName: 'failedLogins',
      threshold: 5,
      timeWindowSeconds: 300,
      action: this.handleFailedLogins.bind(this)
    });

    this.addRule({
      metricName: 'sessionCreationRate',
      threshold: 10,
      timeWindowSeconds: 60,
      action: this.handleExcessiveSessions.bind(this)
    });
  }

  addRule(rule: AnomalyRule) {
    this.rules.set(rule.metricName, rule);
  }

  async trackMetric(userId: string, metricName: string, value: number = 1, sessionId?: string) {
    const rule = this.rules.get(metricName);
    if (!rule) return;

    const key = `anomaly:${metricName}:${userId}`;
    const currentValue = await this.incrementMetric(key, value, rule.timeWindowSeconds);

    if (currentValue >= rule.threshold) {
      const violation: AnomalyViolation = {
        userId,
        sessionId,
        metricName,
        currentValue,
        threshold: rule.threshold,
        timestamp: new Date().toISOString()
      };

      await rule.action(violation);
      this.metrics.incrementCounter('AnomalyDetected');
    }
  }

  private async incrementMetric(key: string, value: number, expireSeconds: number): Promise<number> {
    const multi = this.redis.multi();
    multi.incrby(key, value);
    multi.expire(key, expireSeconds);
    
    const results = await multi.exec();
    return results[0][1] as number;
  }

  private async handleFailedLogins(violation: AnomalyViolation) {
    this.logger.warn('Excessive failed login attempts detected', { violation });
    await this.redis.sadd('blacklist:users', violation.userId);
    
    // Implementar lógica adicional (notificaciones, bloqueo temporal, etc.)
    
  }

  private async handleExcessiveSessions(violation: AnomalyViolation) {
    this.logger.warn('Excessive session creation detected', { violation });
    await this.enforceRateLimit(violation.userId, 'session_creation', 60);
  }

  private async enforceRateLimit(userId: string, action: string, seconds: number) {
    const key = `ratelimit:${action}:${userId}`;
    await this.redis.set(key, '1', 'EX', seconds);
  }
}