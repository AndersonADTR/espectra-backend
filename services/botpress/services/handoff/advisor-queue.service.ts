// services/botpress/services/handoff/advisor-queue.service.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { v4 as uuid } from 'uuid';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { MONITORING_CONFIG } from '../../config/config';

export enum HandoffStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT'
}

export enum AdvisorStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE'
}

export interface HandoffRequest {
  handoffId: string;
  conversationId: string;
  userId: string;
  status: HandoffStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  assignedAdvisorId?: string;
  priorityLevel: number;
  metadata?: Record<string, any>;
}

export interface AdvisorState {
  advisorId: string;
  name: string;
  status: AdvisorStatus;
  activeHandoffs: number;
  lastActivityAt: string;
  skills: string[];
  metadata?: Record<string, any>;
}

export class AdvisorQueueService {
  private static instance: AdvisorQueueService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly sqsClient: SQSClient;
  private readonly eventBridgeClient: EventBridgeClient;
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  
  private readonly handoffTableName: string;
  private readonly advisorTableName: string;
  private readonly handoffQueueUrl: string;
  private readonly eventBusName: string;

  private constructor() {
    const dbClient = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(dbClient);
    this.sqsClient = new SQSClient({});
    this.eventBridgeClient = new EventBridgeClient({});
    this.logger = new Logger('AdvisorQueueService');
    this.metrics = new MetricsService(MONITORING_CONFIG.METRICS.NAMESPACE);
    
    // Nombres de recursos desde variables de entorno
    this.handoffTableName = process.env.HANDOFF_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-handoff-requests`;
    this.advisorTableName = process.env.ADVISOR_TABLE || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-advisors`;
    this.handoffQueueUrl = process.env.HANDOFF_QUEUE_URL || '';
    this.eventBusName = process.env.EVENT_BUS_NAME || 
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-event-bus`;
  }

  public static getInstance(): AdvisorQueueService {
    if (!AdvisorQueueService.instance) {
      AdvisorQueueService.instance = new AdvisorQueueService();
    }
    return AdvisorQueueService.instance;
  }
  
  /**
   * Crea una nueva solicitud de handoff
   */
  public async createHandoffRequest(
    conversationId: string,
    userId: string,
    reason: string,
    priorityLevel: number = 1,
    metadata?: Record<string, any>
  ): Promise<HandoffRequest> {
    try {
      const timestamp = new Date().toISOString();
      const handoffId = uuid();
      
      const handoffRequest: HandoffRequest = {
        handoffId,
        conversationId,
        userId,
        status: HandoffStatus.PENDING,
        reason,
        createdAt: timestamp,
        updatedAt: timestamp,
        priorityLevel,
        metadata
      };
      
      // Guardar en DynamoDB
      await this.dynamoDbClient.send(new PutCommand({
        TableName: this.handoffTableName,
        Item: handoffRequest
      }));
      
      // Enviar a SQS para procesamiento de asignación
      await this.sqsClient.send(new SendMessageCommand({
        QueueUrl: this.handoffQueueUrl,
        MessageBody: JSON.stringify(handoffRequest),
        MessageGroupId: conversationId, // Para garantizar FIFO por conversación
        MessageDeduplicationId: handoffId // Para evitar duplicados
      }));
      
      // Emitir evento a EventBridge
      await this.eventBridgeClient.send(new PutEventsCommand({
        Entries: [
          {
            Source: 'spectrum.handoff',
            DetailType: 'handoff-requested',
            Detail: JSON.stringify(handoffRequest),
            EventBusName: this.eventBusName
          }
        ]
      }));
      
      this.metrics.incrementCounter('HandoffRequests');
      
      this.logger.info('Handoff request created', { 
        handoffId, 
        conversationId, 
        userId 
      });
      
      return handoffRequest;
    } catch (error) {
      this.logger.error('Error creating handoff request', { 
        error, 
        conversationId, 
        userId 
      });
      throw error;
    }
  }

  /**
   * Obtiene información detallada de un asesor
   */
  public async getAdvisorInfo(advisorId: string) {
    try {
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.advisorTableName,
        Key: { advisorId }
      }));

      return result.Item as AdvisorState || null;
    } catch (error) {
      this.logger.error('Error getting advisor info', { error, advisorId });
      throw error;
    }
  }
  
  /**
   * Obtiene una solicitud de handoff
   */
  public async getHandoffRequest(handoffId: string): Promise<HandoffRequest | null> {
    try {
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.handoffTableName,
        Key: { handoffId }
      }));
      
      return result.Item as HandoffRequest || null;
    } catch (error) {
      this.logger.error('Error getting handoff request', { error, handoffId });
      throw error;
    }
  }
  
  /**
   * Actualiza el estado de una solicitud de handoff
   */
  public async updateHandoffStatus(
    handoffId: string, 
    status: HandoffStatus, 
    advisorId?: string
  ): Promise<HandoffRequest> {
    try {
      const timestamp = new Date().toISOString();
      
      // Construir la expresión de actualización
      let updateExpression = 'SET #status = :status, updatedAt = :updatedAt';
      const expressionAttributeNames = { '#status': 'status' };
      const expressionAttributeValues: any = { 
        ':status': status, 
        ':updatedAt': timestamp 
      };
      
      // Si se proporciona advisorId, actualizar ese campo también
      if (advisorId) {
        updateExpression += ', assignedAdvisorId = :advisorId';
        expressionAttributeValues[':advisorId'] = advisorId;
      }
      
      const result = await this.dynamoDbClient.send(new UpdateCommand({
        TableName: this.handoffTableName,
        Key: { handoffId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));
      
      const updatedRequest = result.Attributes as HandoffRequest;
      
      // Emitir evento de cambio de estado
      await this.eventBridgeClient.send(new PutEventsCommand({
        Entries: [
          {
            Source: 'spectrum.handoff',
            DetailType: `handoff-${status.toLowerCase()}`,
            Detail: JSON.stringify(updatedRequest),
            EventBusName: this.eventBusName
          }
        ]
      }));
      
      this.logger.info('Handoff status updated', { 
        handoffId, 
        status, 
        advisorId 
      });
      
      return updatedRequest;
    } catch (error) {
      this.logger.error('Error updating handoff status', { 
        error, 
        handoffId, 
        status 
      });
      throw error;
    }
  }
  
  /**
   * Obtiene las solicitudes pendientes, ordenadas por prioridad y tiempo de espera
   */
  public async getPendingHandoffs(limit: number = 10): Promise<HandoffRequest[]> {
    try {
      const result = await this.dynamoDbClient.send(new QueryCommand({
        TableName: this.handoffTableName,
        IndexName: 'StatusCreatedAtIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': HandoffStatus.PENDING },
        Limit: limit,
        ScanIndexForward: false // Para ordenar por tiempo de espera (más antiguos primero)
      }));
      
      // Ordenar por prioridad (mayor prioridad primero) y luego por tiempo de espera
      const pendingHandoffs = (result.Items as HandoffRequest[] || [])
        .sort((a, b) => {
          // Primero comparar por prioridad
          if (a.priorityLevel !== b.priorityLevel) {
            return b.priorityLevel - a.priorityLevel;
          }
          // Si tienen la misma prioridad, comparar por tiempo de espera
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      
      return pendingHandoffs;
    } catch (error) {
      this.logger.error('Error getting pending handoffs', { error });
      throw error;
    }
  }
  
  /**
   * Obtiene los asesores disponibles
   */
  public async getAvailableAdvisors(): Promise<AdvisorState[]> {
    try {
      const result = await this.dynamoDbClient.send(new QueryCommand({
        TableName: this.advisorTableName,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': AdvisorStatus.AVAILABLE }
      }));
      
      return result.Items as AdvisorState[] || [];
    } catch (error) {
      this.logger.error('Error getting available advisors', { error });
      throw error;
    }
  }
  
  /**
   * Actualiza el estado de un asesor
   */
  public async updateAdvisorStatus(
    advisorId: string, 
    status: AdvisorStatus
  ): Promise<AdvisorState> {
    try {
      const timestamp = new Date().toISOString();
      
      const result = await this.dynamoDbClient.send(new UpdateCommand({
        TableName: this.advisorTableName,
        Key: { advisorId },
        UpdateExpression: 'SET #status = :status, lastActivityAt = :lastActivityAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { 
          ':status': status, 
          ':lastActivityAt': timestamp 
        },
        ReturnValues: 'ALL_NEW'
      }));
      
      const updatedAdvisor = result.Attributes as AdvisorState;
      
      this.logger.info('Advisor status updated', { 
        advisorId, 
        status 
      });
      
      return updatedAdvisor;
    } catch (error) {
      this.logger.error('Error updating advisor status', { 
        error, 
        advisorId, 
        status 
      });
      throw error;
    }
  }
  
  /**
   * Asigna automáticamente una solicitud pendiente a un asesor disponible
   */
  public async assignNextHandoff(): Promise<{handoff: HandoffRequest, advisor: AdvisorState} | null> {
    try {
      // Obtener solicitudes pendientes y asesores disponibles
      const pendingHandoffs = await this.getPendingHandoffs(1);
      const availableAdvisors = await this.getAvailableAdvisors();
      
      if (pendingHandoffs.length === 0 || availableAdvisors.length === 0) {
        return null; // No hay solicitudes o asesores disponibles
      }
      
      const handoff = pendingHandoffs[0];
      
      // Selección simple del primer asesor disponible
      // En una implementación real, se utilizaría un algoritmo más sofisticado
      // que considere la carga de trabajo, habilidades, etc.
      const advisor = availableAdvisors[0];
      
      // Actualizar estado de solicitud y asesor
      const updatedHandoff = await this.updateHandoffStatus(
        handoff.handoffId, 
        HandoffStatus.ASSIGNED, 
        advisor.advisorId
      );
      
      // Incrementar contador de handoffs activos del asesor
      const updatedAdvisor = await this.dynamoDbClient.send(new UpdateCommand({
        TableName: this.advisorTableName,
        Key: { advisorId: advisor.advisorId },
        UpdateExpression: 'SET activeHandoffs = activeHandoffs + :inc, #status = :status, lastActivityAt = :lastActivityAt',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { 
          ':inc': 1, 
          ':status': AdvisorStatus.BUSY, 
          ':lastActivityAt': new Date().toISOString() 
        },
        ReturnValues: 'ALL_NEW'
      }));
      
      this.metrics.incrementCounter('HandoffsAssigned');
      
      this.logger.info('Handoff assigned', { 
        handoffId: handoff.handoffId, 
        advisorId: advisor.advisorId 
      });
      
      return {
        handoff: updatedHandoff,
        advisor: updatedAdvisor.Attributes as AdvisorState
      };
    } catch (error) {
      this.logger.error('Error assigning handoff', { error });
      throw error;
    }
  }
}