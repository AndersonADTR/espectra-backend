import { EventBridgeEvent, Context } from 'aws-lambda';
import { BotpressMetricsService } from '../services/metrics/botpress-metrics.services';
import { BotpressMetric } from '../types/metrics.types';
import { Logger } from '@shared/utils/logger';

export const handler = async (
  event: EventBridgeEvent<'Metric', BotpressMetric>,
  context: Context
) => {
    
    const logger = new Logger('MetricsCollector');
    try {
        logger.info('Processing metrics event', { 
            eventId: context.awsRequestId,
            detail: event.detail 
        });

        const metricsService = new BotpressMetricsService();
        await metricsService.trackMessageMetrics({
            userId: event.detail.userId || '',
            messageType: event.detail.type,
            tokensUsed: event.detail.value,
            processingTime: 0,
            handoffRequested: false
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Metric processed successfully' })
        };
    } catch (error) {
        logger.error('Error processing metric', { 
            error, 
            eventId: context.awsRequestId 
        });
        throw error;
    }
};