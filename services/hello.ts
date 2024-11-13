// services/hello.ts
import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Hello from Spectra Backend!',
        input: event,
      },
      null,
      2
    ),
  };
};