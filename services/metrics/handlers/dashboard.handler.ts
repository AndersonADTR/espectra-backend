// services/metrics/handlers/dashboard.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { BusinessMetricsService } from '../business-metrics.service';
import { Logger } from '@shared/utils/logger';
import { ErrorHandlingMiddleware } from '@shared/middleware/error/error-handling.middleware';

const logger = new Logger('DashboardMetricsHandler');

const dashboardHandler: APIGatewayProxyHandler = async (event) => {
  try {
    // Obtener parámetros de consulta
    const startTime = event.queryStringParameters?.startTime || 
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Último día por defecto
    
    const endTime = event.queryStringParameters?.endTime || 
      new Date().toISOString();
    
    const metrics = event.queryStringParameters?.metrics?.split(',') || [
      'TokensUsed', 
      'HandoffsInitiated', 
      'HandoffsCompleted', 
      'MessageCount',
      'APILatency'
    ];
    
    // Servicio de métricas
    const metricsService = BusinessMetricsService.getInstance();
    
    // Recolectar métricas para el dashboard
    const results = await Promise.all(
      metrics.map(async (metricName) => {
        const metricData = await metricsService.getMetricsHistory(
          metricName,
          startTime,
          endTime
        );
        
        return {
          metricName,
          data: metricData
        };
      })
    );
    
    // Procesar datos para visualización
    const dashboardData = results.map(result => {
      // Agrupar datos por hora para reducir puntos de datos
      const hourlyData = result.data.reduce((acc, item) => {
        // Redondear timestamp a la hora
        const hour = new Date(item.timestamp).setMinutes(0, 0, 0);
        const hourKey = new Date(hour).toISOString();
        
        if (!acc[hourKey]) {
          acc[hourKey] = {
            timestamp: hourKey,
            count: 0,
            sum: 0
          };
        }
        
        acc[hourKey].count++;
        acc[hourKey].sum += item.value;
        
        return acc;
      }, {} as Record<string, {timestamp: string, count: number, sum: number}>);
      
      // Convertir a array y calcular promedios
      const dataPoints = Object.values(hourlyData).map(hourData => ({
        timestamp: hourData.timestamp,
        value: hourData.sum / hourData.count,
        count: hourData.count
      }));
      
      // Ordenar por timestamp
      dataPoints.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      return {
        metricName: result.metricName,
        dataPoints
      };
    });
    
    logger.info('Dashboard metrics retrieved', { 
      startTime, 
      endTime, 
      metrics 
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dashboardData,
        timeRange: {
          startTime,
          endTime
        }
      })
    };
  } catch (error) {
    logger.error('Error retrieving dashboard metrics', { error });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Error retrieving dashboard metrics',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

// Exportar con middleware de manejo de errores
export const handler = ErrorHandlingMiddleware.withErrorHandling(dashboardHandler);