import { Handler, APIGatewayProxyEvent } from 'aws-lambda';
import { TokenManagementService } from '../../services/token/token-management.service';

/**
 * Handler Lambda para obtener información de uso de tokens
 * Este Lambda proporciona endpoints para consultar el uso de tokens del usuario
 */
export const handler: Handler = async (event: APIGatewayProxyEvent) => {
  
  console.info('Processing token usage request', { 
    path: event.path,
    method: event.httpMethod
  });
  
  // Obtener el ID de usuario del authorizer
  const userId = event.requestContext.authorizer?.userId;
  if (!userId) {
    console.error('No user ID found in request');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized' })
    };
  }
  
  const tokenService = TokenManagementService.getInstance();
  
  try {
    // Obtener el uso actual de tokens
    const tokenUsage = await tokenService.getUserTokenUsage(userId);
    
    // Calcular porcentaje de uso
    const usagePercentage = ((tokenUsage.limit - tokenUsage.remainingTokens) / tokenUsage.limit) * 100;
    
    // Formatear respuesta
    const response = {
      userId: tokenUsage.userId,
      plan: tokenUsage.plan,
      dailyLimit: tokenUsage.limit,
      tokensUsed: tokenUsage.totalTokens,
      tokensRemaining: tokenUsage.remainingTokens,
      usagePercentage: parseFloat(usagePercentage.toFixed(1)),
      date: tokenUsage.date
    };
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('Error getting token usage', { error, userId });
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Error retrieving token usage',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};