// services/websocket/handlers/authorizer.ts

import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Logger } from '@shared/utils/logger';

// Configuración del verificador de JWT de Cognito
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
});

const logger = new Logger('WebSocketAuthorizer');

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken;

  try {
    // Verificar y decodificar el token JWT
    const payload = await jwtVerifier.verify(token);

    logger.info('Token verification successful', { userId: payload.sub });

    // Devolver una política de IAM que permite el acceso
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
    };
  } catch (error) {
    logger.error('Token verification failed', { error });

    // Devolver una política de IAM que deniega el acceso
    return {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: event.methodArn,
          },
        ],
      },
    };
  }
};