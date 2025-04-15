// services/metrics/business-metrics.service.ts

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from 'uuid';
import { Logger } from '@shared/utils/logger';

export interface MetricDimensions {
  [key: string]: string;
}

export interface MetricData {
  metricName: string;
  value: number;
  unit?: StandardUnit;
  dimensions?: MetricDimensions;
  timestamp?: Date;
}

export interface MetricRecord {
  id: string;
  metricName: string;
  value: number;
  unit: string;
  timestamp: string;
  dimensions?: MetricDimensions;
  ttl?: number;
}

export class BusinessMetricsService {
  private static instance: BusinessMetricsService;
  private readonly cloudWatch: CloudWatchClient;
  private readonly dynamoDB: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly namespace: string;
  private readonly tableName: string;
  private readonly defaultDimensions: MetricDimensions;

  private constructor() {
    this.cloudWatch = new CloudWatchClient({});
    const ddbClient = new DynamoDBClient({});
    this.dynamoDB = DynamoDBDocumentClient.from(ddbClient);
    this.logger = new Logger('BusinessMetricsService');
    
    // Configuraciones desde variables de entorno
    this.namespace = process.env.METRICS_NAMESPACE || 
      `${process.env.SERVICE_NAME}/${process.env.STAGE}`;
    this.tableName = process.env.METRICS_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-metrics`;
    
    // Dimensiones predeterminadas para todas las métricas
    this.defaultDimensions = {
      Service: process.env.SERVICE_NAME || 'spectrum',
      Stage: process.env.STAGE || 'dev',
      Component: 'Concierge'
    };
  }

  public static getInstance(): BusinessMetricsService {
    if (!BusinessMetricsService.instance) {
      BusinessMetricsService.instance = new BusinessMetricsService();
    }
    return BusinessMetricsService.instance;
  }
  
  /**
   * Publica una métrica de negocio en CloudWatch y DynamoDB
   */
  public async trackMetric(metric: MetricData): Promise<void> {
    try {
      // Publicar en CloudWatch
      await this.publishToCloudWatch(metric);
      
      // Guardar en DynamoDB para análisis histórico
      await this.saveToDatabase(metric);
      
    } catch (error) {
      this.logger.error('Error tracking business metric', { 
        error, 
        metric 
      });
      // No lanzamos el error para no interrumpir el flujo principal
    }
  }
  
  /**
   * Incrementa un contador de métrica
   */
  public async incrementCounter(
    metricName: string, 
    count: number = 1, 
    dimensions?: MetricDimensions
  ): Promise<void> {
    await this.trackMetric({
      metricName,
      value: count,
      unit: 'Count',
      dimensions
    });
  }
  
  /**
   * Registra una métrica de duración (latencia, tiempo de procesamiento)
   */
  public async recordDuration(
    metricName: string, 
    milliseconds: number, 
    dimensions?: MetricDimensions
  ): Promise<void> {
    await this.trackMetric({
      metricName,
      value: milliseconds,
      unit: 'Milliseconds',
      dimensions
    });
  }
  
  /**
   * Registra métricas de uso de tokens
   */
  public async trackTokenUsage(
    userId: string, 
    tokens: number, 
    plan: string,
    conversationId?: string
  ): Promise<void> {
    await this.trackMetric({
      metricName: 'TokensUsed',
      value: tokens,
      unit: 'Count',
      dimensions: {
        UserId: userId,
        Plan: plan,
        ...(conversationId && { ConversationId: conversationId })
      }
    });
  }
  
  /**
   * Registra métricas relacionadas con handoffs
   */
  public async trackHandoffMetric(
    metricName: string,
    value: number = 1,
    metadata: Record<string, string> = {}
  ): Promise<void> {
    await this.trackMetric({
      metricName,
      value,
      unit: 'Count',
      dimensions: {
        Category: 'Handoff',
        ...metadata
      }
    });
  }
  
  /**
   * Publica métrica en CloudWatch
   */
  private async publishToCloudWatch(metric: MetricData): Promise<void> {
    try {
      // Combinar dimensiones personalizadas con las predeterminadas
      const dimensions = Object.entries({
        ...this.defaultDimensions,
        ...metric.dimensions
      }).map(([Name, Value]) => ({ Name, Value }));
      
      // Crear comando para CloudWatch
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metric.metricName,
            Value: metric.value,
            Unit: metric.unit || StandardUnit.None,
            Dimensions: dimensions,
            Timestamp: metric.timestamp || new Date()
          }
        ]
      });
      
      // Enviar métrica a CloudWatch
      await this.cloudWatch.send(command);
      
    } catch (error) {
      this.logger.error('Error publishing metric to CloudWatch', { 
        error, 
        metric 
      });
    }
  }
  
  /**
   * Guarda métrica en DynamoDB para análisis histórico
   */
  private async saveToDatabase(metric: MetricData): Promise<void> {
    try {
      const timestamp = (metric.timestamp || new Date()).toISOString();
      const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 días
      
      // Crear registro para DynamoDB
      const record: MetricRecord = {
        id: uuid(),
        metricName: metric.metricName,
        value: metric.value,
        unit: metric.unit || 'None',
        timestamp,
        dimensions: metric.dimensions,
        ttl
      };
      
      // Guardar en DynamoDB
      await this.dynamoDB.send(new PutCommand({
        TableName: this.tableName,
        Item: record
      }));
      
    } catch (error) {
      this.logger.error('Error saving metric to database', { 
        error, 
        metric 
      });
    }
  }
  
  /**
   * Obtiene métricas históricas por nombre y periodo
   */
  public async getMetricsHistory(
    metricName: string,
    startTime: string,
    endTime: string,
    dimensions?: MetricDimensions
  ): Promise<MetricRecord[]> {
    try {
      // Consulta base por nombre y periodo
      const queryParams: any = {
        TableName: this.tableName,
        IndexName: 'MetricNameTimestampIndex',
        KeyConditionExpression: 'metricName = :metricName AND timestamp BETWEEN :startTime AND :endTime',
        ExpressionAttributeValues: {
          ':metricName': metricName,
          ':startTime': startTime,
          ':endTime': endTime
        }
      };
      
      // Si hay dimensiones, añadir filtro
      if (dimensions && Object.keys(dimensions).length > 0) {
        const filterExpressions: string[] = [];
        const expressionValues: Record<string, any> = { ...queryParams.ExpressionAttributeValues };
        
        // Crear expresión de filtro para cada dimensión
        Object.entries(dimensions).forEach(([key, value], index) => {
          const dimKey = `:dim${index}`;
          //const dimName = `:name${index}`;
          filterExpressions.push(`dimensions.${key} = ${dimKey}`);
          expressionValues[dimKey] = value;
        });
        
        queryParams.FilterExpression = filterExpressions.join(' AND ');
        queryParams.ExpressionAttributeValues = expressionValues;
      }
      
      const result = await this.dynamoDB.send(new QueryCommand(queryParams));
      
      return result.Items as MetricRecord[] || [];
      
    } catch (error) {
      this.logger.error('Error retrieving metrics history', { 
        error, 
        metricName,
        startTime,
        endTime,
        dimensions
      });
      throw error;
    }
  }
}