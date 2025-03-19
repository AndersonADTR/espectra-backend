// services/botpress/handlers/advisor/accept-handoff.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AdvisorQueueService, HandoffStatus } from '../../services/handoff/advisor-queue.service';
import { HandoffService } from '../../services/handoff/handoff.service';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('AcceptHandoffHandler');

const acceptHandoffHandler: APIGatewayProxyHandler = async (event) => {
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
    const handoffId = request.handoffId;
    
    if (!handoffId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'handoffId is required' })
      };
    }

    // Obtener servicios
    const queueService = AdvisorQueueService.getInstance();
    const handoffService = HandoffService.getInstance();
    
    // Obtener información del asesor
    const advisor = await queueService.getAdvisorInfo(advisorId);
    if (!advisor) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Advisor not found' })
      };
    }
    
    // Aceptar el handoff
    const handoff = await queueService.updateHandoffStatus(
      handoffId, 
      HandoffStatus.IN_PROGRESS, 
      advisorId
    );
    
    // Notificar al usuario que un asesor se ha unido
    await handoffService.notifyHandoffAccepted(handoffId, advisorId, advisor.name);
    
    logger.info('Handoff accepted', { handoffId, advisorId });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Handoff accepted successfully',
        handoff
      })
    };
  } catch (error) {
    logger.error('Error accepting handoff', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to accept handoff',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(acceptHandoffHandler);