import { 
  CognitoIdentityProviderClient,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({
  region: process.env.REGION || 'us-east-1'
});

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('RefreshToken handler started');

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    const { refreshToken } = JSON.parse(event.body);

    if (!refreshToken) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Refresh token is required' })
      };
    }

    const response = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Token refreshed successfully',
        tokens: {
          accessToken: response.AuthenticationResult?.AccessToken,
          idToken: response.AuthenticationResult?.IdToken,
          expiresIn: response.AuthenticationResult?.ExpiresIn
        }
      })
    };

  } catch (error) {
    console.error('Refresh token error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error refreshing token',
        error: process.env.STAGE === 'dev' ? error : 'Internal server error'
      })
    };
  }
};