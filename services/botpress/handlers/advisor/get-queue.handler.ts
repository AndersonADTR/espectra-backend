// services/botpress/handlers/advisor/get-queue.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AdvisorQueueService } from '../../services/handoff/advisor-queue.service';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('GetQueueHandler');

const getQueueHandler: APIGatewayProxyHandler = async (event) => {
  try {
    // Obtener ID del asesor del token de autenticación
    const advisorId = event.requestContext.authorizer?.claims?.sub;
    if (!advisorId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    // Obtener servicios
    const queueService = AdvisorQueueService.getInstance();
    
    // Obtener límite de resultados de query parameters
    const limit = event.queryStringParameters?.limit 
      ? parseInt(event.queryStringParameters.limit) 
      : 10;
    
    // Obtener handoffs pendientes
    const pendingHandoffs = await queueService.getPendingHandoffs(limit);
    
    logger.info('Queue retrieved', { 
      advisorId, 
      count: pendingHandoffs.length 
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        handoffs: pendingHandoffs,
        count: pendingHandoffs.length
      })
    };
  } catch (error) {
    logger.error('Error getting handoff queue', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to get handoff queue',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(getQueueHandler);