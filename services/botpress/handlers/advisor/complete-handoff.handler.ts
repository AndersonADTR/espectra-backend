// services/botpress/handlers/advisor/complete-handoff.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
// import { AdvisorQueueService } from '../../services/handoff/advisor-queue.service';
import { HandoffService } from '../../services/handoff/handoff.service';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('CompleteHandoffHandler');

const completeHandoffHandler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    // Obtener ID del asesor del token de autenticación
    const advisorId = event.requestContext.authorizer?.claims?.sub;
    if (!advisorId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    // Procesar solicitud
    const request = JSON.parse(event.body);
    const { handoffId, resolution } = request;

    if (!handoffId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'handoffId is required' })
      };
    }

    if (!resolution) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'resolution is required' })
      };
    }

    // Obtener servicios
    const handoffService = HandoffService.getInstance();

    // Completar el handoff
    await handoffService.completeHandoff(handoffId, resolution);

    logger.info('Handoff completed', { handoffId, advisorId, resolution });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Handoff completed successfully'
      })
    };
  } catch (error) {
    logger.error('Error completing handoff', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to complete handoff',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(completeHandoffHandler);