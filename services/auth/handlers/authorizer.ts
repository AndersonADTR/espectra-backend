// services/auth/authorizer.ts
import { 
  APIGatewayTokenAuthorizerEvent, 
  APIGatewayAuthorizerResult 
} from 'aws-lambda';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';

const logger = new Logger('RestApiAuthorizer');
const metrics = new MetricsService('RestAPI');

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

if (!userPoolId || !clientId) {
  throw new Error('Missing required environment variables');
}

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "access",
  clientId,
});

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  try {
    logger.info('Processing authorization request', { methodArn: event.methodArn });

    if (!event.authorizationToken) {
      logger.error('No authorization token provided');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = event.authorizationToken.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    
    logger.info('Token verification successful', { 
      userId: payload.sub,
      methodArn: event.methodArn 
    });
    
    metrics.incrementCounter('AuthorizationSuccess');

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
        email: payload['email'] as string,
        userType: payload['custom:userType'] as string,
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