# WebSocket → SSE Migration Checklist

## Phase 1: Audit and Controlled Elimination

### 1.1 Dependency Audit
- [ ] Map all WebSocket references in codebase
- [ ] Identify external dependencies on WebSocket endpoints
- [ ] Document current WebSocket functionality
- [ ] Verify no critical business logic depends on WebSocket

### Files to Analyze:
- [ ] `services/websocket/` (entire directory)
- [ ] `infrastructure/websocket/websocket.yml`
- [ ] `infrastructure/dynamodb/connection-concierge-tables.yml`
- [ ] `infrastructure/functions/websocket.yml`
- [ ] `serverless-phase4.yml` (WebSocket functions)
- [ ] `services/botpress/config/config.ts` (WebSocket config)

### Critical Dependencies Found (187 total references):
- [ ] `services/botpress/services/handoff/handoff.service.ts` (imports WebSocketService)
- [ ] `services/botpress/handlers/webhook/process-webhook.handler.ts` (imports WebSocketService)
- [ ] `services/botpress/handlers/advisor/send-message.handler.ts` (imports WebSocketService)
- [ ] `services/botpress/handlers/token/token-alert.handler.ts` (imports WebSocketService)
- [ ] `services/botpress/handlers/webhook/botpress-webhook.ts` (imports WebSocketService)
- [ ] `services/botpress/services/message/message-processor.service.ts` (imports WebSocketService)
- [ ] `services/monitoring/handlers/system-health.handler.ts` (WebSocket health checks)
- [ ] `services/botpress/config/config.ts` (WebSocket configuration)
- [ ] Entire `services/websocket/` directory (125+ files and references)

### Environment Variables to Remove:
- [ ] `WEBSOCKET_API_ENDPOINT`
- [ ] `WEBSOCKET_PING_INTERVAL`
- [ ] `WEBSOCKET_CONNECTION_TTL`
- [ ] `WEBSOCKET_MAX_RETRIES`
- [ ] `CONNECTIONS_TABLE`
- [ ] WebSocket KMS keys

### 1.2 Create Backup Branch
- [ ] Create backup branch: `backup/websocket-implementation`
- [ ] Tag current state: `v1.0-websocket-baseline`
- [ ] Document rollback procedure

### 1.3 Elimination Order (Critical)
1. [ ] Remove WebSocket Lambda functions from serverless configs
2. [ ] Remove WebSocket infrastructure (API Gateway, DynamoDB tables)
3. [ ] Remove WebSocket service files
4. [ ] Clean environment variables
5. [ ] Remove imports and references
6. [ ] Verify clean build

### Verification Criteria:
- [x] TypeScript compilation succeeds (only unrelated warnings)
- [x] `serverless package --config serverless-phase4.yml` succeeds
- [x] Zero active WebSocket references in code
- [x] All WebSocket imports replaced with SSE placeholders
- [x] All WebSocket infrastructure files removed
- [x] All WebSocket functions removed from serverless-phase4.yml

## ✅ DÍA 1 COMPLETADO EXITOSAMENTE

### Resumen de Eliminación:
- **Archivos eliminados**:
  - `services/websocket/` (directorio completo)
  - `infrastructure/websocket/websocket.yml`
  - `infrastructure/dynamodb/connection-concierge-tables.yml`
  - `infrastructure/functions/websocket.yml`
  - `infrastructure/security/websocket-security.yml`
  - `infrastructure/iam/websocket-roles.yml`

- **Funciones WebSocket eliminadas de serverless-phase4.yml**:
  - wsAuthorizer
  - webSocketConnect
  - webSocketDisconnect
  - webSocketMessage
  - webSocketAgent

- **Servicios actualizados con placeholders SSE**:
  - HandoffService
  - MessageProcessorService
  - Token Alert Handler
  - Advisor Send Message Handler
  - Botpress Webhook Handler
  - Process Webhook Handler

- **Configuraciones limpiadas**:
  - Variables de entorno WebSocket eliminadas
  - Configuración WebSocket en config.ts reemplazada
  - Health checks WebSocket eliminados

### Estado Final:
- ✅ Cero referencias WebSocket activas
- ✅ Build de TypeScript funcional
- ✅ Package de serverless-phase4.yml exitoso
- ✅ Código preparado para implementación SSE en Fase 2

## Detailed Elimination Steps

### Step 1: Remove WebSocket Functions from Serverless Configs (30 min)
- [ ] Remove from `serverless-phase4.yml`:
  - [ ] `wsAuthorizer` function
  - [ ] `webSocketConnect` function
  - [ ] `webSocketDisconnect` function
  - [ ] `webSocketMessage` function
  - [ ] `webSocketCleanup` function
- [ ] Remove WebSocket environment variables
- [ ] Remove WebSocket resource imports

### Step 2: Remove WebSocket Infrastructure (45 min)
- [ ] Remove `infrastructure/websocket/websocket.yml`
- [ ] Remove `infrastructure/dynamodb/connection-concierge-tables.yml`
- [ ] Remove `infrastructure/functions/websocket.yml`
- [ ] Remove `infrastructure/security/websocket-security.yml`
- [ ] Update `serverless.yml` to remove WebSocket imports

### Step 3: Fix Dependent Services (2 hours)
- [ ] Update `services/botpress/services/handoff/handoff.service.ts`
- [ ] Update `services/botpress/handlers/webhook/process-webhook.handler.ts`
- [ ] Remove WebSocket from health checks
- [ ] Update service factories
- [ ] Remove WebSocket from config files

### Step 4: Remove WebSocket Service Files (1 hour)
- [ ] Delete `services/websocket/` directory completely
- [ ] Delete `.build/services/websocket/` directory
- [ ] Verify no orphaned references

### Step 5: Clean Build and Verify (30 min)
- [ ] Run `npm run build` and fix any compilation errors
- [ ] Run `serverless package` and verify no missing dependencies
- [ ] Search codebase for any remaining WebSocket references
- [ ] Test basic API functionality still works

## Phase 2: SSE Implementation (Day 2-3)

### 2.1 Create SSE Architecture (4 hours)

#### Directory Structure:
```
services/
├── sse/
│   ├── handlers/
│   │   ├── listen.handler.ts          # Client SSE endpoint
│   │   └── botpress-events.handler.ts # Process Botpress events
│   ├── services/
│   │   ├── sse-manager.service.ts     # Manage client SSE streams
│   │   └── botpress-sse.service.ts    # Connect to Botpress SSE
│   ├── types/
│   │   └── sse.types.ts               # SSE type definitions
│   └── config/
│       └── sse.config.ts              # SSE configuration
```

#### Step 2.1.1: Create Type Definitions (30 min)
- [ ] Create `services/sse/types/sse.types.ts`
- [ ] Define SSE event interfaces
- [ ] Define connection management types
- [ ] Define error handling types

#### Step 2.1.2: Create SSE Configuration (30 min)
- [ ] Create `services/sse/config/sse.config.ts`
- [ ] Define connection timeouts and retry policies
- [ ] Configure Botpress SSE endpoints
- [ ] Set up environment variables
