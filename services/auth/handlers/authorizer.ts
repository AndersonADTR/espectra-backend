// services/auth/authorizer.ts
import {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
  APIGatewayEventRequestContext
} from 'aws-lambda';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';

// Tipo unión para manejar ambos tipos de eventos de autorizador
type AuthorizerEvent = APIGatewayTokenAuthorizerEvent | APIGatewayRequestAuthorizerEvent;

/**
 * Extrae el token de autorización del evento
 *
 * @param event - El evento de autorización
 * @returns El token de autorización o null si no se encuentra
 */
function extractToken(event: any): string | null {
  // Caso 1: Token en event.authorizationToken (APIGatewayTokenAuthorizerEvent)
  if (event.authorizationToken) {
    return event.authorizationToken;
  }

  // Caso 2: Token en event.headers.Authorization (APIGatewayRequestAuthorizerEvent)
  if (event.headers) {
    for (const key of Object.keys(event.headers)) {
      if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-authorization') {
        return event.headers[key];
      }
    }
  }

  // Caso 3: Token en event.multiValueHeaders.Authorization (APIGatewayRequestAuthorizerEvent)
  if (event.multiValueHeaders) {
    for (const key of Object.keys(event.multiValueHeaders)) {
      if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-authorization') {
        if (event.multiValueHeaders[key] && event.multiValueHeaders[key].length > 0) {
          return event.multiValueHeaders[key][0];
        }
      }
    }
  }

  // Caso 4: Token en event.queryStringParameters.auth (para WebSocket)
  if (event.queryStringParameters && event.queryStringParameters.auth) {
    return event.queryStringParameters.auth;
  }

  return null;
}

const logger = new Logger('RestApiAuthorizer');
const metrics = new MetricsService('RestAPI');

// Obtener variables de entorno
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

// Log de inicialización
console.log(JSON.stringify({
  message: 'CLOUDWATCH TEST: Authorizer initialization',
  userPoolId,
  clientId,
  timestamp: new Date().toISOString()
}));

// Verificar que las variables de entorno estén definidas
if (!userPoolId || !clientId) {
  console.error(JSON.stringify({
    message: 'CLOUDWATCH TEST: Missing required environment variables',
    userPoolId: !!userPoolId,
    clientId: !!clientId,
    timestamp: new Date().toISOString()
  }));
  throw new Error('Missing required environment variables');
}

// Crear el verificador de JWT
const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "access",
  clientId,
});

export const handler = async (
  event: any
): Promise<APIGatewayAuthorizerResult> => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);

  try {
    // Log completo del evento (sin información sensible)
    console.log(JSON.stringify({
      message: `CLOUDWATCH DEBUG [${requestId}]: Full authorization event`,
      eventKeys: Object.keys(event),
      methodArn: event.methodArn,
      type: event.type,
      hasHeaders: !!event.headers,
      hasMultiValueHeaders: !!event.multiValueHeaders,
      hasAuthorizationToken: !!event.authorizationToken,
      hasQueryStringParameters: !!event.queryStringParameters,
      timestamp: new Date().toISOString()
    }));

    logger.info('Processing authorization request', {
      requestId,
      methodArn: event.methodArn,
      eventType: typeof event,
      hasHeaders: !!event.headers,
      hasMultiValueHeaders: !!event.multiValueHeaders,
      hasAuthorizationToken: !!event.authorizationToken,
      hasQueryStringParameters: !!event.queryStringParameters
    });

    // Extraer el token de autorización
    const authToken = extractToken(event);

    if (!authToken) {
      // No se encontró token en ninguna parte
      console.log(JSON.stringify({
        message: `CLOUDWATCH DEBUG [${requestId}]: No authorization token found in any location`,
        timestamp: new Date().toISOString()
      }));
      logger.error('No authorization token provided');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Log del token recibido (sin mostrar el token completo por seguridad)
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization token received',
      tokenLength: authToken.length,
      tokenStartsWith: authToken.substring(0, 20) + '...',
      hasBearerPrefix: authToken.startsWith('Bearer '),
      timestamp: new Date().toISOString()
    }));

    // Extraer el token si comienza con 'Bearer '
    let token = authToken;
    if (token.startsWith('Bearer ')) {
      token = token.substring(7); // Extraer el token después de 'Bearer '
    }

    // Log del token extraído
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Token extracted',
      tokenLength: token.length,
      source: token === authToken ? 'original' : 'processed',
      timestamp: new Date().toISOString()
    }));

    logger.debug('Token extracted', {
      tokenLength: token.length,
      source: token === authToken ? 'original' : 'processed'
    });

    // Verificar el token
    const payload = await verifier.verify(token);

    // Log del resultado de la verificación
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Token verification successful',
      userId: payload.sub,
      methodArn: event.methodArn,
      timestamp: new Date().toISOString()
    }));

    logger.info('Token verification successful', {
      userId: payload.sub,
      methodArn: event.methodArn
    });

    metrics.incrementCounter('AuthorizationSuccess');

    // Calcular la duración del proceso
    const duration = Date.now() - startTime;

    // Log de finalización
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization process completed',
      duration,
      timestamp: new Date().toISOString()
    }));

    logger.debug('Authorization process completed', {
      duration
    });

    // Generar la política de autorización
    return {
      principalId: payload.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn,
          },
        ],
      },
      context: {
        userId: payload.sub,
        email: payload['email'] as string || 'unknown',
        userType: payload['custom:userType'] as string || 'guest',
        userPlan: payload['custom:userPlan'] as string || 'basic'
      },
    };
  } catch (error) {
    // Log detallado del error
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization failed',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      methodArn: event.methodArn,
      timestamp: new Date().toISOString()
    }));

    logger.error('Authorization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      methodArn: event.methodArn
    });

    metrics.incrementCounter('AuthorizationFailure');

    // Calcular la duración del proceso
    const duration = Date.now() - startTime;

    // Log de finalización
    console.log(JSON.stringify({
      message: 'CLOUDWATCH TEST: Authorization process completed with error',
      duration,
      timestamp: new Date().toISOString()
    }));

    logger.debug('Authorization process completed with error', {
      duration
    });

    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

/**
 * Genera una política de autorización para API Gateway
 *
 * @param principalId - El ID del principal (usuario)
 * @param effect - El efecto de la política (Allow o Deny)
 * @param resource - El recurso al que se aplica la política
 * @returns La política de autorización
 */
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string
): APIGatewayAuthorizerResult => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };
};