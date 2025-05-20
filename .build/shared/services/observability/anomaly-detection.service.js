"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnomalyDetectionService = void 0;
const logger_1 = require("@shared/utils/logger");
const redis_service_1 = require("@shared/services/cache/redis.service");
const metrics_1 = require("@shared/utils/metrics");
class AnomalyDetectionService {
    static instance;
    logger;
    redis;
    metrics;
    rules;
    constructor() {
        this.logger = new logger_1.Logger('AnomalyDetection');
        this.redis = redis_service_1.RedisService.getInstance();
        this.metrics = new metrics_1.MetricsService('Security');
        this.rules = new Map();
        this.initializeRules();
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new AnomalyDetectionService();
        }
        return this.instance;
    }
    initializeRules() {
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
    addRule(rule) {
        this.rules.set(rule.metricName, rule);
    }
    async trackMetric(userId, metricName, value = 1, sessionId) {
        const rule = this.rules.get(metricName);
        if (!rule)
            return;
        const key = `anomaly:${metricName}:${userId}`;
        const currentValue = await this.incrementMetric(key, value, rule.timeWindowSeconds);
        if (currentValue >= rule.threshold) {
            const violation = {
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
    async incrementMetric(key, value, expireSeconds) {
        const multi = this.redis.multi();
        multi.incrby(key, value);
        multi.expire(key, expireSeconds);
        const results = await multi.exec();
        if (!results) {
            throw new Error('Redis transaction failed');
        }
        return results[0][1];
    }
    async handleFailedLogins(violation) {
        this.logger.warn('Excessive failed login attempts detected', { violation });
        await this.redis.sadd('blacklist:users', violation.userId);
    }
    async handleExcessiveSessions(violation) {
        this.logger.warn('Excessive session creation detected', { violation });
        await this.enforceRateLimit(violation.userId, 'session_creation', 60);
    }
    async enforceRateLimit(userId, action, seconds) {
        const key = `ratelimit:${action}:${userId}`;
        await this.redis.set(key, '1', 'EX', seconds);
    }
}
exports.AnomalyDetectionService = AnomalyDetectionService;
//# sourceMappingURL=anomaly-detection.service.js.map