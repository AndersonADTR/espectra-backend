# Fase 1: Implementación del Sistema de Contexto y Gestión de Tokens

## Descripción General
Esta fase establece los componentes fundamentales para gestionar el contexto de las conversaciones y el sistema de tokens, elementos críticos para el funcionamiento del Módulo Concierge.

## Objetivos
- Implementar el sistema de persistencia de contexto de conversaciones
- Desarrollar el servicio de gestión y contabilización de tokens por plan
- Establecer las bases para la integración con Botpress

## Dependencias Previas
- Infraestructura de autenticación y autorización (completada)
- Tablas DynamoDB de contexto y tokens (configuración completada)
- Servicio de caché Redis (configuración completada)
- Configuración de SQS para mensajes (completada)

## Tareas Detalladas

### 1. Implementación del ConversationContextService

#### 1.1 Estructura Base del Servicio
- Crear clase `ConversationContextService` en `services/botpress/services/context/conversation-context.service.ts`
- Implementar singleton pattern para gestión eficiente de recursos
- Configurar inyección de dependencias de DynamoDB y Redis

```typescript
// Estructura básica del servicio
export class ConversationContextService {
  private static instance: ConversationContextService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly cacheService: CacheService;
  private readonly logger: Logger;
  private readonly tableName: string;

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client);
    this.cacheService = CacheService.getInstance();
    this.logger = new Logger('ConversationContextService');
    this.tableName = process.env.CONTEXT_TABLE || `${process.env.RESOURCE_PREFIX}-conversation-context-table`;
  }

  public static getInstance(): ConversationContextService {
    if (!ConversationContextService.instance) {
      ConversationContextService.instance = new ConversationContextService();
    }
    return ConversationContextService.instance;
  }

  // Implementar métodos del servicio
}
```

#### 1.2 Operaciones CRUD de Contexto
- Implementar método `getContext(conversationId: string): Promise<ConversationContext | null>`
- Implementar método `saveContext(context: ConversationContext): Promise<ConversationContext>`
- Implementar método `updateContext(conversationId: string, updates: Partial<ConversationContext>): Promise<ConversationContext>`
- Implementar método `deleteContext(conversationId: string): Promise<boolean>`
- Implementar método `listUserContexts(userId: string): Promise<ConversationContext[]>`

#### 1.3 Integración con Caché Redis
- Implementar estrategia de caché para reducir latencia
- Configurar TTL apropiado para entradas de caché (sugerido: 15 minutos)
- Implementar invalidación de caché en actualizaciones
- Utilizar decorador `@Cached` para métodos de lectura

#### 1.4 Gestión de Expiración y Limpieza
- Implementar lógica para establecer TTL en registros de DynamoDB
- Crear función para detectar y limpiar contextos obsoletos
- Programar tarea periódica para limpieza (Lambda con EventBridge)

#### 1.5 Pruebas Unitarias
- Implementar pruebas para verificar operaciones CRUD
- Pruebas de integración con Redis
- Pruebas de escenarios de expiración
- Mock de DynamoDB para pruebas aisladas

### 2. Implementación del TokenManagementService

#### 2.1 Estructura Base del Servicio
- Crear clase `TokenManagementService` en `services/botpress/services/token/token-management.service.ts`
- Implementar singleton pattern y configuración de dependencias
- Definir interfaces para representar límites de tokens por plan

```typescript
// Definición de interfaz para tokens
export interface TokenUsage {
  userId: string;
  date: string;
  totalTokens: number;
  remainingTokens: number;
  plan: string;
  limit: number;
  metadata?: Record<string, any>;
}

// Estructura básica del servicio
export class TokenManagementService {
  private static instance: TokenManagementService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly tableName: string;
  private readonly tokenLimits: Record<string, number>;

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client);
    this.logger = new Logger('TokenManagementService');
    this.tableName = process.env.TOKEN_TABLE || `${process.env.RESOURCE_PREFIX}-token-usage-table`;
    
    // Configurar límites de tokens por plan según documentación
    this.tokenLimits = {
      basic: parseInt(process.env.TOKEN_LIMIT_BASIC || '1000'),
      pro: parseInt(process.env.TOKEN_LIMIT_PRO || '2000'),
      business: parseInt(process.env.TOKEN_LIMIT_BUSINESS || '4000'),
      enterprise: parseInt(process.env.TOKEN_LIMIT_ENTERPRISE || '8000')
    };
  }

  public static getInstance(): TokenManagementService {
    if (!TokenManagementService.instance) {
      TokenManagementService.instance = new TokenManagementService();
    }
    return TokenManagementService.instance;
  }

  // Implementar métodos del servicio
}
```

#### 2.2 Operaciones de Gestión de Tokens
- Implementar método `getUserTokenUsage(userId: string): Promise<TokenUsage>`
- Implementar método `consumeTokens(userId: string, tokenCount: number): Promise<TokenUsage>`
- Implementar método `resetDailyTokens(userId: string): Promise<TokenUsage>`
- Implementar método `checkTokenAvailability(userId: string, requiredTokens: number): Promise<boolean>`

#### 2.3 Sistema de Alertas y Notificaciones
- Implementar método `checkThreshold(usage: TokenUsage): Promise<boolean>`
- Configurar emisión de eventos cuando se alcance el 80% del límite
- Integrar con EventBridge para notificaciones
- Implementar registro de métricas en CloudWatch

#### 2.4 Renovación Diaria de Tokens
- Implementar función Lambda `resetDailyTokensHandler` para reseteo automático
- Configurar EventBridge para ejecución diaria a medianoche UTC
- Implementar lógica para evitar acumulación de tokens no utilizados
- Configurar seguimiento de historial de uso

#### 2.5 Pruebas Unitarias
- Implementar pruebas para verificar consumo correcto de tokens
- Pruebas de escenarios de límites alcanzados
- Pruebas para verificar reseteo diario
- Mock de DynamoDB y EventBridge para pruebas aisladas

### 3. Integración Base con Botpress

#### 3.1 Cliente HTTP para API de Botpress
- Crear clase `BotpressApiClient` en `services/botpress/services/botpress.service.ts`
- Implementar configuración segura de autenticación
- Configurar timeout y retry policy apropiados
- Implementar manejo de errores específicos de la API de Botpress

```typescript
// Cliente básico para API de Botpress
export class BotpressApiClient {
  private readonly axios: AxiosInstance;
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('BotpressApiClient');
    
    this.axios = axios.create({
      baseURL: process.env.BOTPRESS_API_URL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOTPRESS_API_KEY}`
      }
    });
    
    // Configurar interceptores para manejo de errores
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Implementar interceptores para retry, logging, etc.
  }

  // Implementar métodos para comunicación con Botpress
}
```

#### 3.2 Servicio de Integración con Botpress
- Crear clase `BotpressService` en `services/botpress/services/botpress.service.ts`
- Implementar método `sendMessage(userId: string, message: string): Promise<BotpressResponse>`
- Implementar método `getMessageTokens(message: string): number` para estimación de tokens
- Implementar mapeo entre respuestas de Botpress y formato interno

#### 3.3 Webhook Handler para Respuestas de Botpress
- Implementar función Lambda `botpressWebhookHandler` en `services/botpress/handlers/webhook.handler.ts`
- Implementar validación de autenticidad del webhook
- Configurar procesamiento asíncrono de respuestas
- Integrar con SQS para manejo confiable de mensajes

#### 3.4 Transformadores de Formato
- Crear clase `BotpressMessageTransformer` en `services/botpress/services/transformers/message-transformer.service.ts`
- Implementar conversión bidireccional entre formatos de mensaje
- Configurar procesamiento de metadatos y contexto
- Implementar validación de mensajes

### 4. Sistema de Pruebas y Calidad

#### 4.1 Tests Unitarios Completos
- Configurar framework de pruebas Jest
- Implementar mocks para servicios externos
- Crear fixtures para datos de prueba
- Implementar cobertura mínima de 80%

#### 4.2 Tests de Integración
- Configurar entorno de pruebas con DynamoDB local
- Implementar pruebas de flujo completo entre servicios
- Verificar persistencia correcta de datos
- Probar escenarios de fallo y recuperación

#### 4.3 Documentación
- Generar documentación TypeDoc para interfaces y clases
- Crear diagramas de secuencia para flujos principales
- Documentar contratos de API y formatos de mensaje
- Preparar guía de operaciones y troubleshooting

## Criterios de Aceptación
- El servicio de contexto debe mantener persistencia indefinida de conversaciones
- El servicio de tokens debe aplicar correctamente los límites por plan
- Las alertas deben generarse al alcanzar el 80% del límite de tokens
- La comunicación con Botpress debe ser resiliente a fallos temporales
- Las pruebas unitarias deben tener cobertura mínima del 80%
- El sistema debe manejar al menos 100 operaciones por segundo sin degradación

## Hitos y Plazos
- Día 1-2: Implementación base de ConversationContextService
- Día 3-4: Implementación base de TokenManagementService
- Día 5-6: Integración base con Botpress
- Día 7-8: Pruebas unitarias y de integración
- Día 9-10: Ajustes finales y documentación

## Riesgos y Mitigaciones
- **Riesgo**: Latencia alta en acceso a DynamoDB
  - **Mitigación**: Implementar estrategia de caché eficiente con Redis

- **Riesgo**: Indisponibilidad de Botpress
  - **Mitigación**: Configurar circuit breaker y mensaje de fallback

- **Riesgo**: Inconsistencia en conteo de tokens
  - **Mitigación**: Implementar transacciones DynamoDB para atomicidad

- **Riesgo**: Pérdida de contexto por fallos
  - **Mitigación**: Implementar respaldos incrementales y políticas de recuperación