// services/websocket/handlers/authorizer.ts
import { 
  APIGatewayRequestAuthorizerHandler, 
  APIGatewayAuthorizerResult, 
  StatementEffect,
  APIGatewayRequestAuthorizerEvent
} from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('WebSocketAuthorizer');

// Mover la creación del verifier a una función para mejor manejo de errores
const createVerifier = () => {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new Error('Missing Cognito configuration');
  }

  return CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: 'access',
    timeout: 5000
  });
};

// Separar la lógica de verificación del token
const verifyToken = async (token: string) => {
  const verifier = createVerifier();
  try {
    return await verifier.verify(token);
  } catch (error) {
    logger.error('Token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : 'Unknown'
    });
    throw error;
  }
};

// Mejorar la generación de política con tipos más específicos
const generatePolicy = (
  principalId: string, 
  effect: StatementEffect, 
  resource: string, 
  context?: Record<string, string | number | boolean | null>
): APIGatewayAuthorizerResult => {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }
      ]
    },
    // Asegurarnos de que el contexto solo contenga valores serializables
    ...(context && { context })
  };

  logger.debug('Generated policy', { 
    principalId,
    effect,
    resource,
    hasContext: !!context 
  });

  return authResponse;
};

export const handler: APIGatewayRequestAuthorizerHandler = async (event: APIGatewayRequestAuthorizerEvent) => {
  logger.info('Starting authorization', {
    methodArn: event.methodArn,
    requestId: event.requestContext?.requestId,
    path: event.path,
    protocol: event.headers?.['X-Forwarded-Proto']
  });

  try {
    // Validar la existencia de variables de entorno al inicio
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    logger.debug('Checking configuration', {
      hasUserPoolId: !!userPoolId,
      hasClientId: !!clientId
    });

    if (!userPoolId || !clientId) {
      logger.error('Missing Cognito configuration');
      throw new Error('Configuration error: Missing Cognito settings');
    }

    const token = event.queryStringParameters?.Auth;

    if (!token) {
      logger.warn('No authorization token provided', {
        queryParams: event.queryStringParameters
      });
      return generatePolicy('unauthorized', 'Deny', event.methodArn);
    }

    logger.debug('Attempting token verification');
    const payload = await verifyToken(token);

    logger.info('Authorization successful', {
      sub: payload.sub,
      groups: payload['cognito:groups'],
      tokenUse: payload.token_use
    });

    // Incluir información relevante en el contexto
    const context = {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      groups: Array.isArray(payload['cognito:groups']) 
        ? payload['cognito:groups'].join(',') 
        : '',
      scope: payload.scope || ''
    };

    return generatePolicy(payload.sub, 'Allow', event.methodArn, context);

  } catch (error) {
    logger.error('Authorization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : 'Unknown',
      methodArn: event.methodArn,
      requestId: event.requestContext?.requestId
    });

    // En caso de error, denegar el acceso
    return generatePolicy('unauthorized', 'Deny', event.methodArn);
  }
};