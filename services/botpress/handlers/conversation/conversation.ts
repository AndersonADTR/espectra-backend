// services/botpress/handlers/conversation/conversation.handler.ts

import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { UserService } from '@services/botpress/services/user/user.service';

/**
 * Handler Lambda para gestionar conversaciones de concierge vía API REST
 * Implementa el flujo específico de concierge:
 * 1. Verificar conversación activa
 * 2. Crear nueva conversación si no existe
 * 3. Gestionar sesiones y mensajes
 * 4. Control de tokens
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {

  console.info('Processing concierge conversation request', {
    path: event.path,
    method: event.httpMethod
  });

  // Obtener el userSub de Cognito del authorizer (viene como userId en el token)
  const userSub = event.requestContext.authorizer?.userId;
  if (!userSub) {
    console.error('No userSub found in request');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized' })
    };
  }

  const botpressService = BotpressService.getInstance();
  const userService = UserService.getInstance();

  // Buscar usuario por userSub de Cognito
  console.info('Searching user by userSub', { userSub });
  const user = await userService.getUserByUserSub(userSub);

  console.info('User found in database', { user });

  if (!user) {
    console.error('User not found in database', { userSub });
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      })
    };
  }

  // Usar el userId interno del usuario encontrado
  const userBotpressKey = user.botpressUserKeyId;
  console.info('User key found for user', { userBotpressKey });

  try {
    // Determinar la operación basada en el método HTTP y la ruta
    const path = event.path;
    const method = event.httpMethod;

    // Extraer conversationId de la ruta si existe
    const pathParts = path.split('/');
    const conversationIdIndex = pathParts.findIndex(part => part === 'conversations') + 1;
    const conversationId = conversationIdIndex < pathParts.length ? pathParts[conversationIdIndex] : null;

    // Extraer action de la ruta (ej: /conversations/{id}/messages, /conversations/{id}/session)
    const action = conversationId && conversationIdIndex + 1 < pathParts.length ? pathParts[conversationIdIndex + 1] : null;

    console.info('Request details', {
      method,
      conversationId,
      action
    });

    // Manejar diferentes operaciones según el flujo de concierge

    // 1. GET /conversations - Verificar si existe conversación activa de concierge
    if (method === 'GET' && !conversationId) {
      const activeConversation = await botpressService.getActiveConciergeConversation(userBotpressKey);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hasActiveConversation: !!activeConversation,
          conversation: activeConversation
        })
      };
    }

    // 2. POST /conversations - Crear nueva conversación de concierge
    else if (method === 'POST' && !conversationId) {
      // Primero verificar que el usuario existe y tiene x-user-key
      console.info('Verifying user exists and has Botpress key', { userBotpressKey });

      if (!user) {
        console.error('User not found in database', { userSub });
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'User not found',
            error: 'USER_NOT_FOUND'
          })
        };
      }

      if (!userBotpressKey) {
        console.error('User does not have Botpress key', { userBotpressKey });
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'User is not configured for Botpress integration',
            error: 'BOTPRESS_KEY_MISSING'
          })
        };
      }

      console.info('User verified with Botpress key', {
        userBotpressKey,
        hasKey: !!userBotpressKey
      });

      // Verificar si ya existe una conversación activa
      const existingConversation = await botpressService.getActiveConciergeConversation(userBotpressKey);

      if (existingConversation) {
        console.info('Active conversation already exists', {
          userBotpressKey,
          conversationId: existingConversation.conversationId
        });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Active conversation already exists',
            conversation: existingConversation
          })
        };
      }

      // Crear nueva conversación
      console.info('Creating new concierge conversation', { userBotpressKey });
      const newConversation = await botpressService.createConciergeConversation(userBotpressKey);

      console.info('New concierge conversation created successfully', {
        userBotpressKey,
        conversationId: newConversation.conversationId
      });

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'New concierge conversation created',
          conversation: newConversation
        })
      };
    }

    // 3. GET /conversations/{id} - Obtener detalles de conversación específica
    else if (method === 'GET' && conversationId && !action) {
      const conversation = await botpressService.getConversationHistory(userBotpressKey, conversationId);

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

    // 4. GET /conversations/{id}/messages - Cargar mensajes de la conversación
    else if (method === 'GET' && conversationId && action === 'messages') {
      const messages = await botpressService.getConversationMessages(userBotpressKey, conversationId);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages)
      };
    }

    // 5. POST /conversations/{id}/messages - Enviar mensaje en conversación existente
    else if (method === 'POST' && conversationId && action === 'messages') {

      console.info('Sending message to conversation', {
        userBotpressKey,
        conversationId
      });

      if (!event.body) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Request body is required' })
        };
      }

      console.info('Parsing request body', { body: event.body });

      if (event.isBase64Encoded) {
        const body = Buffer.from(event.body, 'base64').toString('utf8');
        console.info('Decoded base64 body', { body });
        event.body = body;
      }

      const requestData = JSON.parse(event.body);

      console.info('Request data parsed', { requestData });

      if (!requestData.message) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Message is required' })
        };
      }

      console.info('Sending message to conversation', {
        userBotpressKey,
        conversationId,
        payload: requestData
      });

      // Enviar mensaje a la conversación existente
      const response = await botpressService.sendMessage(
        userBotpressKey,
        requestData.message,
        requestData.type || 'text',
        conversationId
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      };
    }

    // 6. POST /conversations/{id}/session - Abrir sesión
    else if (method === 'POST' && conversationId && action === 'session') {
      await botpressService.openSession(userBotpressKey, conversationId);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Session opened successfully' })
      };
    }

    // 7. DELETE /conversations/{id}/session - Cerrar sesión
    else if (method === 'DELETE' && conversationId && action === 'session') {
      await botpressService.closeSession(userBotpressKey, conversationId);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Session closed successfully' })
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