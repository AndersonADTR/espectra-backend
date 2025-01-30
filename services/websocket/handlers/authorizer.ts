// services/websocket/handlers/authorizer.ts
import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../botpress/config/config';

const logger = new Logger('WebSocketAuthorizer');
const metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);

if (!process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_CLIENT_ID) {
  throw new Error('Missing required environment variables');
}

const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID,
});

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  const startTime = Date.now();
  
  try {
    const token = event.authorizationToken;
    
    logger.debug('WebSocket authorization request received', {
      methodArn: event.methodArn
    });

    if (!token) {
      throw new Error('No authentication token provided');
    }

    const payload = await jwtVerifier.verify(token);

    logger.info('WebSocket authorization successful', { 
      userId: payload.sub,
      latency: Date.now() - startTime
    });

    metrics.incrementCounter('WebSocketAuthorizationSuccess');
    metrics.recordMetric('WebSocketAuthorizationLatency', Date.now() - startTime);

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
        email: typeof payload.email === 'string' ? payload.email : '',
        scope: typeof payload.scope === 'string' ? payload.scope : JSON.stringify(payload.scope),
        userPlan: payload['custom:userPlan'] as string || 'basic'
      }
    };
  } catch (error) {
    logger.error('WebSocket authorization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - startTime
    });

    metrics.incrementCounter('WebSocketAuthorizationFailure');
    metrics.recordMetric('WebSocketAuthorizationLatency', Date.now() - startTime);

    return {
      principalId: 'unauthorized',
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