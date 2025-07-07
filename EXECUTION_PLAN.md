# Plan de Ejecución Detallado: WebSocket → SSE

## 🎯 Resumen Ejecutivo
- **Duración total**: 4 días
- **Objetivo**: Migrar de WebSocket a SSE manteniendo funcionalidad
- **Principio**: Cada paso debe ser verificable y reversible

## 📅 DÍA 1: ELIMINACIÓN CONTROLADA DE WEBSOCKET

### ⏰ 9:00-10:00 AM: Preparación y Backup
- [ ] Crear rama de backup: `git checkout -b backup/websocket-implementation`
- [ ] Crear tag: `git tag v1.0-websocket-baseline`
- [ ] Documentar estado actual en `ROLLBACK_PROCEDURE.md`
- [ ] Verificar que tests actuales pasan

### ⏰ 10:00-10:30 AM: Auditoría Final
- [ ] Ejecutar búsqueda completa: `grep -r -i "websocket" services/`
- [ ] Documentar todas las dependencias encontradas
- [ ] Crear lista de archivos a modificar/eliminar

### ⏰ 10:30-11:30 AM: Eliminar Funciones Lambda WebSocket
**Archivo: `serverless-phase4.yml`**
- [ ] Eliminar sección completa `# WebSocket Functions` (líneas 463-516)
- [ ] Eliminar variables de entorno WebSocket (líneas 106-108)
- [ ] Eliminar configuración KMS WebSocket (líneas 167-168)
- [ ] Eliminar configuración de alarmas WebSocket (líneas 186-187)
- [ ] Eliminar configuración serverless-offline WebSocket (línea 191)

### ⏰ 11:30 AM-12:30 PM: Eliminar Infraestructura WebSocket
**Archivos a eliminar completamente:**
- [ ] `infrastructure/websocket/websocket.yml`
- [ ] `infrastructure/dynamodb/connection-concierge-tables.yml`
- [ ] `infrastructure/functions/websocket.yml`
- [ ] `infrastructure/security/websocket-security.yml`
- [ ] `infrastructure/iam/websocket-roles.yml`

**Archivo: `serverless.yml`**
- [ ] Eliminar configuración WebSocket (líneas 27-29)
- [ ] Eliminar variables de entorno WebSocket (líneas 72-73)
- [ ] Eliminar KMS WebSocket (líneas 123-124)
- [ ] Eliminar configuración WebSocket (líneas 169-171, 185-189)
- [ ] Eliminar imports WebSocket (líneas 260-261, 273, 295, 305)
- [ ] Eliminar outputs WebSocket (líneas 342-352)

### ⏰ 1:30-3:00 PM: Arreglar Servicios Dependientes

#### Paso 1: Actualizar HandoffService
**Archivo: `services/botpress/services/handoff/handoff.service.ts`**
```typescript
// ANTES (línea 8):
import { WebSocketService } from '@services/websocket/services/websocket.service';

// DESPUÉS: Eliminar import y crear placeholder
// TODO: Reemplazar con SSE en Fase 2
private async notifyClient(userId: string, message: any): Promise<void> {
  // Placeholder - será implementado con SSE
  console.log('TODO: Implement SSE notification', { userId, message });
}
```

#### Paso 2: Actualizar Webhook Handler
**Archivo: `services/botpress/handlers/webhook/process-webhook.handler.ts`**
```typescript
// ANTES (línea 7):
import { WebSocketService } from '@services/websocket/services/websocket.service';

// DESPUÉS: Eliminar import y crear placeholder
// TODO: Reemplazar con SSE en Fase 2
```

#### Paso 3: Actualizar Health Checks
**Archivo: `.build/services/websocket/handlers/health.js`**
- [ ] Eliminar `testWebSocketService` de health checks
- [ ] Actualizar array de test names

### ⏰ 3:00-4:00 PM: Eliminar Directorio WebSocket
- [ ] `rm -rf services/websocket/`
- [ ] `rm -rf .build/services/websocket/`
- [ ] Verificar que no quedan referencias

### ⏰ 4:00-4:30 PM: Limpiar Configuración
**Archivo: `services/botpress/config/config.ts`**
- [ ] Eliminar sección `WEBSOCKET` completa (líneas 72-81)

### ⏰ 4:30-5:00 PM: Verificación Final
- [ ] `npm run build` - debe pasar sin errores
- [ ] `grep -r -i "websocket" services/` - debe retornar 0 resultados
- [ ] `serverless package` - debe pasar sin warnings
- [ ] Probar endpoints REST básicos

**Criterio de éxito Día 1**: Build limpio, cero referencias WebSocket, APIs REST funcionando

## 📅 DÍA 2: IMPLEMENTACIÓN SSE BASE

### ⏰ 9:00-9:30 AM: Crear Estructura Base
```bash
mkdir -p services/sse/{handlers,services,types,config}
```

### ⏰ 9:30-10:00 AM: Crear Tipos SSE
**Archivo: `services/sse/types/sse.types.ts`**
```typescript
export interface SSEConnection {
  userId: string;
  conversationId: string;
  userKey: string;
  connectionId: string;
  lastActivity: string;
  status: 'ACTIVE' | 'RECONNECTING' | 'CLOSED';
}

export interface BotpressSSEEvent {
  type: 'message' | 'typing' | 'error' | 'status';
  conversationId: string;
  data: any;
  timestamp: string;
  messageId?: string;
}

export interface ClientSSEEvent {
  id: string;
  event: string;
  data: string;
  retry?: number;
}
```

### ⏰ 10:00-10:30 AM: Crear Configuración SSE
**Archivo: `services/sse/config/sse.config.ts`**
```typescript
export const SSE_CONFIG = {
  CLIENT: {
    HEARTBEAT_INTERVAL: 30000,
    CONNECTION_TIMEOUT: 300000,
    RETRY_INTERVAL: 5000,
    MAX_RETRIES: 3,
    HEADERS: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  },
  BOTPRESS: {
    RECONNECT_DELAY: 1000,
    MAX_RECONNECT_ATTEMPTS: 5,
    TIMEOUT: 30000,
    BASE_URL: process.env.BOTPRESS_API_URL || ''
  }
};
```

### ⏰ 10:30 AM-12:30 PM: Implementar BotpressSSEService
**Archivo: `services/sse/services/botpress-sse.service.ts`**

**Funcionalidades a implementar:**
- [ ] Conectar a `listenConversation` endpoint
- [ ] Manejar eventos SSE de Botpress
- [ ] Reconexión automática con backoff
- [ ] Recovery de mensajes perdidos
- [ ] Logging detallado

### ⏰ 1:30-3:30 PM: Implementar SSEManagerService
**Archivo: `services/sse/services/sse-manager.service.ts`**

**Funcionalidades a implementar:**
- [ ] Gestionar streams SSE a clientes
- [ ] Routing de eventos Botpress → Cliente
- [ ] Cleanup de conexiones muertas
- [ ] Métricas de conexiones activas

### ⏰ 3:30-4:30 PM: Crear Handler de Cliente SSE
**Archivo: `services/sse/handlers/listen.handler.ts`**

**Endpoint: `GET /api/conversations/{conversationId}/listen`**
- [ ] Validar autenticación
- [ ] Obtener userKey de DynamoDB
- [ ] Iniciar stream SSE al cliente
- [ ] Conectar a Botpress SSE

### ⏰ 4:30-5:00 PM: Testing Básico
- [ ] Unit tests para servicios SSE
- [ ] Test de conexión a Botpress
- [ ] Verificar formato de eventos SSE

**Criterio de éxito Día 2**: SSE conecta a Botpress, eventos se reciben correctamente

## 📅 DÍA 3: INTEGRACIÓN COMPLETA

### ⏰ 9:00-11:00 AM: Integrar con Endpoints Existentes
- [ ] Modificar handler de conversaciones para iniciar SSE
- [ ] Coordinar envío de mensajes REST con recepción SSE
- [ ] Implementar cleanup al cerrar conversación

### ⏰ 11:00 AM-1:00 PM: Implementar Recovery de Mensajes
- [ ] Detectar desconexiones SSE
- [ ] Llamar `getMessages` para recuperar perdidos
- [ ] Sincronizar estado con cliente

### ⏰ 2:00-4:00 PM: Configuración Serverless
- [ ] Agregar funciones SSE a `serverless-phase4.yml`
- [ ] Configurar variables de entorno
- [ ] Configurar rutas API Gateway

### ⏰ 4:00-5:00 PM: Testing End-to-End
- [ ] Flujo completo: envío → respuesta via SSE
- [ ] Test de reconexión
- [ ] Test de múltiples usuarios

**Criterio de éxito Día 3**: Flujo E2E funcional, latencia <1 segundo

## 📅 DÍA 4: OPTIMIZACIÓN Y VALIDACIÓN

### ⏰ 9:00-11:00 AM: Optimización y Cleanup
- [ ] Optimizar manejo de memoria
- [ ] Implementar rate limiting
- [ ] Mejorar error handling

### ⏰ 11:00 AM-1:00 PM: Testing de Stress
- [ ] Múltiples conexiones simultáneas
- [ ] Reconexiones frecuentes
- [ ] Mensajes de alta frecuencia

### ⏰ 2:00-4:00 PM: Documentación y Métricas
- [ ] Documentar nueva arquitectura
- [ ] Configurar métricas CloudWatch
- [ ] Crear runbook operativo

### ⏰ 4:00-5:00 PM: Validación Final
- [ ] Todos los tests pasan
- [ ] Performance cumple objetivos
- [ ] Documentación completa

**Criterio de éxito Día 4**: Sistema production-ready, documentado, monitoreado

## 🚨 Criterios de Rollback
- Build falla por >2 horas
- Tests E2E fallan consistentemente
- Performance >3 segundos de latencia
- Pérdida de mensajes >1%

## ✅ Definición de Éxito
- [ ] Cero código WebSocket en el proyecto
- [ ] Chat en tiempo real funcional via SSE
- [ ] Latencia <1 segundo
- [ ] Recovery automático de mensajes
- [ ] Tests E2E al 100%
- [ ] Documentación completa
