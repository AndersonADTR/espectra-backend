// services/websocket/handlers/message.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { ValidationError, InternalServerError } from '@shared/utils/errors';
import { MessageService } from '../services/message.services';
import { validateMessage } from '../validators/message.validator';

const logger = new Logger('WebSocket-Message');
const messageService = new MessageService();

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const connectionId = event.requestContext.connectionId;
    const userId = event.requestContext.authorizer?.userId;
    
    logger.info('Received WebSocket message', {
      connectionId: connectionId || '',
      userId,
      requestId: event.requestContext.requestId
    });

    const message = JSON.parse(event.body || '{}');
    const validatedMessage = validateMessage(message);

    await messageService.processMessage({
      connectionId: connectionId || '',
      userId,
      message: validatedMessage,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 200,
      body: 'Message processed successfully'
    };
  } catch (error) {
    logger.error('Failed to process WebSocket message', {
      error,
      connectionId: event.requestContext.connectionId,
      requestId: event.requestContext.requestId
    });

    if (error instanceof SyntaxError) {
      throw new ValidationError('Invalid message format');
    }

    if (error instanceof ValidationError) {
      throw error;
    }

    throw new InternalServerError('Failed to process message');
  }
};