// services/sse/handlers/poll.handler.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { AuthenticationService } from '@services/auth/services/authentication.service';
import { UserService } from '@services/botpress/services/user/user.service';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { SPECTRUM_POLLING_CONFIG } from '../config/sse.config';

const logger = new Logger('SpectrumPollHandler');
const metrics = new MetricsService('SPECTRUM/Polling');
const authService = new AuthenticationService();
const userService = UserService.getInstance();
const botpressService = BotpressService.getInstance();

/**
 * SPECTRUM - Handler de polling para content creators
 * GET /conversations/{conversationId}/poll?userId={userSub}&since={timestamp}
 *
 * Flujo optimizado para content creators:
 * 1. Content creator hace pregunta sobre creación de contenido
 * 2. App móvil hace polling cada 2-3 segundos
 * 3. Recibe respuestas del bot especializado en content creation
 * 4. Si necesario, handoff automático a asesor humano
 */
export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = event.requestContext.requestId;
  
  try {
    logger.info('SSE poll request received', { 
      requestId,
      conversationId: event.pathParameters?.conversationId,
      userId: event.queryStringParameters?.userId,
      since: event.queryStringParameters?.since
    });

    // SPECTRUM: Configuración de polling validada automáticamente

    // Extraer parámetros
    const conversationId = event.pathParameters?.conversationId;
    const userId = event.queryStringParameters?.userId;
    const since = event.queryStringParameters?.since;

    if (!conversationId || !userId) {
      logger.warn('Missing required parameters', { conversationId, userId, requestId });
      return createErrorResponse(400, 'Missing conversationId or userId');
    }

    // Validar autenticación
    const authResult = await validateAuthentication(event);
    if (!authResult.valid) {
      logger.warn('Authentication failed', { userId, requestId, reason: authResult.error });
      return createErrorResponse(401, authResult.error || 'Authentication failed');
    }

    // El userId del query parameter debería ser el userSub del token
    // Verificar que el usuario autenticado coincida con el solicitado
    // Limpiar espacios y normalizar strings para comparación
    const normalizedAuthUserId = authResult.userId?.trim();
    const normalizedRequestUserId = userId?.trim();

    if (normalizedAuthUserId !== normalizedRequestUserId) {
      logger.warn('User ID mismatch', {
        authenticatedUserId: authResult.userId,
        requestedUserId: userId,
        normalizedAuthUserId,
        normalizedRequestUserId,
        authUserIdLength: authResult.userId?.length,
        requestUserIdLength: userId?.length,
        requestId
      });
      return createErrorResponse(403, 'User ID mismatch');
    }

    // Obtener información del usuario y userKey de Botpress usando userSub
    const userInfo = await getUserInfo(normalizedAuthUserId!);
    if (!userInfo.success) {
      logger.error('Failed to get user info', { userId, requestId, error: userInfo.error });
      return createErrorResponse(500, 'Failed to get user information');
    }

    if (!userInfo.botpressUserKeyId) {
      logger.error('User does not have Botpress user key', { userId, requestId });
      return createErrorResponse(400, 'User not configured for chat');
    }

    // Obtener mensajes nuevos desde el timestamp especificado
    // Optimizado para content creators: respuestas del bot y asesores
    logger.info('SPECTRUM: About to call getNewMessages', {
      conversationId,
      userInfoKeys: Object.keys(userInfo),
      botpressUserKeyId: userInfo.botpressUserKeyId?.substring(0, 10) + '...',
      since,
      userId
    });

    const messages = await getNewMessages(conversationId, userInfo.botpressUserKeyId, since, userId);

    logger.info('SPECTRUM: getNewMessages returned', {
      conversationId,
      messageCount: messages.length,
      messagesPreview: messages.slice(0, 2).map(msg => ({
        id: msg.id,
        direction: msg.direction,
        hasPayload: !!msg.payload,
        payloadText: msg.payload?.text?.substring(0, 50)
      }))
    });

    metrics.recordLatency('SpectrumPollHandlerDuration', Date.now() - startTime);
    metrics.incrementCounter('SpectrumPollRequestsSuccessful');

    logger.info('SPECTRUM: Poll request completed for content creator', {
      userId,
      conversationId,
      requestId,
      messageCount: messages.length,
      duration: Date.now() - startTime,
      platform: 'spectrum'
    });

    // Respuesta optimizada para content creators
    const response = {
      messages,
      timestamp: new Date().toISOString(),
      hasMore: messages.length > 0,
      conversationId,
      userId,
      // Contexto específico para SPECTRUM
      context: {
        platform: 'spectrum',
        userType: 'content_creator',
        pollingInterval: 2000, // Recomendado: 2 segundos
        lastPolled: new Date().toISOString()
      },
      // Información de estado para la app móvil
      status: {
        connected: true,
        botAvailable: true,
        humanHandoffAvailable: true
      }
    };

    return {
      statusCode: 200,
      headers: {
        ...SPECTRUM_POLLING_CONFIG.HEADERS,
        'X-Spectrum-Response-Time': (Date.now() - startTime).toString()
      },
      body: JSON.stringify(response),
      isBase64Encoded: false
    };

  } catch (error) {
    logger.error('Error in SSE poll handler', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
      stack: error instanceof Error ? error.stack : undefined
    });

    metrics.incrementCounter('SSEPollRequestsError');
    
    return createErrorResponse(500, 'Internal server error');
  }
};

/**
 * Valida la autenticación del usuario
 */
async function validateAuthentication(event: APIGatewayProxyEvent): Promise<{
  valid: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    // Extraer token de Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    if (!authHeader) {
      return { valid: false, error: 'Missing Authorization header' };
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { valid: false, error: 'Invalid Authorization header format' };
    }

    // Validar token JWT
    const authResult = await authService.validateToken(token);
    if (!authResult) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    return {
      valid: true,
      userId: authResult.userSub
    };

  } catch (error) {
    logger.error('Error validating authentication', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return { valid: false, error: 'Authentication validation failed' };
  }
}

/**
 * Obtiene información del usuario incluyendo el userKey de Botpress
 */
async function getUserInfo(userSub: string): Promise<{
  success: boolean;
  botpressUserKeyId?: string;
  error?: string;
}> {
  try {
    // Usar UserService para buscar por userSub (Cognito sub)
    const user = await userService.getUserByUserSub(userSub);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.botpressUserKeyId) {
      return { success: false, error: 'User does not have Botpress configuration' };
    }

    return {
      success: true,
      botpressUserKeyId: user.botpressUserKeyId
    };

  } catch (error) {
    logger.error('Error getting user info', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userSub 
    });
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * SPECTRUM - Obtiene mensajes nuevos para content creators
 * Optimizado para respuestas del bot especializado en content creation
 */
async function getNewMessages(
  conversationId: string,
  userKey: string,
  since?: string,
  userId?: string
): Promise<any[]> {
  try {
    logger.info('SPECTRUM: Getting new messages for content creator', {
      conversationId,
      since,
      platform: 'spectrum'
    });

    // Obtener mensajes de la conversación desde Botpress
    logger.info('SPECTRUM: Calling Botpress getConversationMessages', {
      conversationId,
      userKey: userKey.substring(0, 10) + '...',
      since
    });

    const response = await botpressService.getConversationMessages(userKey, conversationId);

    logger.info('SPECTRUM: Botpress response received', {
      conversationId,
      responseType: typeof response,
      isArray: Array.isArray(response),
      hasMessages: response && response.messages ? response.messages.length : 'no messages property',
      hasData: response && response.data ? response.data.length : 'no data property',
      responseKeys: response ? Object.keys(response) : 'null response',
      responsePreview: JSON.stringify(response).substring(0, 500)
    });

    // Verificar que la respuesta sea válida y extraer los mensajes
    let messages: any[] = [];

    if (Array.isArray(response)) {
      messages = response;
      logger.info('SPECTRUM: Using response as array', { messageCount: messages.length });
    } else if (response && Array.isArray(response.messages)) {
      messages = response.messages;
      logger.info('SPECTRUM: Using response.messages', { messageCount: messages.length });
    } else if (response && Array.isArray(response.data)) {
      messages = response.data;
      logger.info('SPECTRUM: Using response.data', { messageCount: messages.length });
    } else {
      logger.warn('SPECTRUM: Unexpected response format from Botpress', {
        conversationId,
        responseType: typeof response,
        response: JSON.stringify(response).substring(0, 500)
      });
      return [];
    }

    // Log de todos los mensajes antes del filtrado
    logger.info('SPECTRUM: All messages before filtering', {
      conversationId,
      totalMessages: messages.length,
      messagesSample: messages.slice(0, 3).map(msg => ({
        id: msg.id,
        direction: msg.direction,
        role: msg.role,
        source: msg.source,
        type: msg.type,
        createdAt: msg.createdAt,
        hasPayload: !!msg.payload,
        payloadText: msg.payload?.text?.substring(0, 50)
      }))
    });

    // SPECTRUM: Filtrar mensajes relevantes para content creators
    // Basado en el análisis de los mensajes reales:
    // - user_01JWY0JZPXJ21Q92K3DTJ8378F = Bot (respuestas)
    // - user_01JYARVSQ740AXB26WD34VPRA6 = Usuario (preguntas)

    const relevantMessages = messages.filter((message: any) => {
      // Identificar mensajes del bot por el patrón del userId
      // Los mensajes del bot tienen userId que empieza con "user_01JWY0JZPXJ21Q92K3DTJ8378F"
      const isFromBot = message.userId === 'user_01JWY0JZPXJ21Q92K3DTJ8378F';
      const isFromUser = message.userId === 'user_01JYARVSQ740AXB26WD34VPRA6';

      // Para content creators, queremos solo las respuestas del bot
      const isRelevant = isFromBot;

      logger.info('SPECTRUM: Message filter check', {
        messageId: message.id,
        messageUserId: message.userId,
        isFromBot,
        isFromUser,
        isRelevant,
        payloadText: message.payload?.text?.substring(0, 50),
        createdAt: message.createdAt
      });

      return isRelevant;
    });

    // SPECTRUM: Si no hay userId para filtrar, devolver todos los mensajes
    if (!userId) {
      logger.warn('SPECTRUM: No userId provided for filtering, returning all messages', {
        conversationId,
        messageCount: messages.length
      });
      return messages.slice(-5); // Últimos 5 mensajes
    }

    logger.info('SPECTRUM: Messages after filtering', {
      conversationId,
      originalCount: messages.length,
      filteredCount: relevantMessages.length
    });

    if (!since) {
      // Si no hay timestamp, devolver los últimos 5 mensajes relevantes
      // Para content creators, menos mensajes es mejor para la UX móvil
      const recentMessages = relevantMessages.slice(-5);
      logger.info('SPECTRUM: Returning recent messages for content creator', {
        conversationId,
        messageCount: recentMessages.length
      });
      return recentMessages;
    }

    // Filtrar mensajes posteriores al timestamp
    const sinceDate = new Date(since);
    const newMessages = relevantMessages.filter((message: any) => {
      const messageDate = new Date(message.createdAt || message.timestamp);
      return messageDate > sinceDate;
    });

    logger.info('SPECTRUM: Filtered new messages for content creator', {
      conversationId,
      since,
      newMessageCount: newMessages.length,
      totalMessageCount: relevantMessages.length
    });

    return newMessages;

  } catch (error) {
    logger.error('Error getting new messages', {
      error: error instanceof Error ? error.message : 'Unknown error',
      conversationId
    });

    return [];
  }
}

/**
 * Crea una respuesta de error estándar
 */
function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    },
    body: JSON.stringify({
      error: message,
      timestamp: new Date().toISOString()
    }),
    isBase64Encoded: false
  };
}

/**
 * Handler para OPTIONS (CORS preflight)
 */
export const optionsHandler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    },
    body: '',
    isBase64Encoded: false
  };
};
