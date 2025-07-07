# Fase 2: Sistema de Mensajería y Comunicación en Tiempo Real

## 🎯 **ESTADO: 100% COMPLETADA Y FUNCIONAL**
**Fecha de finalización:** 24 de Junio, 2025
**Implementación:** Polling optimizado para content creators
**Estado:** ✅ OPERATIVO EN PRODUCCIÓN

---

## Descripción General - IMPLEMENTADO
Esta fase implementa el procesamiento completo de mensajes y el sistema de comunicación bidireccional en tiempo real, estableciendo los canales de comunicación entre los content creators y el bot especializado.

## ✅ Objetivos COMPLETADOS
- ✅ **Procesamiento completo de mensajes** - Implementado con Botpress Chat API
- ✅ **Sistema de persistencia** - DynamoDB + Botpress Cloud
- ✅ **Comunicación en tiempo real** - Polling optimizado cada 2 segundos
- ✅ **Flujo de mensajería coherente** - Content creator → Bot → Polling

## Dependencias Previas
- ConversationContextService (Fase 1)
- TokenManagementService (Fase 1)
- Integración básica con Botpress (Fase 1)
- API Gateway WebSocket y API REST (ya configuradas)
- Tablas DynamoDB ChatHistory (ya configuradas)
- Colas SQS para mensajería (ya configuradas)

## Tareas Detalladas

### 1. Implementación del MessageProcessorService

#### 1.1 Estructura Base del Procesador de Mensajes
- Crear clase `MessageProcessorService` en `services/botpress/services/message/message-processor.service.ts`
- Implementar patrones de diseño para pipeline de procesamiento
- Configurar integración con servicios dependientes

```typescript
// Estructura del procesador de mensajes
export class MessageProcessorService {
  private static instance: MessageProcessorService;
  private readonly contextService: ConversationContextService;
  private readonly tokenService: TokenManagementService;
  private readonly botpressService: BotpressService;
  private readonly historyService: ChatHistoryService;
  private readonly logger: Logger;

  private constructor() {
    this.contextService = ConversationContextService.getInstance();
    this.tokenService = TokenManagementService.getInstance();
    this.botpressService = BotpressService.getInstance();
    this.historyService = ChatHistoryService.getInstance();
    this.logger = new Logger('MessageProcessorService');
  }

  public static getInstance(): MessageProcessorService {
    if (!MessageProcessorService.instance) {
      MessageProcessorService.instance = new MessageProcessorService();
    }
    return MessageProcessorService.instance;
  }

  // Métodos para procesamiento de mensajes
}
```

#### 1.2 Pipeline de Procesamiento de Mensajes
- Implementar método `processIncomingMessage(message: IncomingMessage): Promise<ProcessedMessage>`
- Implementar etapas del pipeline:
  - Validación de mensaje y estructura
  - Carga y actualización de contexto
  - Contabilización y validación de tokens
  - Procesamiento por Botpress o asesor según estado
  - Almacenamiento en historial
  - Entrega de respuesta

#### 1.3 Gestión de Estado de Mensajes
- Implementar máquina de estados para seguimiento de mensajes
- Definir estados:
  - `RECEIVED`: Mensaje recibido, pendiente de procesamiento
  - `PROCESSING`: En procesamiento por bot o asesor
  - `COMPLETED`: Procesamiento completado
  - `FAILED`: Error en procesamiento
  - `AWAITING_HUMAN`: Esperando intervención humana
- Implementar transiciones entre estados con validación

#### 1.4 Integración con Eventos
- Configurar emisión de eventos a EventBridge
- Implementar listeners para eventos relevantes
- Establecer comunicación con WebSocket para notificaciones en tiempo real

#### 1.5 Manejo de Errores y Recuperación
- Implementar estrategia de manejo de errores por tipo
- Configurar reintentos automáticos para errores transitorios
- Implementar logging detallado para troubleshooting
- Crear circuito de dead-letter-queue para mensajes no procesables

### 2. Implementación del ChatHistoryService

#### 2.1 Estructura Base del Servicio de Historial
- Crear clase `ChatHistoryService` en `services/botpress/services/history/chat-history.service.ts`
- Implementar singleton pattern con inyección de dependencias
- Configurar acceso a DynamoDB con índices optimizados

```typescript
// Estructura del servicio de historial
export class ChatHistoryService {
  private static instance: ChatHistoryService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly tableName: string;

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client);
    this.logger = new Logger('ChatHistoryService');
    this.tableName = process.env.CHAT_HISTORY_TABLE || `${process.env.RESOURCE_PREFIX}-chat-history-table`;
  }

  public static getInstance(): ChatHistoryService {
    if (!ChatHistoryService.instance) {
      ChatHistoryService.instance = new ChatHistoryService();
    }
    return ChatHistoryService.instance;
  }

  // Métodos para gestión de historial
}
```

#### 2.2 Operaciones de Historial de Chat
- Implementar método `saveMessage(message: ChatMessage): Promise<ChatMessage>`
- Implementar método `getConversationHistory(conversationId: string, options?: PaginationOptions): Promise<ChatMessage[]>`
- Implementar método `getUserConversations(userId: string, options?: PaginationOptions): Promise<Conversation[]>`
- Implementar método `searchMessages(criteria: SearchCriteria): Promise<ChatMessage[]>`

#### 2.3 Optimización de Consultas
- Implementar consultas eficientes utilizando índices secundarios
- Configurar proyecciones para reducir datos transferidos
- Implementar estrategias de paginación para grandes conjuntos de datos
- Establecer estrategia de particionamiento para evitar hot spots

#### 2.4 Políticas de Retención y Archivado
- Implementar TTL para mensajes según política de retención
- Crear proceso de archivado para conversaciones antiguas
- Configurar exportación a S3 para almacenamiento a largo plazo
- Implementar función de restauración para históricos archivados

#### 2.5 Métricas y Monitoreo
- Implementar tracking de tamaño de conversaciones
- Configurar métricas de latencia de consultas
- Establecer alarmas para ítems grandes o consultas lentas
- Implementar logging de auditoría para accesos al historial

### 3. Implementación Completa del WebSocket

#### 3.1 Finalización del WebSocketMessageHandler
- Completar la implementación en `services/websocket/handlers/message.handler.ts`
- Configurar procesamiento de mensajes entrantes
- Implementar integración con MessageProcessorService
- Configurar manejo de errores y recuperación

```typescript
// Manejador de mensajes WebSocket
export const handler: APIGatewayProxyHandler = async (event) => {
  const logger = new Logger('WebSocketMessageHandler');
  logger.info('Processing WebSocket message', { connectionId: event.requestContext.connectionId });

  try {
    // Validar mensaje entrante
    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Message body required' }) };
    }

    const connectionId = event.requestContext.connectionId;
    const connectionManager = ConnectionManager.getInstance();
    const messageProcessor = MessageProcessorService.getInstance();
    
    // Obtener información de la conexión
    const connection = await connectionManager.getConnection(connectionId);
    if (!connection) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Invalid connection' }) };
    }

    // Parsear y procesar mensaje
    const message = JSON.parse(event.body);
    const processedMessage = await messageProcessor.processIncomingMessage({
      userId: connection.userId,
      connectionId,
      content: message.content,
      conversationId: message.conversationId,
      timestamp: new Date().toISOString(),
      source: 'user'
    });

    // Enviar respuesta de vuelta al cliente
    await connectionManager.sendMessageToConnection(connectionId, {
      type: 'MESSAGE_PROCESSED',
      data: processedMessage
    });

    return { statusCode: 200, body: 'Message processed' };
  } catch (error) {
    logger.error('Error processing WebSocket message', { error });
    return { statusCode: 500, body: JSON.stringify({ message: 'Error processing message' }) };
  }
};
```

#### 3.2 Implementación del ConnectionManager
- Crear clase `ConnectionManager` en `services/websocket/services/connection-manager.service.ts`
- Implementar tracking de conexiones activas en DynamoDB
- Configurar limpieza de conexiones inactivas o desconectadas
- Implementar broadcasting de mensajes a usuarios específicos

```typescript
// Gestor de conexiones WebSocket
export class ConnectionManager {
  private static instance: ConnectionManager;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly apiGateway: ApiGatewayManagementApiClient;
  private readonly logger: Logger;
  private readonly tableName: string;

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client);
    this.logger = new Logger('ConnectionManager');
    this.tableName = process.env.CONNECTION_TABLE || `${process.env.RESOURCE_PREFIX}-connections`;
    
    // Configurar cliente de API Gateway para envío de mensajes
    this.apiGateway = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_API_ENDPOINT
    });
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  // Métodos para gestión de conexiones
}
```

#### 3.3 Gestión de Conexiones
- Implementar método `saveConnection(connection: Connection): Promise<Connection>`
- Implementar método `getConnection(connectionId: string): Promise<Connection | null>`
- Implementar método `deleteConnection(connectionId: string): Promise<boolean>`
- Implementar método `getUserConnections(userId: string): Promise<Connection[]>`

#### 3.4 Envío de Mensajes WebSocket
- Implementar método `sendMessageToConnection(connectionId: string, message: any): Promise<boolean>`
- Implementar método `broadcastToUser(userId: string, message: any): Promise<number>` (devuelve número de conexiones a las que se envió)
- Implementar método `broadcastToAll(message: any, filter?: (connection: Connection) => boolean): Promise<number>`
- Configurar manejo de errores y reconexión

#### 3.5 Heartbeat y Monitoreo de Salud
- Implementar sistema de heartbeat para detectar desconexiones
- Configurar limpieza periódica de conexiones obsoletas
- Implementar métricas de conexiones activas
- Configurar alarmas para picos o caídas inusuales

### 4. Integración de Componentes

#### 4.1 Flujo Completo de Mensajes
- Integrar WebSocket, MessageProcessor, ChatHistory y BotpressService
- Implementar diagrama de secuencia detallado
- Configurar logging de fin a fin para seguimiento
- Establecer métricas de rendimiento para cada etapa

#### 4.2 Manejo de Sesiones y Autenticación
- Integrar con el sistema de sesiones existente
- Configurar validación de autenticación para WebSocket
- Implementar limpieza de conexiones por expiración de sesión
- Establecer políticas de seguridad para mensajes

#### 4.3 Sincronización Multi-dispositivo
- Implementar broadcasting a todas las conexiones del mismo usuario
- Configurar identificación de dispositivo en conexiones
- Implementar reconciliación de estado entre dispositivos
- Establecer mecanismo de acknowledgment de mensajes

#### 4.4 Implementación de Pruebas E2E
- Configurar entorno de pruebas para flujo completo
- Implementar casos de prueba para escenarios críticos
- Configurar métricas de cobertura para pruebas
- Establecer pruebas de integración continua

### 5. Sistema de Notificaciones

#### 5.1 Notificaciones en Tiempo Real
- Implementar tipos de notificación:
  - `MESSAGE_RECEIVED`: Nuevo mensaje recibido
  - `CONTEXT_UPDATED`: Cambio en el contexto de la conversación
  - `TOKEN_ALERT`: Alerta de uso de tokens
  - `HANDOFF_REQUIRED`: Se necesita intervención humana
- Configurar envío a través de WebSocket

#### 5.2 Sistema de Entrega Garantizada
- Implementar confirmación de entrega de mensajes
- Configurar reintentos para mensajes no entregados
- Implementar almacenamiento temporal para mensajes pendientes
- Establecer métricas de tasa de entrega

## ✅ Criterios de Aceptación - COMPLETADOS
- ✅ **Procesamiento de mensajes:** < 1 segundo - CUMPLIDO
- ✅ **Persistencia de historial:** Correcta y recuperable - CUMPLIDO
- ✅ **Polling estable:** 2 segundos sin degradación - CUMPLIDO
- ✅ **Escalabilidad:** Serverless auto-scaling - CUMPLIDO
- ✅ **Pruebas E2E:** Flujo completo validado - CUMPLIDO
- ✅ **Tasa de entrega:** 100% en pruebas - CUMPLIDO

## Hitos y Plazos
- Día 1-3: Implementación del MessageProcessorService
- Día 4-5: Implementación del ChatHistoryService
- Día 6-8: Finalización de la implementación WebSocket y ConnectionManager
- Día 9-10: Integración de componentes y pruebas E2E
- Día 11-12: Ajustes finales, optimización y documentación

## Riesgos y Mitigaciones
- **Riesgo**: Alta latencia en envío de mensajes WebSocket
  - **Mitigación**: Implementar distribución regional y compresión de mensajes

- **Riesgo**: Pérdida de mensajes durante fallos
  - **Mitigación**: Configurar persistencia temporal y confirmaciones de entrega

- **Riesgo**: Incremento inesperado de conexiones
  - **Mitigación**: Implementar auto-scaling y límites por usuario

- **Riesgo**: Desconexiones frecuentes de clientes
  - **Mitigación**: Configurar reconexión automática y buffer de mensajes pendientes