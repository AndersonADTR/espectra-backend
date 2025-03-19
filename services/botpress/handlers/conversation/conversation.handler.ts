// services/botpress/handlers/conversation/conversation.handler.ts

import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';

/**
 * Handler Lambda para gestionar conversaciones vía API REST
 * Este Lambda proporciona endpoints para listar, obtener y gestionar conversaciones
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {

  console.info('Processing conversation request', { 
    path: event.path,
    method: event.httpMethod
  });
  
  // Obtener el ID de usuario del authorizer
  const userId = event.requestContext.authorizer?.userId;
  if (!userId) {
    console.error('No user ID found in request');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized' })
    };
  }
  
  const botpressService = BotpressService.getInstance();
  
  try {
    // Determinar la operación basada en el método HTTP y la ruta
    const path = event.path;
    const method = event.httpMethod;
    
    // Extraer conversationId de la ruta si existe
    const pathParts = path.split('/');
    const conversationIdIndex = pathParts.findIndex(part => part === 'conversations') + 1;
    const conversationId = conversationIdIndex < pathParts.length ? pathParts[conversationIdIndex] : null;
    
    // Manejar diferentes operaciones
    if (method === 'GET' && !conversationId) {
      // Listar todas las conversaciones del usuario
      const conversations = await botpressService.listUserConversations(userId);
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversations)
      };
    } 
    else if (method === 'GET' && conversationId) {
      // Obtener una conversación específica
      const conversation = await botpressService.getConversationHistory(userId, conversationId);
      
      if (!conversation) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Conversation not found' })
        };
      }
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversation)
      };
    }
    else if (method === 'POST' && !conversationId) {
      // Crear una nueva conversación con un mensaje inicial
      if (!event.body) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Request body is required' })
        };
      }
      
      const requestData = JSON.parse(event.body);
      
      if (!requestData.message) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Initial message is required' })
        };
      }
      
      // Generar un nuevo ID de conversación y enviar el mensaje
      const response = await botpressService.sendMessage(
        userId,
        requestData.message
      );
      
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: response.conversationId,
          messages: response.messages
        })
      };
    }
    else if (method === 'POST' && conversationId) {
      // Añadir un mensaje a una conversación existente
      if (!event.body) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Request body is required' })
        };
      }
      
      const requestData = JSON.parse(event.body);
      
      if (!requestData.message) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Message is required' })
        };
      }
      
      // Enviar mensaje a la conversación existente
      const response = await botpressService.sendMessage(
        userId,
        requestData.message,
        conversationId
      );
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: response.conversationId,
          messages: response.messages
        })
      };
    }
    else if (method === 'DELETE' && conversationId) {
      // Eliminar una conversación
      // Implementar lógica para eliminar la conversación
      

      
      return {
        statusCode: 501,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Not implemented' })
      };
    }
    else {
      // Método no soportado
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Method not allowed' })
      };
    }
  } catch (error) {
    console.error('Error processing conversation request', { error });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};