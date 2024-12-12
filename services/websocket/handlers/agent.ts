import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MessageService } from '../services/message.service';
import { WSMessage } from '../types/websocket.types';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('AgentHandler');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
const messageService = new MessageService();

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const connectionId = event.requestContext.connectionId;
  
  try {
    logger.info('Agent message received', { connectionId });

    if (!connectionId || !event.body) {
      metrics.incrementCounter('AgentMessageValidationFailed');
      return {
        statusCode: 400,
        body: 'Missing required fields'
      };
    }

    const messageData: WSMessage = JSON.parse(event.body);

    await messageService.handleAgentResponse(connectionId, messageData);

    metrics.incrementCounter('AgentMessagesProcessed');

    return {
      statusCode: 200,
      body: 'Agent message processed'
    };
  } catch (error) {
    logger.error('Error handling agent message', { error, connectionId });

    metrics.incrementCounter('AgentMessageProcessingFailed');

    return {
      statusCode: 500,
      body: 'Failed to handle agent message'
    };
  }
};