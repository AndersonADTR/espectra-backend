// services/sse/handlers/poll.handler.ts

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { AuthenticationService } from '@services/auth/services/authentication.service';
import { UserService } from '@services/botpress/services/user/user.service';
import { BotpressService } from '@services/botpress/services/botpress/botpress.service';
import { MessageRole } from '@services/botpress/models/conversation-message.model';
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

    // Necesitamos el botpressUserId para identificar roles correctamente
    const userDetails = await userService.getUserByUserSub(userId);
    if (!userDetails || !userDetails.botpressUserId) {
      logger.error('User does not have botpressUserId for polling', { userId });
      return createErrorResponse(400, 'User not properly configured for messaging');
    }

    const messages = await getNewMessages(
      conversationId,
      userInfo.botpressUserKeyId,
      userDetails.botpressUserId,
      since
    );

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
 * Usa nuestra tabla local como fuente de verdad
 */
async function getNewMessages(
  conversationId: string,
  userKey: string,
  userBotpressId: string,
  since?: string
): Promise<any[]> {
  try {
    logger.info('SPECTRUM: Getting new messages for content creator', {
      conversationId,
      userKey: userKey.substring(0, 10) + '...',
      userBotpressId,
      since,
      platform: 'spectrum'
    });

    // Convertir timestamp si se proporciona
    const sinceTimestamp = since ? new Date(since).getTime() : undefined;

    logger.info('SPECTRUM: Using new message sync system', {
      conversationId,
      sinceTimestamp,
      userKey: userKey.substring(0, 10) + '...'
    });

    // Usar el nuevo método optimizado para polling
    const response = await botpressService.getNewMessages(
      userKey,
      conversationId,
      userBotpressId,
      sinceTimestamp,
      MessageRole.BOT // Solo mensajes del bot para content creators
    );

    logger.info('SPECTRUM: New message sync response received', {
      conversationId,
      responseType: typeof response,
      hasMessages: response && response.messages ? response.messages.length : 'no messages property',
      hasSync: response && response.sync ? 'sync info present' : 'no sync info',
      responseKeys: response ? Object.keys(response) : 'null response'
    });

    // Extraer mensajes de la respuesta estructurada
    let messages: any[] = [];

    if (response && Array.isArray(response.messages)) {
      messages = response.messages;
      logger.info('SPECTRUM: Using response.messages from local store', {
        messageCount: messages.length,
        syncInfo: response.sync
      });
    } else {
      logger.warn('SPECTRUM: Unexpected response format from new sync system', {
        conversationId,
        responseType: typeof response,
        response: JSON.stringify(response).substring(0, 500)
      });
      return [];
    }

    // Log de mensajes obtenidos
    logger.info('SPECTRUM: Messages from local store', {
      conversationId,
      totalMessages: messages.length,
      messagesSample: messages.slice(0, 3).map(msg => ({
        messageId: msg.messageId,
        role: msg.role,
        timestamp: msg.timestamp,
        content: msg.content?.substring(0, 50)
      }))
    });

    // Los mensajes ya vienen filtrados por rol BOT desde el servicio
    // Solo necesitamos aplicar filtros adicionales si es necesario

    logger.info('SPECTRUM: Messages ready for content creator', {
      conversationId,
      messageCount: messages.length,
      since,
      syncInfo: response.sync
    });

    // Si no hay timestamp específico, devolver todos los mensajes del bot
    if (!since) {
      logger.info('SPECTRUM: Returning all bot messages for content creator', {
        conversationId,
        messageCount: messages.length
      });
      return messages;
    }

    // Los mensajes ya están filtrados por timestamp en el servicio
    // pero podemos hacer una verificación adicional si es necesario
    logger.info('SPECTRUM: Returning filtered bot messages for content creator', {
      conversationId,
      since,
      messageCount: messages.length
    });

    return messages;

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
