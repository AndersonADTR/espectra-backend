// services/websocket/handlers/connection.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { ConnectionService } from 'services/websocket/services/connection.service';
import { BaseService } from '../../botpress/services/base/base.service';
import { BotpressError } from '../../botpress/utils/errors';

class WebSocketConnectionHandler extends BaseService {
  private readonly connectionManager: ConnectionService;

  constructor() {
    super('WebSocketConnectionHandler');
    this.connectionManager = new ConnectionService();
  }

  async handleConnect(event: any): Promise<{ statusCode: number; body: string }> {
    try {
      const connectionId = event.requestContext.connectionId;
      const userId = event.requestContext.authorizer?.userId;

      if (!connectionId || !userId) {
        throw new BotpressError('Missing required connection data', {
          connectionId,
          userId
        });
      }

      this.logger.info('WebSocket connect request', {
        connectionId,
        userId,
        requestId: event.requestContext.requestId
      });

      await this.connectionManager.createConnection(connectionId, userId);

      return {
        statusCode: 200,
        body: 'Connected'
      };
    } catch (error) {
      this.logger.error('Failed to handle WebSocket connect', {
        error,
        connectionId: event.requestContext.connectionId,
        requestId: event.requestContext.requestId
      });

      return {
        statusCode: error instanceof BotpressError ? error.statusCode : 500,
        body: (error as Error).message
      };
    }
  }

  async handleDisconnect(event: any): Promise<{ statusCode: number; body: string }> {
    try {
      const connectionId = event.requestContext.connectionId;

      if (!connectionId) {
        throw new BotpressError('Missing connection ID');
      }

      this.logger.info('WebSocket disconnect request', {
        connectionId,
        requestId: event.requestContext.requestId
      });

      await this.connectionManager.deleteConnection(connectionId);

      return {
        statusCode: 200,
        body: 'Disconnected'
      };
    } catch (error) {
      this.logger.error('Failed to handle WebSocket disconnect', {
        error,
        connectionId: event.requestContext.connectionId,
        requestId: event.requestContext.requestId
      });

      return {
        statusCode: error instanceof BotpressError ? error.statusCode : 500,
        body: (error as Error).message
      };
    }
  }
}

// Handler para conexión
export const connect: APIGatewayProxyHandler = async (event) => {
  const handler = new WebSocketConnectionHandler();
  return handler.handleConnect(event);
};

// Handler para desconexión
export const disconnect: APIGatewayProxyHandler = async (event) => {
  const handler = new WebSocketConnectionHandler();
  return handler.handleDisconnect(event);
};

// Exportar el handler completo para uso en tests y otros contextos
export default WebSocketConnectionHandler;