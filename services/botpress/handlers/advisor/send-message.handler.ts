// services/botpress/handlers/advisor/send-message.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { AdvisorQueueService } from '../../services/handoff/advisor-queue.service';
import { WebSocketService } from '@services/websocket/services/websocket.service';
import { ConversationContextService } from '../../services/context/conversation-context.service';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('AdvisorSendMessageHandler');

const sendMessageHandler: APIGatewayProxyHandler = async (event) => {
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
    const { conversationId, message, handoffId } = request;

    if (!conversationId || !message || !handoffId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'conversationId, message, and handoffId are required' })
      };
    }

    // Obtener servicios
    const queueService = AdvisorQueueService.getInstance();
    const contextService = ConversationContextService.getInstance();
    const websocketService = new WebSocketService();

    // Verificar que este asesor está asignado a este handoff
    const handoff = await queueService.getHandoffRequest(handoffId);
    if (!handoff || handoff.assignedAdvisorId !== advisorId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Unauthorized to send messages to this conversation' })
      };
    }

    // Obtener información del asesor
    const advisor = await queueService.getAdvisorInfo(advisorId);

    // Obtener el contexto de la conversación
    const context = await contextService.getContext(conversationId);
    if (!context) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Conversation not found' })
      };
    }

    // Añadir mensaje al contexto
    const timestamp = Date.now();
    await contextService.updateContext(conversationId, {
      messages: [
        ...context.messages,
        {
          role: 'advisor',
          content: message,
          timestamp,
          metadata: {
            advisorId,
            advisorName: advisor?.name || 'Asesor',
            handoffId
          }
        }
      ],
      updatedAt: timestamp
    });

    // Enviar mensaje al usuario a través de WebSocket
    await websocketService.sendMessageToUser(context.userId, {
      type: 'AGENT_MESSAGE',
      content: message,
      conversationId,
      timestamp: new Date().toISOString(),
      metadata: {
        handoffId,
        advisorId,
        advisorName: advisor?.name || 'Asesor'
      }
    });

    logger.info('Advisor message sent', {
      handoffId,
      conversationId,
      advisorId
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Message sent successfully',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    logger.error('Error sending advisor message', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to send message',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(sendMessageHandler);