# Fase 3: Sistema de Human Handoff

## Descripción General
Esta fase implementa el sistema de transferencia de conversaciones desde el bot a asesores humanos, un componente crítico del Módulo Concierge que permite escalar la atención según las necesidades del usuario.

## Objetivos
- Implementar detección inteligente de necesidad de intervención humana
- Desarrollar sistema de cola y asignación de asesores
- Crear APIs para panel de control de asesores
- Implementar sistema completo de transición entre bot y asesor humano

## Dependencias Previas
- MessageProcessorService (Fase 2)
- ConversationContextService (Fase 1)
- WebSocket ConnectionManager (Fase 2)
- BotpressService (Fase 1)
- HandoffQueue en SQS (ya configurada)
- HandoffEventBus en EventBridge (ya configurado)

## Tareas Detalladas

### 1. Implementación del HandoffDetectionService

#### 1.1 Estructura Base del Servicio de Detección
- Crear clase `HandoffDetectionService` en `services/botpress/services/handoff/handoff-detection.service.ts`
- Implementar singleton pattern y configuración de dependencias
- Establecer sistema de reglas para detección

```typescript
// Estructura del servicio de detección de handoff
export class HandoffDetectionService {
  private static instance: HandoffDetectionService;
  private readonly botpressService: BotpressService;
  private readonly contextService: ConversationContextService;
  private readonly logger: Logger;
  private readonly keywordTriggers: string[];
  private readonly confidenceThreshold: number;

  private constructor() {
    this.botpressService = BotpressService.getInstance();
    this.contextService = ConversationContextService.getInstance();
    this.logger = new Logger('HandoffDetectionService');
    
    // Configurar parámetros desde variables de entorno
    this.confidenceThreshold = parseFloat(process.env.BOTPRESS_CONFIDENCE_THRESHOLD || '0.4');
    this.keywordTriggers = (process.env.HANDOFF_KEYWORD_TRIGGERS || 'agent,human,person,supervisor')
      .split(',')
      .map(keyword => keyword.trim().toLowerCase());
  }

  public static getInstance(): HandoffDetectionService {
    if (!HandoffDetectionService.instance) {
      HandoffDetectionService.instance = new HandoffDetectionService();
    }
    return HandoffDetectionService.instance;
  }

  // Métodos para detección de handoff
}
```

#### a1.2 Implementación de Mecanismos de Detección
- Implementar método `shouldHandoff(message: ProcessedMessage, botResponse: BotpressResponse): Promise<HandoffDecision>`
- Implementar detección basada en:
  - Solicitud explícita del usuario (palabras clave)
  - Baja confianza en respuestas de Botpress
  - Patrones de insatisfacción del usuario
  - Límites de tokens alcanzados
  - Complejidad del tema detectada
  - Número de interacciones sin resolución

#### 1.3 Procesamiento de Señales de Botpress
- Implementar método `analyzeBotpressConfidence(response: BotpressResponse): number`
- Configurar extracción de metadatos relevantes de respuestas
- Implementar detección de patrones de indecisión en respuestas
- Establecer umbrales adaptables según tipo de consulta

#### 1.4 Análisis de Sentimiento y Frustración
- Implementar método `detectUserFrustration(messages: ChatMessage[]): boolean`
- Configurar detección de patrones de frustración (repeticiones, cambios de tono)
- Implementar análisis de palabras clave negativas o preguntas repetidas
- Establecer umbrales de alarma para intervención proactiva

#### 1.5 Integración y Pruebas
- Configurar integración con MessageProcessorService
- Implementar pruebas unitarias para cada mecanismo de detección
- Crear conjunto de casos de prueba representativos
- Configurar métricas de precisión y recall para evaluación continua

### 2. Implementación del AdvisorQueueService

#### 2.1 Estructura Base del Servicio de Cola
- Crear clase `AdvisorQueueService` en `services/botpress/services/handoff/advisor-queue.service.ts`
- Implementar patrón singleton y configuración de dependencias
- Establecer interfaz para gestión de cola de asesores

```typescript
// Estructura del servicio de cola de asesores
export class AdvisorQueueService {
  private static instance: AdvisorQueueService;
  private readonly sqsClient: SQSClient;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly eventBridge: EventBridgeClient;
  private readonly logger: Logger;
  private readonly queueUrl: string;
  private readonly handoffTableName: string;

  private constructor() {
    this.sqsClient = new SQSClient({});
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client);
    this.eventBridge = new EventBridgeClient({});
    this.logger = new Logger('AdvisorQueueService');
    
    this.queueUrl = process.env.HANDOFF_QUEUE_URL || '';
    this.handoffTableName = process.env.HANDOFF_TABLE || `${process.env.RESOURCE_PREFIX}-handoff-table`;
  }

  public static getInstance(): AdvisorQueueService {
    if (!AdvisorQueueService.instance) {
      AdvisorQueueService.instance = new AdvisorQueueService();
    }
    return AdvisorQueueService.instance;
  }

  // Métodos para gestión de cola
}
```

#### 2.2 Operaciones de Cola FIFO
- Implementar método `addToQueue(handoff: HandoffRequest): Promise<HandoffRequest>`
- Implementar método `getNextInQueue(): Promise<HandoffRequest | null>`
- Implementar método `updateHandoffStatus(handoffId: string, status: HandoffStatus, advisorId?: string): Promise<HandoffRequest>`
- Implementar método `getHandoffDetails(handoffId: string): Promise<HandoffRequest>`

#### 2.3 Gestión de Estado de Asesores
- Implementar método `updateAdvisorStatus(advisorId: string, status: AdvisorStatus): Promise<AdvisorState>`
- Implementar método `getAvailableAdvisors(): Promise<AdvisorState[]>`
- Implementar método `getAdvisorWorkload(advisorId: string): Promise<number>`
- Configurar tracking de métricas de disponibilidad

#### 2.4 Asignación Inteligente de Handoffs
- Implementar método `assignHandoff(handoffId: string): Promise<HandoffAssignment>`
- Establecer algoritmo de distribución equitativa
- Implementar priorización basada en:
  - Tiempo de espera
  - Tipo de cliente (plan)
  - Complejidad de la consulta
  - Especialidad del asesor
- Configurar métricas de efectividad de asignación

#### 2.5 Notificaciones a Asesores
- Implementar método `notifyAdvisor(advisorId: string, handoff: HandoffRequest): Promise<boolean>`
- Configurar publicación de eventos a EventBridge
- Implementar sistema de escalado para handoffs no atendidos
- Establecer métricas de tiempo de respuesta

### 3. Implementación de APIs para Panel de Asesores

#### 3.1 Endpoints para Gestión de Handoffs
- Implementar endpoint `POST /api/handoff/accept` en `services/botpress/handlers/handoff/accept.handler.ts`
- Implementar endpoint `POST /api/handoff/reject` en `services/botpress/handlers/handoff/reject.handler.ts`
- Implementar endpoint `POST /api/handoff/transfer` en `services/botpress/handlers/handoff/transfer.handler.ts`
- Implementar endpoint `POST /api/handoff/resolve` en `services/botpress/handlers/handoff/resolve.handler.ts`

```typescript
// Ejemplo de handler para aceptar handoff
export const handler: APIGatewayProxyHandler = async (event) => {
  const logger = new Logger('AcceptHandoffHandler');
  
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    // Obtener ID del asesor del token de autenticación
    const advisorId = event.requestContext.authorizer?.claims?.sub;
    if (!advisorId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }

    // Procesar solicitud
    const request = JSON.parse(event.body);
    const handoffId = request.handoffId;
    
    if (!handoffId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'handoffId is required' })
      };
    }

    // Aceptar el handoff
    const queueService = AdvisorQueueService.getInstance();
    const handoff = await queueService.updateHandoffStatus(
      handoffId, 
      HandoffStatus.ACCEPTED, 
      advisorId
    );
    
    // Notificar al usuario que un asesor se ha unido
    const handoffService = HandoffService.getInstance();
    await handoffService.notifyUserOfAdvisorJoin(handoff.conversationId, advisorId);
    
    logger.info('Handoff accepted', { handoffId, advisorId });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Handoff accepted successfully',
        handoff
      })
    };
  } catch (error) {
    logger.error('Error accepting handoff', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to accept handoff',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
```

#### 3.2 Endpoints para Gestión de Estado de Asesores
- Implementar endpoint `PUT /api/advisor/status` en `services/advisor/handlers/status.handler.ts`
- Implementar endpoint `GET /api/advisor/queue` en `services/advisor/handlers/queue.handler.ts`
- Implementar endpoint `GET /api/advisor/active` en `services/advisor/handlers/active.handler.ts`
- Implementar endpoint `GET /api/advisor/metrics` en `services/advisor/handlers/metrics.handler.ts`

#### 3.3 APIs para Mensajería de Asesores
- Implementar endpoint `POST /api/advisor/message` en `services/advisor/handlers/message.handler.ts`
- Configurar integración con ConnectionManager para entrega por WebSocket
- Implementar tracking de mensajes de asesores en historial
- Establecer métricas de tiempo de respuesta

#### 3.4 Seguridad y Controles de Acceso
- Implementar middleware de autorización para endpoints de asesores
- Configurar validación de roles y permisos
- Implementar registro de auditoría para acciones sensibles
- Configurar rate limiting específico para acciones de asesores

### 4. Implementación del HandoffService

#### 4.1 Estructura Base del Servicio de Handoff
- Crear clase `HandoffService` en `services/botpress/services/handoff/handoff.service.ts`
- Implementar patrón singleton y configuración de dependencias
- Establecer punto central para gestión de handoffs

```typescript
// Estructura del servicio de handoff
export class HandoffService {
  private static instance: HandoffService;
  private readonly queueService: AdvisorQueueService;
  private readonly detectionService: HandoffDetectionService;
  private readonly contextService: ConversationContextService;
  private readonly connectionManager: ConnectionManager;
  private readonly logger: Logger;

  private constructor() {
    this.queueService = AdvisorQueueService.getInstance();
    this.detectionService = HandoffDetectionService.getInstance();
    this.contextService = ConversationContextService.getInstance();
    this.connectionManager = ConnectionManager.getInstance();
    this.logger = new Logger('HandoffService');
  }

  public static getInstance(): HandoffService {
    if (!HandoffService.instance) {
      HandoffService.instance = new HandoffService();
    }
    return HandoffService.instance;
  }

  // Métodos para gestión de handoff
}
```

#### 4.2 Flujo de Handoff
- Implementar método `initiateHandoff(conversationId: string, reason: HandoffReason): Promise<HandoffRequest>`
- Implementar método `completeHandoff(handoffId: string): Promise<HandoffRequest>`
- Implementar método `cancelHandoff(handoffId: string): Promise<HandoffRequest>`
- Configurar logging detallado de cada etapa

#### 4.3 Transición entre Bot y Asesor
- Implementar método `transitionToBotpress(conversationId: string): Promise<boolean>`
- Implementar método `transitionToAdvisor(conversationId: string, advisorId: string): Promise<boolean>`
- Configurar actualización de contexto durante transiciones
- Implementar notificaciones a clientes durante cambios

#### 4.4 Gestión de Metadata de Handoff
- Implementar método `updateHandoffMetadata(handoffId: string, metadata: Record<string, any>): Promise<HandoffRequest>`
- Configurar sincronización de metadata con Botpress
- Implementar persistencia de información relevante para futuras interacciones
- Establecer mecanismo de feedback para mejora continua

### 5. Métricas y Monitoreo del Sistema de Handoff

#### 5.1 Métricas de Negocio
- Implementar tracking de:
  - Tasa de handoff por tipo de consulta
  - Tiempo promedio de respuesta de asesores
  - Tasa de resolución por asesor
  - Duración promedio de interacciones
  - Número de handoffs por usuario/plan
- Configurar dashboards en CloudWatch

#### 5.2 Alertas Operacionales
- Configurar alertas para:
  - Cola de espera superior a umbral
  - Tiempo de respuesta excesivo
  - Falta de asesores disponibles
  - Tasa de handoff anormalmente alta
  - Fallos en asignación de handoffs
- Establecer canales de notificación por severidad

#### 5.3 Tests de Integración
- Implementar pruebas de flujo completo de handoff
- Crear escenarios de prueba para casos borde:
  - No hay asesores disponibles
  - Múltiples solicitudes simultáneas
  - Fallo durante asignación
  - Desconexión durante handoff
- Configurar suite de pruebas automatizadas

## Criterios de Aceptación
- El sistema debe detectar correctamente la necesidad de handoff con precisión >80%
- La cola FIFO debe distribuir equitativamente las solicitudes entre asesores
- El tiempo promedio desde solicitud hasta asignación debe ser <30 segundos
- La transición entre bot y asesor debe ser transparente para el usuario
- Las métricas deben proporcionar visibilidad clara del rendimiento del sistema
- El sistema debe manejar al menos 50 handoffs simultáneos sin degradación

## Hitos y Plazos
- Día 1-3: Implementación del HandoffDetectionService
- Día 4-6: Implementación del AdvisorQueueService
- Día 7-9: Implementación de APIs para panel de asesores
- Día 10-12: Implementación del HandoffService
- Día 13-14: Métricas, pruebas y ajustes finales

## Riesgos y Mitigaciones
- **Riesgo**: Falsos positivos en detección de handoff
  - **Mitigación**: Implementar sistema de feedback para ajuste continuo de algoritmos

- **Riesgo**: Tiempo de espera excesivo por falta de asesores
  - **Mitigación**: Configurar sistema de escalado y notificaciones proactivas

- **Riesgo**: Pérdida de contexto durante transición
  - **Mitigación**: Implementar persistencia redundante y sincronización automática

- **Riesgo**: Asignaciones desbalanceadas entre asesores
  - **Mitigación**: Implementar algoritmos de balanceo de carga con ajuste dinámico