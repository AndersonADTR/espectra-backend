// services/metrics/anomaly-detection.service.ts

import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { Logger } from '@shared/utils/logger';
import { BusinessMetricsService } from './business-metrics.service';

export interface AnomalyRule {
  id: string;
  metricName: string;
  evaluationPeriod: string; // '1h', '1d', etc.
  threshold: number;
  comparisonOperator: 'GreaterThan' | 'LessThan' | 'GreaterThanOrEqualTo' | 'LessThanOrEqualTo';
  // Qué porcentaje de desviación es considerado anómalo
  anomalyThreshold: number;
  // Severidad de la alerta (1-5)
  severity: number;
  // Canales de notificación
  notificationChannels: ('email' | 'sms' | 'slack')[];
}

export interface AnomalyEvent {
  id: string;
  ruleId: string;
  metricName: string;
  currentValue: number;
  baselineValue: number;
  deviation: number;
  timestamp: string;
  status: 'Open' | 'Acknowledged' | 'Resolved';
  metadata?: Record<string, any>;
}

export class AnomalyDetectionService {
  private static instance: AnomalyDetectionService;
  private readonly logger: Logger;
  private readonly dynamoDb: DynamoDBDocumentClient;
  private readonly eventBridge: EventBridgeClient;
  private readonly sns: SNSClient;
  private readonly metricsService: BusinessMetricsService;
  
  private readonly rulesTableName: string;
  private readonly anomaliesTableName: string;
  private readonly eventBusName: string;

  private constructor() {
    this.logger = new Logger('AnomalyDetectionService');
    
    const dbClient = new DynamoDBClient({});
    this.dynamoDb = DynamoDBDocumentClient.from(dbClient);
    this.eventBridge = new EventBridgeClient({});
    this.sns = new SNSClient({});
    this.metricsService = BusinessMetricsService.getInstance();
    
    // Nombres de recursos desde variables de entorno
    this.rulesTableName = process.env.ANOMALY_RULES_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-anomaly-rules`;
    this.anomaliesTableName = process.env.ANOMALIES_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-anomalies`;
    this.eventBusName = process.env.EVENT_BUS_NAME || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-event-bus`;
  }

  public static getInstance(): AnomalyDetectionService {
    if (!AnomalyDetectionService.instance) {
      AnomalyDetectionService.instance = new AnomalyDetectionService();
    }
    return AnomalyDetectionService.instance;
  }
  
  /**
   * Evalúa una métrica contra sus reglas de detección de anomalías
   */
  public async evaluateMetric(
    metricName: string,
    currentValue: number,
    dimensions?: Record<string, string>
  ): Promise<boolean> {
    try {
      // Obtener reglas para esta métrica
      const rules = await this.getRulesForMetric(metricName);
      if (rules.length === 0) {
        return false; // No hay reglas configuradas para esta métrica
      }
      
      let anomalyDetected = false;
      
      // Evaluar cada regla
      for (const rule of rules) {
        // Obtener línea base para comparación
        const baseline = await this.getMetricBaseline(
          metricName,
          rule.evaluationPeriod,
          dimensions
        );
        
        if (!baseline) {
          continue; // No hay suficientes datos para establecer una línea base
        }
        
        // Calcular desviación
        const deviation = Math.abs((currentValue - baseline) / baseline * 100);
        
        // Verificar si supera el umbral de anomalía
        if (deviation >= rule.anomalyThreshold) {
          // Verificar operador de comparación
          let conditionMet = false;
          
          switch (rule.comparisonOperator) {
            case 'GreaterThan':
              conditionMet = currentValue > baseline;
              break;
            case 'LessThan':
              conditionMet = currentValue < baseline;
              break;
            case 'GreaterThanOrEqualTo':
              conditionMet = currentValue >= baseline;
              break;
            case 'LessThanOrEqualTo':
              conditionMet = currentValue <= baseline;
              break;
          }
          
          if (conditionMet) {
            // Anomalía detectada, crear evento
            await this.createAnomalyEvent({
              ruleId: rule.id,
              metricName,
              currentValue,
              baselineValue: baseline,
              deviation,
              metadata: { dimensions }
            });
            
            // Enviar notificaciones
            await this.sendNotifications(rule, {
              metricName,
              currentValue,
              baselineValue: baseline,
              deviation,
              dimensions
            });
            
            anomalyDetected = true;
          }
        }
      }
      
      return anomalyDetected;
    } catch (error) {
      this.logger.error('Error evaluating metric for anomalies', { 
        error, 
        metricName, 
        currentValue 
      });
      return false;
    }
  }
  
  /**
   * Obtiene las reglas de detección para una métrica específica
   */
  private async getRulesForMetric(metricName: string): Promise<AnomalyRule[]> {
    try {
      // En una implementación real, se consultaría a DynamoDB
      // Por simplicidad, devolvemos reglas predefinidas
      
      const defaultRules: AnomalyRule[] = [
        {
          id: 'rule1',
          metricName: 'TokensUsed',
          evaluationPeriod: '1d',
          threshold: 0,
          comparisonOperator: 'GreaterThan',
          anomalyThreshold: 50, // 50% de desviación
          severity: 3,
          notificationChannels: ['email']
        },
        {
          id: 'rule2',
          metricName: 'HandoffsRequested',
          evaluationPeriod: '1h',
          threshold: 0,
          comparisonOperator: 'GreaterThan',
          anomalyThreshold: 100, // 100% de desviación (el doble)
          severity: 4,
          notificationChannels: ['email', 'slack']
        },
        {
          id: 'rule3',
          metricName: 'APILatency',
          evaluationPeriod: '15m',
          threshold: 0,
          comparisonOperator: 'GreaterThan',
          anomalyThreshold: 50, // 50% de desviación
          severity: 5,
          notificationChannels: ['email', 'slack', 'sms']
        }
      ];
      
      return defaultRules.filter(rule => rule.metricName === metricName);
    } catch (error) {
      this.logger.error('Error getting anomaly rules', { error, metricName });
      return [];
    }
  }
  
  /**
   * Obtiene el valor de línea base de una métrica para un período determinado
   */
  private async getMetricBaseline(
    metricName: string,
    period: string,
    dimensions?: Record<string, string>
  ): Promise<number | null> {
    try {
      // Calcular ventana de tiempo para la línea base
      const endTime = new Date().toISOString();
      let startTime: string;
      
      switch (period) {
        case '15m':
          startTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          break;
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          break;
        case '1d':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      }
      
      // Obtener métricas históricas
      const metrics = await this.metricsService.getMetricsHistory(
        metricName,
        startTime,
        endTime,
        dimensions
      );
      
      // Necesitamos suficientes datos para establecer una línea base
      if (metrics.length < 3) {
        return null;
      }
      
      // Calcular promedio como línea base
      const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
      return sum / metrics.length;
    } catch (error) {
      this.logger.error('Error getting metric baseline', { 
        error, 
        metricName, 
        period 
      });
      return null;
    }
  }
  
  /**
   * Crea un evento de anomalía
   */
  private async createAnomalyEvent(params: {
    ruleId: string;
    metricName: string;
    currentValue: number;
    baselineValue: number;
    deviation: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const anomalyId = `anomaly-${params.metricName}-${timestamp}`;
      
      const anomalyEvent: AnomalyEvent = {
        id: anomalyId,
        ruleId: params.ruleId,
        metricName: params.metricName,
        currentValue: params.currentValue,
        baselineValue: params.baselineValue,
        deviation: params.deviation,
        timestamp,
        status: 'Open',
        metadata: params.metadata
      };
      
      // Guardar en DynamoDB
      await this.dynamoDb.send(new PutCommand({
        TableName: this.anomaliesTableName,
        Item: anomalyEvent
      }));
      
      // Emitir evento a EventBridge
      await this.eventBridge.send(new PutEventsCommand({
        Entries: [
          {
            Source: 'spectrum.anomaly',
            DetailType: 'anomaly-detected',
            Detail: JSON.stringify(anomalyEvent),
            EventBusName: this.eventBusName
          }
        ]
      }));
      
      this.logger.info('Anomaly event created', { 
        anomalyId, 
        metricName: params.metricName, 
        deviation: params.deviation 
      });
    } catch (error) {
      this.logger.error('Error creating anomaly event', { 
        error, 
        metricName: params.metricName 
      });
    }
  }
  
  /**
   * Envía notificaciones para una anomalía detectada
   */
  private async sendNotifications(
    rule: AnomalyRule,
    anomalyData: {
      metricName: string;
      currentValue: number;
      baselineValue: number;
      deviation: number;
      dimensions?: Record<string, string>;
    }
  ): Promise<void> {
    try {
      const message = this.formatNotificationMessage(rule, anomalyData);
      
      // Enviar a los canales configurados
      for (const channel of rule.notificationChannels) {
        switch (channel) {
          case 'email':
            await this.sendEmailNotification(rule.severity, message);
            break;
          case 'sms':
            await this.sendSmsNotification(rule.severity, message);
            break;
          case 'slack':
            await this.sendSlackNotification(rule.severity, message);
            break;
        }
      }
    } catch (error) {
      this.logger.error('Error sending anomaly notifications', { 
        error, 
        ruleId: rule.id, 
        metricName: anomalyData.metricName 
      });
    }
  }
  
  /**
   * Formatea el mensaje de notificación
   */
  private formatNotificationMessage(
    rule: AnomalyRule,
    anomalyData: {
      metricName: string;
      currentValue: number;
      baselineValue: number;
      deviation: number;
      dimensions?: Record<string, string>;
    }
  ): string {
    const severityText = ['', 'Info', 'Low', 'Medium', 'High', 'Critical'][rule.severity] || 'Unknown';
    
    let dimensionsText = '';
    if (anomalyData.dimensions && Object.keys(anomalyData.dimensions).length > 0) {
      dimensionsText = '\nDimensions: ' + 
        Object.entries(anomalyData.dimensions)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ');
    }
    
    return `[${severityText}] Anomaly Detected in ${anomalyData.metricName}
      
Current Value: ${anomalyData.currentValue}
Baseline Value: ${anomalyData.baselineValue.toFixed(2)}
Deviation: ${anomalyData.deviation.toFixed(2)}%${dimensionsText}

Time: ${new Date().toISOString()}
Environment: ${process.env.STAGE || 'dev'}
Service: ${process.env.SERVICE_NAME || 'spectrum'}`;
  }
  
  /**
   * Envía una notificación por email
   */
  private async sendEmailNotification(severity: number, message: string): Promise<void> {
    try {
      // Obtener el tema SNS según la severidad
      const topicArn = process.env[`SNS_TOPIC_SEV${severity}`] || 
        process.env.SNS_TOPIC_DEFAULT;
      
      if (!topicArn) {
        this.logger.warn('No SNS topic configured for email notifications');
        return;
      }
      
      await this.sns.send(new PublishCommand({
        TopicArn: topicArn,
        Subject: `[${severity}] Anomaly Detected`,
        Message: message
      }));
      
      this.logger.info('Email notification sent', { severity });
    } catch (error) {
      this.logger.error('Error sending email notification', { error, severity });
    }
  }
  
  /**
   * Envía una notificación por SMS
   */
  private async sendSmsNotification(severity: number, message: string): Promise<void> {
    // Implementación simplificada - en producción utilizaría SNS con la configuración adecuada
    try {
      // Solo enviar SMS para alertas de alta severidad
      if (severity < 4) {
        return;
      }
      
      const phoneNumber = process.env.ALERT_PHONE_NUMBER;
      if (!phoneNumber) {
        this.logger.warn('No phone number configured for SMS notifications');
        return;
      }
      
      await this.sns.send(new PublishCommand({
        PhoneNumber: phoneNumber,
        Message: message
      }));
      
      this.logger.info('SMS notification sent', { severity });
    } catch (error) {
      this.logger.error('Error sending SMS notification', { error, severity });
    }
  }
  
  /**
   * Envía una notificación a Slack
   */
  private async sendSlackNotification(severity: number, message: string): Promise<void> {
    // Implementación simplificada - en producción utilizaría un webhook de Slack o Lambda integración
    this.logger.info('Slack notification would be sent here', { severity, message });
  }
}
