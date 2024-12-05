// services/botpress/handlers/advisor.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { AdvisorService } from '../services/advisor.service';
import { HandoffService } from '../services/handoff.service';
import { BaseError, ValidationError } from '@shared/utils/errors';
import { MONITORING_CONFIG } from '../config/config';

const logger = new Logger('AdvisorHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const advisorService = new AdvisorService();
const handoffService = new HandoffService();

export const updateStatus: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;
    const { status } = JSON.parse(event.body || '{}');

    if (!advisorId || !status) {
      throw new ValidationError('Missing required fields');
    }

    await advisorService.updateStatus(advisorId, status);
    
    metrics.incrementCounter('AdvisorStatusUpdates');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Status updated successfully' })
    };
  } catch (error) {
    logger.error('Failed to update advisor status', { error });
    return {
      statusCode: error instanceof ValidationError ? 400 : 500,
      body: JSON.stringify({ message: (error as BaseError).message })
    };
  }
};

export const acceptHandoff: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;
    const { queueId } = JSON.parse(event.body || '{}');

    if (!advisorId || !queueId) {
      throw new ValidationError('Missing required fields');
    }

    const response = await handoffService.assignHandoff(queueId, advisorId);
    
    metrics.incrementCounter('HandoffAcceptances');

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    };
  } catch (error) {
    logger.error('Failed to accept handoff', { error });
    return {
      statusCode: error instanceof ValidationError ? 400 : 500,
      body: JSON.stringify({ message: (error as BaseError).message })
    };
  }
};

export const completeHandoff: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;
    const { queueId } = JSON.parse(event.body || '{}');

    if (!advisorId || !queueId) {
      throw new ValidationError('Missing required fields');
    }

    await handoffService.completeHandoff(queueId);
    
    metrics.incrementCounter('HandoffCompletions');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Handoff completed successfully' })
    };
  } catch (error) {
    logger.error('Failed to complete handoff', { error });
    return {
      statusCode: error instanceof ValidationError ? 400 : 500,
      body: JSON.stringify({ message: (error as BaseError).message })
    };
  }
};

export const getPendingHandoffs: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;

    if (!advisorId) {
      throw new ValidationError('Missing advisor ID');
    }

    const pendingHandoffs = await handoffService.getPendingHandoffs();
    
    metrics.recordMetric('PendingHandoffsCount', pendingHandoffs.length);

    return {
      statusCode: 200,
      body: JSON.stringify(pendingHandoffs)
    };
  } catch (error) {
    logger.error('Failed to get pending handoffs', { error });
    return {
      statusCode: error instanceof ValidationError ? 400 : 500,
      body: JSON.stringify({ message: (error as BaseError).message })
    };
  }
};