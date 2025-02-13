// services/auth/handlers/getUser.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyHandler } from 'aws-lambda';

// Inicializar el cliente DynamoDB
const ddbClient = new DynamoDBClient({
  region: process.env.REGION || 'us-east-1'
});
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('GetUser handler started');

  try {
    // Validar userId
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Missing userId parameter' 
        })
      };
    }

    console.log(`Fetching user data for userId: ${userId}`);

    // Obtener el usuario de DynamoDB
    const result = await dynamodb.send(new GetCommand({
      TableName: `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`,
      Key: {
        userId: userId
      }
    }));

    // Verificar si el usuario existe
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          message: 'User not found' 
        })
      };
    }

    // Remover campos sensibles antes de enviar la respuesta
    const { password, ...userWithoutPassword } = result.Item;

    // Devolver datos del usuario
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(userWithoutPassword)
    };

  } catch (error) {
    console.error('Error retrieving user:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Error retrieving user',
        error: process.env.STAGE === 'dev' ? 
          error instanceof Error ? error.message : 'Unknown error' 
          : 'Internal server error'
      })
    };
  }
};