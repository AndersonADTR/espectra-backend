// services/auth/authorizer.ts
import { 
  APIGatewayTokenAuthorizerEvent, 
  APIGatewayAuthorizerResult 
} from 'aws-lambda';
import { CognitoJwtVerifier } from "aws-jwt-verify";
  
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  
  const verifier = CognitoJwtVerifier.create({
    userPoolId: userPoolId!,
    tokenUse: "access",
    clientId: clientId!,
  });
  
  export const handler = async (
    event: APIGatewayTokenAuthorizerEvent
  ): Promise<APIGatewayAuthorizerResult> => {
    try {
      const token = event.authorizationToken.replace('Bearer ', '');
      const payload = await verifier.verify(token);
      
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
          userPlan: payload['custom:userPlan'] as string || 'basic' // Añadir plan de usuario
        },
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      throw new Error('Unauthorized');
    }
  };