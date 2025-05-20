// services/monitoring/handlers/system-health.handler.ts

import { Handler } from 'aws-lambda';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';

interface HealthCheckResult {
  service: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  metrics: Record<string, number>;
  timestamp: string;
}

/**
 * Lambda handler para monitorear la salud del sistema y generar alertas
 * cuando se detectan problemas. Se ejecuta periódicamente via EventBridge.
 */
export const handler: Handler = async () => {
  const logger = new Logger('SystemHealthHandler');
  logger.info('Starting system health check');
  
  const cloudWatch = new CloudWatchClient({});
  const eventBridge = new EventBridgeClient({});
  const sns = new SNSClient({});
  const dynamoDbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  try {
    // Verificar componentes críticos del sistema
    const healthChecks = await Promise.all([
      checkApiGatewayHealth(cloudWatch),
      checkLambdaHealth(cloudWatch),
      checkDynamoDBHealth(cloudWatch),
      checkWebSocketHealth(cloudWatch, dynamoDbClient),
      checkBotpressIntegrationHealth(cloudWatch, dynamoDbClient)
    ]);
    
    // Determinar salud general del sistema
    const systemStatus = determineSystemStatus(healthChecks);
    
    // Guardar resultados en DynamoDB
    await saveHealthCheckResults(dynamoDbClient, healthChecks);
    
    // Si el sistema está degradado o no saludable, enviar alertas
    if (systemStatus !== 'HEALTHY') {
      await sendAlerts(sns, eventBridge, systemStatus, healthChecks);
    }
    
    logger.info('System health check completed', { 
      status: systemStatus,
      componentsChecked: healthChecks.length
    });
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        status: systemStatus,
        components: healthChecks
      })
    };
  } catch (error) {
    logger.error('Error performing system health check', { error });
    
    // Intento de enviar alerta crítica
    try {
      await sns.send(new PublishCommand({
        TopicArn: process.env.CRITICAL_ALERTS_TOPIC_ARN,
        Subject: `[CRITICAL] System Health Check Failed`,
        Message: `System health check failed at ${new Date().toISOString()}: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
    } catch (snsError) {
      logger.error('Failed to send critical alert', { error: snsError });
    }
    
    throw error;
  }
};

/**
 * Verifica la salud de API Gateway
 */
async function checkApiGatewayHealth(cloudWatch: CloudWatchClient): Promise<HealthCheckResult> {
  // Métricas clave a verificar
  const metrics = [
    { name: 'Count', id: 'requests' },
    { name: '4XXError', id: 'errors4xx' },
    { name: '5XXError', id: 'errors5xx' },
    { name: 'Latency', id: 'latency' }
  ];
  
  // Construir consulta de métricas
  const metricDataQueries = metrics.map((metric, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/ApiGateway',
        MetricName: metric.name,
        Dimensions: [
          {
            Name: 'ApiName',
            Value: process.env.API_GATEWAY_NAME || 'spectrum-api'
          }
        ]
      },
      Period: 300, // 5 minutos
      Stat: metric.name === 'Latency' ? 'Average' : 'Sum'
    }
  }));
  
  // Obtener datos de métricas
  const result = await cloudWatch.send(new GetMetricDataCommand({
    StartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    EndTime: new Date(),
    MetricDataQueries: metricDataQueries
  }));
  
  // Procesar resultados
  const metricValues: Record<string, number> = {};
  result.MetricDataResults?.forEach((metricData, index) => {
    const metricName = metrics[index].id;
    // Usar el último valor disponible o 0
    const lastValue = metricData.Values?.length ? 
      metricData.Values[metricData.Values.length - 1] : 0;
    metricValues[metricName] = lastValue || 0;
  });
  
  // Determinar estado
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  
  // Criterios de salud
  if (metricValues.errors5xx > 0) {
    status = 'UNHEALTHY';
  } else if (metricValues.errors4xx / (metricValues.requests || 1) > 0.1) {
    status = 'DEGRADED';
  } else if (metricValues.latency > 1000) { // > 1
  } else if (metricValues.latency > 1000) { // > 1 segundo promedio
    status = 'DEGRADED';
  }
  
  return {
    service: 'ApiGateway',
    status,
    metrics: metricValues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Verifica la salud de las funciones Lambda
 */
async function checkLambdaHealth(cloudWatch: CloudWatchClient): Promise<HealthCheckResult> {
  // Métricas clave a verificar
  const metrics = [
    { name: 'Invocations', id: 'invocations' },
    { name: 'Errors', id: 'errors' },
    { name: 'Throttles', id: 'throttles' },
    { name: 'Duration', id: 'duration' }
  ];
  
  // Consultar métricas para todas las funciones Lambda del proyecto
  const metricDataQueries = metrics.map((metric, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/Lambda',
        MetricName: metric.name,
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: '*' // Todas las funciones
          }
        ]
      },
      Period: 300, // 5 minutos
      Stat: metric.name === 'Duration' ? 'Average' : 'Sum'
    }
  }));
  
  // Obtener datos de métricas
  const result = await cloudWatch.send(new GetMetricDataCommand({
    StartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    EndTime: new Date(),
    MetricDataQueries: metricDataQueries
  }));
  
  // Procesar resultados
  const metricValues: Record<string, number> = {};
  result.MetricDataResults?.forEach((metricData, index) => {
    const metricName = metrics[index].id;
    // Usar el último valor disponible o 0
    const lastValue = metricData.Values?.length ? 
      metricData.Values[metricData.Values.length - 1] : 0;
    metricValues[metricName] = lastValue || 0;
  });
  
  // Determinar estado
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  
  // Criterios de salud
  if (metricValues.errors / (metricValues.invocations || 1) > 0.1) {
    status = 'UNHEALTHY'; // >10% de tasa de error
  } else if (metricValues.throttles > 0) {
    status = 'DEGRADED'; // Cualquier limitación (throttling)
  } else if (metricValues.duration > 5000) {
    status = 'DEGRADED'; // Promedio >5 segundos
  }
  
  return {
    service: 'Lambda',
    status,
    metrics: metricValues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Verifica la salud de DynamoDB
 */
async function checkDynamoDBHealth(cloudWatch: CloudWatchClient): Promise<HealthCheckResult> {
  // Métricas clave a verificar
  const metrics = [
    { name: 'SuccessfulRequestLatency', id: 'latency' },
    { name: 'ThrottledRequests', id: 'throttles' },
    { name: 'SystemErrors', id: 'systemErrors' },
    { name: 'UserErrors', id: 'userErrors' },
    { name: 'ConsumedReadCapacityUnits', id: 'readCapacity' },
    { name: 'ConsumedWriteCapacityUnits', id: 'writeCapacity' }
  ];
  
  // Construir consulta de métricas
  const metricDataQueries = metrics.map((metric, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/DynamoDB',
        MetricName: metric.name,
        Dimensions: [] // Todas las tablas
      },
      Period: 300, // 5 minutos
      Stat: metric.name === 'SuccessfulRequestLatency' ? 'Average' : 'Sum'
    }
  }));
  
  // Obtener datos de métricas
  const result = await cloudWatch.send(new GetMetricDataCommand({
    StartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    EndTime: new Date(),
    MetricDataQueries: metricDataQueries
  }));
  
  // Procesar resultados
  const metricValues: Record<string, number> = {};
  result.MetricDataResults?.forEach((metricData, index) => {
    const metricName = metrics[index].id;
    // Usar el último valor disponible o 0
    const lastValue = metricData.Values?.length ? 
      metricData.Values[metricData.Values.length - 1] : 0;
    metricValues[metricName] = lastValue || 0;
  });
  
  // Determinar estado
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  
  // Criterios de salud
  if (metricValues.systemErrors > 0) {
    status = 'UNHEALTHY';
  } else if (metricValues.throttles > 0) {
    status = 'DEGRADED';
  } else if (metricValues.latency > 100) { // >100ms promedio
    status = 'DEGRADED';
  }
  
  return {
    service: 'DynamoDB',
    status,
    metrics: metricValues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Verifica la salud de las conexiones WebSocket
 */
async function checkWebSocketHealth(
  cloudWatch: CloudWatchClient,
  dynamoDb: DynamoDBDocumentClient
): Promise<HealthCheckResult> {
  // Nombre de la tabla de conexiones WebSocket
  const connectionsTableName = process.env.CONNECTIONS_TABLE || 
    `${process.env.RESOURCE_PREFIX}-websocket-connections`;
  
  // Contar conexiones activas
  const activeConnectionsResult = await dynamoDb.send(new ScanCommand({
    TableName: connectionsTableName,
    Select: 'COUNT'
  }));
  
  const activeConnections = activeConnectionsResult.Count || 0;
  
  // Métricas de WebSocket API en CloudWatch
  const metrics = [
    { name: 'ConnectCount', id: 'connects' },
    { name: 'MessageCount', id: 'messages' },
    { name: 'ClientError', id: 'clientErrors' },
    { name: 'ExecutionError', id: 'executionErrors' },
    { name: 'IntegrationLatency', id: 'latency' }
  ];
  
  // Construir consulta de métricas
  const metricDataQueries = metrics.map((metric, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/ApiGateway',
        MetricName: metric.name,
        Dimensions: [
          {
            Name: 'ApiId',
            Value: process.env.WEBSOCKET_API_ID || 'spectrum-ws'
          }
        ]
      },
      Period: 300, // 5 minutos
      Stat: metric.name === 'IntegrationLatency' ? 'Average' : 'Sum'
    }
  }));
  
  // Obtener datos de métricas
  const result = await cloudWatch.send(new GetMetricDataCommand({
    StartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    EndTime: new Date(),
    MetricDataQueries: metricDataQueries
  }));
  
  // Procesar resultados
  const metricValues: Record<string, number> = {
    activeConnections
  };
  
  result.MetricDataResults?.forEach((metricData, index) => {
    const metricName = metrics[index].id;
    // Usar el último valor disponible o 0
    const lastValue = metricData.Values?.length ? 
      metricData.Values[metricData.Values.length - 1] : 0;
    metricValues[metricName] = lastValue || 0;
  });
  
  // Determinar estado
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  
  // Criterios de salud
  if (metricValues.executionErrors > 0) {
    status = 'UNHEALTHY';
  } else if (metricValues.clientErrors / (metricValues.messages || 1) > 0.1) {
    status = 'DEGRADED'; // >10% de errores de cliente
  } else if (metricValues.latency > 300) { // >300ms promedio
    status = 'DEGRADED';
  }
  
  return {
    service: 'WebSocket',
    status,
    metrics: metricValues,
    timestamp: new Date().toISOString()
  };
}

/**
 * Verifica la salud de la integración con Botpress
 */
async function checkBotpressIntegrationHealth(
  cloudWatch: CloudWatchClient,
  dynamoDb: DynamoDBDocumentClient
): Promise<HealthCheckResult> {
  // Obtener métricas personalizadas de la integración con Botpress
  const metricDataQueries = [
    {
      Id: 'm1',
      MetricStat: {
        Metric: {
          Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
          MetricName: 'BotpressRequestSuccess',
          Dimensions: []
        },
        Period: 300,
        Stat: 'Sum'
      }
    },
    {
      Id: 'm2',
      MetricStat: {
        Metric: {
          Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
          MetricName: 'BotpressRequestFailure',
          Dimensions: []
        },
        Period: 300,
        Stat: 'Sum'
      }
    },
    {
      Id: 'm3',
      MetricStat: {
        Metric: {
          Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
          MetricName: 'BotpressResponseLatency',
          Dimensions: []
        },
        Period: 300,
        Stat: 'Average'
      }
    },
    {
      Id: 'm4',
      MetricStat: {
        Metric: {
          Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
          MetricName: 'WebhookProcessingSuccess',
          Dimensions: []
        },
        Period: 300,
        Stat: 'Sum'
      }
    },
    {
      Id: 'm5',
      MetricStat: {
        Metric: {
          Namespace: process.env.METRICS_NAMESPACE || 'Spectrum/Concierge',
          MetricName: 'WebhookProcessingFailure',
          Dimensions: []
        },
        Period: 300,
        Stat: 'Sum'
      }
    }
  ];
  
  // Obtener datos de métricas
  const result = await cloudWatch.send(new GetMetricDataCommand({
    StartTime: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    EndTime: new Date(),
    MetricDataQueries: metricDataQueries
  }));
  
  // Preparar valores de métricas
  const metricValues: Record<string, number> = {
    requestSuccess: 0,
    requestFailure: 0,
    responseLatency: 0,
    webhookSuccess: 0,
    webhookFailure: 0
  };
  
  // Nombres de métricas según el orden de las consultas
  const metricNames = [
    'requestSuccess',
    'requestFailure',
    'responseLatency',
    'webhookSuccess',
    'webhookFailure'
  ];
  
  // Procesar resultados
  result.MetricDataResults?.forEach((metricData, index) => {
    const metricName = metricNames[index];
    // Usar el último valor disponible o 0
    const lastValue = metricData.Values?.length ? 
      metricData.Values[metricData.Values.length - 1] : 0;
    metricValues[metricName] = lastValue || 0;
  });
  
  // Calcular tasa de error y volumen total
  const totalRequests = metricValues.requestSuccess + metricValues.requestFailure;
  const errorRate = totalRequests > 0 ? 
    metricValues.requestFailure / totalRequests : 0;
  
  // Determinar estado
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  
  // Criterios de salud
  if (errorRate > 0.1) {
    status = 'UNHEALTHY'; // >10% de tasa de error
  } else if (metricValues.responseLatency > 2000) {
    status = 'DEGRADED'; // >2 segundos de latencia promedio
  } else if (metricValues.webhookFailure > 0) {
    status = 'DEGRADED'; // Cualquier fallo en el procesamiento de webhooks
  }
  
  return {
    service: 'BotpressIntegration',
    status,
    metrics: {
      ...metricValues,
      errorRate,
      totalRequests
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Determina el estado general del sistema basado en los chequeos individuales
 */
function determineSystemStatus(healthChecks: HealthCheckResult[]): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' {
  // Si algún componente está UNHEALTHY, el sistema está UNHEALTHY
  if (healthChecks.some(check => check.status === 'UNHEALTHY')) {
    return 'UNHEALTHY';
  }
  
  // Si algún componente está DEGRADED, el sistema está DEGRADED
  if (healthChecks.some(check => check.status === 'DEGRADED')) {
    return 'DEGRADED';
  }
  
  // Si todos los componentes están HEALTHY, el sistema está HEALTHY
  return 'HEALTHY';
}

/**
 * Guarda los resultados de los chequeos de salud en DynamoDB
 */
async function saveHealthCheckResults(
  dynamoDb: DynamoDBDocumentClient, 
  healthChecks: HealthCheckResult[]
): Promise<void> {
  // Nombre de la tabla de historial de salud
  const healthHistoryTable = process.env.HEALTH_HISTORY_TABLE || 
    `${process.env.RESOURCE_PREFIX}-health-history`;
  
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 días
  
  // Crear item para la tabla
  const item = {
    id: `health-${timestamp}`,
    timestamp,
    results: healthChecks,
    overallStatus: determineSystemStatus(healthChecks),
    ttl
  };
  
  await dynamoDb.send(new PutCommand({
    TableName: healthHistoryTable,
    Item: item
  }));
}

/**
 * Envía alertas cuando el sistema está degradado o no saludable
 */
async function sendAlerts(
  sns: SNSClient,
  eventBridge: EventBridgeClient,
  systemStatus: 'DEGRADED' | 'UNHEALTHY',
  healthChecks: HealthCheckResult[]
): Promise<void> {
  // Filtrar componentes con problemas
  const problematicComponents = healthChecks.filter(
    check => check.status !== 'HEALTHY'
  );
  
  // Construir mensaje de alerta
  const subject = `[${systemStatus}] System Health Alert`;
  
  let message = `System health status: ${systemStatus} at ${new Date().toISOString()}\n\n`;
  message += 'Components with issues:\n\n';
  
  problematicComponents.forEach(component => {
    message += `* ${component.service}: ${component.status}\n`;
    message += `  Metrics: ${JSON.stringify(component.metrics, null, 2)}\n\n`;
  });
  
  // Seleccionar el tema SNS apropiado según la severidad
  const topicArn = systemStatus === 'UNHEALTHY' 
    ? process.env.CRITICAL_ALERTS_TOPIC_ARN 
    : process.env.WARNING_ALERTS_TOPIC_ARN;
  
  if (topicArn) {
    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message
    }));
  }
  
  // Emitir evento a EventBridge
  await eventBridge.send(new PutEventsCommand({
    Entries: [
      {
        Source: 'spectrum.system-health',
        DetailType: `system-health-${systemStatus.toLowerCase()}`,
        Detail: JSON.stringify({
          status: systemStatus,
          timestamp: new Date().toISOString(),
          components: problematicComponents
        }),
        EventBusName: process.env.EVENT_BUS_NAME || 
          `${process.env.RESOURCE_PREFIX}-event-bus`
      }
    ]
  }));
}