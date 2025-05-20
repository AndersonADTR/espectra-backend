// services/botpress/handlers/token/reset-daily-tokens.handler.ts

import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TokenManagementService } from '../../services/token/token-management.service';

/**
 * Handler Lambda para resetear los tokens diarios de todos los usuarios
 * Este Lambda se ejecuta diariamente a medianoche UTC mediante un evento programado de EventBridge
 */
export const handler: Handler = async (event) => {
  console.info('Starting daily token reset process', { event });

  const tokenService = TokenManagementService.getInstance();
  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);
  const usersTable = process.env.USERS_TABLE ||
    `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`;

  try {
    // Obtener todos los usuarios activos
    // Nota: En producción, esto debería paginarse para manejar grandes volúmenes de usuarios
    const result = await ddbDocClient.send(new ScanCommand({
      TableName: usersTable,
      FilterExpression: 'attribute_exists(status) AND status = :active',
      ExpressionAttributeValues: {
        ':active': 'active'
      }
    }));

    const users = result.Items || [];
    console.info(`Found ${users.length} active users for token reset`);

    // Resetear tokens para cada usuario
    const resetPromises = users.map(user =>
      tokenService.resetDailyTokens(user.userId)
        .catch(error => {
          console.error('Error resetting tokens for user', {
            error,
            userId: user.userId
          });
          return null;
        })
    );

    const results = await Promise.all(resetPromises);
    const successCount = results.filter(result => result !== null).length;

    console.info('Daily token reset completed', {
      totalUsers: users.length,
      successCount,
      failureCount: users.length - successCount
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily token reset completed',
        totalUsers: users.length,
        successCount,
        failureCount: users.length - successCount
      })
    };
  } catch (error) {
    console.error('Error in daily token reset process', { error });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in daily token reset process',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};