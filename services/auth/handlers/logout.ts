import { 
  CognitoIdentityProviderClient,
  GlobalSignOutCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({
  region: process.env.REGION || 'us-east-1'
});

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Logout handler started');

  try {
    const accessToken = event.headers.Authorization?.replace('Bearer ', '');

    if (!accessToken) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Access token is required' })
      };
    }

    await cognito.send(new GlobalSignOutCommand({
      AccessToken: accessToken
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Logged out successfully'
      })
    };

  } catch (error) {
    console.error('Logout error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error during logout',
        error: process.env.STAGE === 'dev' ? error : 'Internal server error'
      })
    };
  }
};