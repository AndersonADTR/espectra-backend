// services/websocket/handlers/message.handler.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MessageService } from '../services/message.service';
import { BotpressService } from '../../botpress/services/botpress.service';
import { Connection } from '../models/connection';
import { WebSocketError } from '../utils/errors';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('WebSocketMessageHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const messageService = new MessageService();
const botpressService = new BotpressService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  
  try {
    logger.info('WebSocket message received', { connectionId });

    if (!connectionId || !event.body) {
      throw new WebSocketError('Missing required connectionId or message body', 400);
    }

    const messageData = JSON.parse(event.body);

    const connection = await messageService.getConnectionById(connectionId);
    if (!connection) {
      throw new WebSocketError('Connection not found', 404);
    }

    const { userId } = connection;
    const { conversationId, content } = messageData;

    const botResponse = await botpressService.sendMessage({
      conversationId,
      text: content,
      message: content,
      userId,
      metadata: {
        source: 'websocket',
        timestamp: new Date().toISOString(),
        context: messageData.metadata?.context,
      },
    });

    const requiresHumanIntervention = botResponse.responses.some(
      (response) => response.metadata?.handoff?.requested
    );
    
    if (requiresHumanIntervention) {
      await messageService.notifyHumanAgent(connection, messageData);
      await messageService.updateConnectionStatus(connectionId, 'WAITING_FOR_AGENT');
    } else {
      for (const response of botResponse.responses) {
        await messageService.sendMessage(connectionId, {
          type: response.type === 'handoff' ? 'HANDOFF_STATUS' : 'BOT_RESPONSE',
          content: response.message,
          conversationId,
          timestamp: new Date().toISOString(),
          metadata: response.metadata,
        });
      }
    }

    metrics.incrementCounter('WebSocketMessagesProcessed');

    return {
      statusCode: 200,
      body: 'Message processed',
    };
  } catch (error) {
    logger.error('Error processing WebSocket message', { error, connectionId });

    if (error instanceof WebSocketError) {
      return {
        statusCode: error.statusCode,
        body: error.message,
      };
    }

    metrics.incrementCounter('WebSocketMessageProcessingFailures');

    return {
      statusCode: 500,
      body: 'Failed to process message',
    };
  }
};