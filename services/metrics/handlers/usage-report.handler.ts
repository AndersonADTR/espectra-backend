// services/metrics/handlers/usage-report.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('UsageReportHandler');

const usageReportHandler: APIGatewayProxyHandler = async (event) => {
  try {
    // Obtener parámetros
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'User ID is required' })
      };
    }
    
    // Obtener periodo de consulta
    const startDate = event.queryStringParameters?.startDate || 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Último mes
    
    const endDate = event.queryStringParameters?.endDate || 
      new Date().toISOString().split('T')[0];
    
    // Inicializar cliente DynamoDB
    const ddbClient = new DynamoDBClient({});
    const documentClient = DynamoDBDocumentClient.from(ddbClient);
    
    // Nombre de la tabla de uso de tokens
    const tokenTableName = process.env.TOKEN_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-token-usage-table`;
    
    // Consultar uso de tokens
    const tokenUsageResult = await documentClient.send(new QueryCommand({
      TableName: tokenTableName,
      KeyConditionExpression: 'userId = :userId AND #date BETWEEN :startDate AND :endDate',
      ExpressionAttributeNames: {
        '#date': 'date'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate,
        ':endDate': endDate
      }
    }));
    
    const tokenUsage = tokenUsageResult.Items || [];
    
    // Calcular estadísticas de uso
    const totalTokensUsed = tokenUsage.reduce((sum, item) => sum + (item.totalTokens || 0), 0);
    const dailyAverage = tokenUsage.length > 0 ? totalTokensUsed / tokenUsage.length : 0;
    const maxDailyUsage = tokenUsage.reduce((max, item) => 
      Math.max(max, item.totalTokens || 0), 0);
    
    // Obtener plan actual
    const currentPlan = tokenUsage.length > 0 ? 
      tokenUsage[tokenUsage.length - 1].plan : 'unknown';
    
    // Nombre de la tabla de handoffs
    const handoffTableName = process.env.HANDOFF_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-handoff-requests`;
    
    // Consultar handoffs del usuario
    const handoffResult = await documentClient.send(new QueryCommand({
      TableName: handoffTableName,
      IndexName: 'UserIdCreatedAtIndex',
      KeyConditionExpression: 'userId = :userId AND createdAt BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startDate': startDate + 'T00:00:00.000Z',
        ':endDate': endDate + 'T23:59:59.999Z'
      }
    }));
    
    const handoffs = handoffResult.Items || [];
    
    // Calcular estadísticas de handoffs
    const totalHandoffs = handoffs.length;
    const handoffsByStatus = handoffs.reduce((acc: Record<string, number>, item) => {
      const status = item.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    // Construir reporte
    const report = {
      userId,
      timeRange: {
        startDate,
        endDate
      },
      tokenUsage: {
        totalTokensUsed,
        dailyAverage,
        maxDailyUsage,
        currentPlan,
        dailyData: tokenUsage.map(item => ({
          date: item.date,
          totalTokens: item.totalTokens,
          remainingTokens: item.remainingTokens,
          limit: item.limit
        }))
      },
      handoffs: {
        totalHandoffs,
        byStatus: handoffsByStatus,
        details: handoffs.map(item => ({
          handoffId: item.handoffId,
          conversationId: item.conversationId,
          status: item.status,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          reason: item.reason
        }))
      }
    };
    
    logger.info('Usage report generated', { userId, startDate, endDate });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(report)
    };
  } catch (error) {
    logger.error('Error generating usage report', { error });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Error generating usage report',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(usageReportHandler);