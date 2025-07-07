# Plan Detallado de Implementación SSE

## 🎯 Objetivos y Principios
- **Funcionalidad primero**: Chat en tiempo real sin interrupciones
- **Buenas prácticas**: Código limpio, testeable, mantenible
- **Arquitectura simple**: Una conversación activa por usuario
- **Recovery robusto**: Usar Botpress como fuente de verdad

## ✅ FASE 2: IMPLEMENTACIÓN SSE CORE COMPLETADA (DÍA 2)

### Resumen de Implementación:
- [x] Estructura de directorios SSE creada
- [x] Tipos SSE definidos completamente
- [x] Configuración SSE implementada con validación
- [x] BotpressSSEService implementado con:
  - [x] Conexión a listenConversation endpoint
  - [x] Manejo de eventos SSE
  - [x] Reconexión automática con backoff exponencial
  - [x] Sincronización de mensajes perdidos
  - [x] Limpieza automática de conexiones
- [x] SSEManagerService implementado con:
  - [x] Gestión de streams SSE a clientes
  - [x] Routing de eventos Botpress → Cliente
  - [x] Rate limiting y cleanup
  - [x] Métricas y estadísticas
- [x] Handlers SSE implementados:
  - [x] listen.handler.ts (endpoint cliente SSE)
  - [x] botpress-events.handler.ts (procesamiento eventos)
- [x] Tests unitarios básicos creados
- [x] Errores de TypeScript corregidos

### Archivos Creados:
- `services/sse/types/sse.types.ts`
- `services/sse/config/sse.config.ts`
- `services/sse/services/botpress-sse.service.ts`
- `services/sse/services/sse-manager.service.ts`
- `services/sse/handlers/listen.handler.ts`
- `services/sse/handlers/botpress-events.handler.ts`
- `services/sse/tests/sse.test.ts`

## 📊 FASE 2: IMPLEMENTACIÓN SSE CORE (Días 2-3) - ORIGINAL PLAN

### 2.1 Crear Tipos y Configuración Base (1 hora)

#### Paso 2.1.1: Crear tipos SSE (30 min)
```typescript
// services/sse/types/sse.types.ts
export interface SSEConnection {
  userId: string;
  conversationId: string;
  connectionId: string;
  userKey: string;
  lastActivity: string;
  status: 'ACTIVE' | 'RECONNECTING' | 'CLOSED';
}

export interface BotpressSSEEvent {
  type: 'message' | 'typing' | 'error';
  conversationId: string;
  data: any;
  timestamp: string;
}

export interface ClientSSEEvent {
  type: 'message' | 'status' | 'error';
  conversationId: string;
  content: any;
  timestamp: string;
}
```

#### Paso 2.1.2: Crear configuración SSE (30 min)
```typescript
// services/sse/config/sse.config.ts
export const SSE_CONFIG = {
  CLIENT: {
    HEARTBEAT_INTERVAL: 30000,
    CONNECTION_TIMEOUT: 300000,
    RETRY_INTERVAL: 5000,
    MAX_RETRIES: 3
  },
  BOTPRESS: {
    RECONNECT_DELAY: 1000,
    MAX_RECONNECT_ATTEMPTS: 5,
    TIMEOUT: 30000
  }
};
```

### 2.2 Implementar BotpressSSEService (3 horas)

#### Paso 2.2.1: Estructura base (1 hora)
```typescript
// services/sse/services/botpress-sse.service.ts
export class BotpressSSEService {
  private activeConnections: Map<string, EventSource> = new Map();
  
  async startListening(conversationId: string, userKey: string): Promise<void>
  async stopListening(conversationId: string): Promise<void>
  async handleBotpressEvent(event: BotpressSSEEvent): Promise<void>
  private async reconnectToConversation(conversationId: string): Promise<void>
}
```

#### Paso 2.2.2: Implementar conexión a listenConversation (1 hora)
- [ ] Conectar a endpoint Botpress `listenConversation`
- [ ] Manejar autenticación con x-user-key
- [ ] Implementar parsing de eventos SSE
- [ ] Configurar error handling

#### Paso 2.2.3: Implementar reconexión automática (1 hora)
- [ ] Detectar desconexiones
- [ ] Implementar backoff exponencial
- [ ] Recuperar mensajes perdidos con getMessages
- [ ] Logging detallado para debugging

### 2.3 Implementar SSEManagerService (3 horas)

#### Paso 2.3.1: Gestión de conexiones cliente (1.5 horas)
```typescript
// services/sse/services/sse-manager.service.ts
export class SSEManagerService {
  private clientConnections: Map<string, Response> = new Map();
  
  async createClientStream(userId: string, conversationId: string): Promise<Response>
  async closeClientStream(userId: string): Promise<void>
  async sendEventToClient(userId: string, event: ClientSSEEvent): Promise<void>
  async handleClientDisconnect(userId: string): Promise<void>
}
```

#### Paso 2.3.2: Routing de eventos (1 hora)
- [ ] Recibir eventos de BotpressSSEService
- [ ] Transformar formato Botpress → Cliente
- [ ] Enviar a conexión SSE específica
- [ ] Manejar errores de envío

#### Paso 2.3.3: Cleanup y gestión de estado (30 min)
- [ ] Detectar conexiones muertas
- [ ] Limpiar recursos automáticamente
- [ ] Métricas de conexiones activas

### 2.4 Crear Endpoints SSE (2 horas)

#### Paso 2.4.1: Endpoint para cliente (1 hora)
```typescript
// services/sse/handlers/listen.handler.ts
export const handler: APIGatewayProxyHandler = async (event) => {
  // GET /api/conversations/{conversationId}/listen?userId={userId}
  // Retorna SSE stream
};
```

#### Paso 2.4.2: Handler de eventos Botpress (1 hora)
```typescript
// services/sse/handlers/botpress-events.handler.ts
export const handler = async (event: any) => {
  // Procesa eventos de Botpress SSE
  // Enruta a clientes apropiados
};
```

## ✅ FASE 3: INTEGRACIÓN COMPLETA COMPLETADA (DÍA 3)

### Resumen de Integración:
- [x] Servicios existentes actualizados para usar SSE:
  - [x] HandoffService integrado con BotpressEventsHandler
  - [x] MessageProcessorService usando SSEManagerService
  - [x] Token Alert Handler enviando via SSE
  - [x] Advisor Send Message Handler usando SSE
  - [x] Webhook handlers actualizados para SSE
- [x] Funciones SSE agregadas a serverless-phase4.yml:
  - [x] sseConversationListen (GET /conversations/{id}/listen)
  - [x] sseConversationListenOptions (OPTIONS CORS)
- [x] Infraestructura SSE implementada:
  - [x] CloudWatch logs y métricas
  - [x] DynamoDB table para tracking conexiones
  - [x] IAM roles y políticas
  - [x] CloudWatch dashboard
  - [x] SNS alertas
- [x] Tests de integración creados y funcionando
- [x] Package de serverless exitoso con funciones SSE

### Endpoints SSE Disponibles:
- `GET /conversations/{conversationId}/listen` - Stream SSE para cliente
- `OPTIONS /conversations/{conversationId}/listen` - CORS preflight

### Servicios Integrados:
- **HandoffService**: Notificaciones de handoff via SSE
- **MessageProcessorService**: Confirmaciones y errores via SSE
- **TokenAlertHandler**: Alertas de tokens via SSE
- **AdvisorSendMessage**: Mensajes de asesores via SSE
- **WebhookHandlers**: Respuestas de Botpress via SSE

### Infraestructura Desplegada:
- **SSE Connections Table**: Tracking de conexiones activas
- **CloudWatch Metrics**: Monitoreo en tiempo real
- **SNS Alerts**: Notificaciones de problemas
- **IAM Roles**: Permisos específicos para SSE

## 📊 FASE 3: INTEGRACIÓN COMPLETA (Día 4) - ORIGINAL PLAN

### 3.1 Integrar con Endpoints Existentes (2 horas)

#### Paso 3.1.1: Modificar endpoint de conversaciones (1 hora)
- [ ] Actualizar `services/botpress/handlers/conversation/conversation.ts`
- [ ] Iniciar SSE cuando se crea/obtiene conversación
- [ ] Integrar con SSEManagerService

#### Paso 3.1.2: Integrar envío de mensajes (1 hora)
- [ ] Mantener POST para envío de mensajes
- [ ] Asegurar que respuestas lleguen via SSE
- [ ] Coordinar entre REST y SSE

### 3.2 Implementar Recovery de Mensajes (2 horas)

#### Paso 3.2.1: Detectar mensajes perdidos (1 hora)
```typescript
async function syncMissedMessages(
  conversationId: string, 
  userKey: string, 
  lastMessageId?: string
): Promise<void> {
  // 1. Llamar getMessages desde lastMessageId
  // 2. Enviar mensajes perdidos al cliente
  // 3. Reanudar stream normal
}
```

#### Paso 3.2.2: Integrar con reconexión (1 hora)
- [ ] Llamar sync en reconexión SSE
- [ ] Manejar duplicados
- [ ] Ordenar mensajes por timestamp

### 3.3 Testing End-to-End (2 horas)

#### Paso 3.3.1: Casos de prueba básicos (1 hora)
- [ ] Usuario envía mensaje → recibe respuesta via SSE
- [ ] Desconexión → reconexión automática
- [ ] Múltiples usuarios simultáneos

#### Paso 3.3.2: Casos de prueba de recovery (1 hora)
- [ ] Simular pérdida de conexión
- [ ] Verificar recuperación de mensajes
- [ ] Probar límites de reconexión

### 3.4 Configuración Serverless (2 horas)

#### Paso 3.4.1: Agregar funciones SSE (1 hora)
```yaml
# serverless-phase4.yml
functions:
  sseListener:
    handler: services/sse/handlers/listen.handler
    events:
      - http:
          path: conversations/{conversationId}/listen
          method: get
          cors: true
```

#### Paso 3.4.2: Variables de entorno (1 hour)
- [ ] Configurar endpoints SSE
- [ ] Timeouts y retry policies
- [ ] Métricas y logging
