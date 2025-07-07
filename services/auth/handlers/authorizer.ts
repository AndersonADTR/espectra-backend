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
    logger.info('Processing authorization request', {
      requestId,
      methodArn: event.methodArn
    });

    // Extraer el token de autorización
    const authToken = extractToken(event);

    if (!authToken) {
      logger.error('No authorization token provided');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    // Extraer el token si comienza con 'Bearer '
    let token = authToken;
    if (token.startsWith('Bearer ')) {
      token = token.substring(7);
    }

    // Verificar el token
    const payload = await verifier.verify(token);

    logger.info('Token verification successful', {
      userId: payload.sub,
      methodArn: event.methodArn
    });

    metrics.incrementCounter('AuthorizationSuccess');

    // Generar la política de autorización con wildcard para evitar cache issues
    const resourceArn = event.methodArn.split('/').slice(0, 2).join('/') + '/*';

    return {
      principalId: payload.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: resourceArn, // Usar wildcard para permitir todos los endpoints
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
    logger.error('Authorization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      methodArn: event.methodArn
    });

    metrics.incrementCounter('AuthorizationFailure');
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
  // Usar wildcard para evitar problemas de cache entre endpoints
  const resourceArn = effect === 'Allow' ?
    resource.split('/').slice(0, 2).join('/') + '/*' :
    resource;

  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resourceArn,
        },
      ],
    },
  };
};