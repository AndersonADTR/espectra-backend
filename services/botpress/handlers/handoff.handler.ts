// services/botpress/handlers/handoff.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { HandoffController } from '../services/controllers/handoff.controller';
import { ValidationError, ResourceNotFoundError } from '@shared/utils/errors';
import { CreateHandoffRequest, UpdateHandoffRequest } from '../types/handoff.types';

const logger = new Logger('HandoffHandler');
const handoffController = new HandoffController();

export const createHandoff: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    const request: CreateHandoffRequest = {
      ...JSON.parse(event.body || '{}'),
      userId
    };

    const handoff = await handoffController.createHandoff(request);

    return {
      statusCode: 201,
      body: JSON.stringify(handoff)
    };
  } catch (error) {
    logger.error('Failed to create handoff', { error });

    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: error.message,
          details: error.metadata
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};

export const assignHandoff: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;
    if (!advisorId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    const queueId = event.pathParameters?.queueId;
    if (!queueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Queue ID is required' })
      };
    }

    const handoff = await handoffController.assignHandoff(queueId, advisorId);

    return {
      statusCode: 200,
      body: JSON.stringify(handoff)
    };
  } catch (error) {
    logger.error('Failed to assign handoff', { error });

    if (error instanceof ResourceNotFoundError) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: error.message })
      };
    }

    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: error.message,
          details: error.metadata
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};

export const completeHandoff: APIGatewayProxyHandler = async (event) => {
  try {
    const advisorId = event.requestContext.authorizer?.userId;
    if (!advisorId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    const queueId = event.pathParameters?.queueId;
    if (!queueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Queue ID is required' })
      };
    }

    const handoff = await handoffController.completeHandoff(queueId);

    return {
      statusCode: 200,
      body: JSON.stringify(handoff)
    };
  } catch (error) {
    logger.error('Failed to complete handoff', { error });

    if (error instanceof ResourceNotFoundError) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: error.message })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};

export const getHandoffStatus: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    const queueId = event.pathParameters?.queueId;
    if (!queueId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Queue ID is required' })
      };
    }

    const handoff = await handoffController.getHandoff(queueId);
    if (!handoff) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Handoff not found' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(handoff)
    };
  } catch (error) {
    logger.error('Failed to get handoff status', { error });

    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};