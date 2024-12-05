// services/botpress/services/metrics/handoff-metrics.service.ts

import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { HandoffQueue } from '../../types/handoff.types';
import { HANDOFF_CONSTANTS } from '../../config/handoff.config';

export class HandoffMetricsService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  constructor() {
    this.logger = new Logger('HandoffMetricsService');
    this.metrics = new MetricsService(HANDOFF_CONSTANTS.METRICS.NAMESPACE);
  }

  async recordHandoffCreated(handoff: HandoffQueue): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffCreated');
      this.metrics.incrementCounter(`HandoffCreated_${handoff.priority}`);
      
      this.logger.info('Recorded handoff creation metrics', {
        queueId: handoff.queueId,
        priority: handoff.priority
      });
    } catch (error) {
      this.logger.error('Failed to record handoff creation metrics', {
        error,
        queueId: handoff.queueId
      });
    }
  }

  async recordHandoffAssigned(
    queueId: string,
    advisorId: string,
    waitTime: number
  ): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffAssigned');
      this.metrics.recordLatency('HandoffWaitTime', waitTime);
      
      this.logger.info('Recorded handoff assignment metrics', {
        queueId,
        advisorId,
        waitTime
      });
    } catch (error) {
      this.logger.error('Failed to record handoff assignment metrics', {
        error,
        queueId,
        advisorId
      });
    }
  }

  async recordHandoffCompleted(
    queueId: string,
    advisorId: string,
    resolutionTime: number
  ): Promise<void> {
    try {
      this.metrics.incrementCounter('HandoffCompleted');
      this.metrics.recordLatency('HandoffResolutionTime', resolutionTime);
      
      this.logger.info('Recorded handoff completion metrics', {
        queueId,
        advisorId,
        resolutionTime
      });
    } catch (error) {
      this.logger.error('Failed to record handoff completion metrics', {
        error,
        queueId,
        advisorId
      });
    }
  }
}