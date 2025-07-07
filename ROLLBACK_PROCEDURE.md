# Procedimiento de Rollback - Migración WebSocket → SSE

## 📋 Estado Inicial (Baseline)
- **Fecha**: $(date)
- **Rama de backup**: `backup/websocket-implementation`
- **Tag de baseline**: `v1.0-websocket-baseline`
- **Commit hash**: $(git rev-parse HEAD)

## 🔄 Procedimiento de Rollback

### En caso de fallo durante la migración:

1. **Rollback inmediato**:
   ```bash
   git checkout main
   git reset --hard v1.0-websocket-baseline
   ```

2. **Restaurar archivos eliminados**:
   ```bash
   git checkout backup/websocket-implementation -- services/websocket/
   git checkout backup/websocket-implementation -- infrastructure/websocket/
   git checkout backup/websocket-implementation -- infrastructure/dynamodb/connection-concierge-tables.yml
   ```

3. **Restaurar configuraciones**:
   ```bash
   git checkout backup/websocket-implementation -- serverless-phase4.yml
   git checkout backup/websocket-implementation -- serverless.yml
   git checkout backup/websocket-implementation -- services/botpress/config/config.ts
   ```

4. **Verificar restauración**:
   ```bash
   npm run build
   serverless package
   ```

## 📊 Estado de Funcionalidades Pre-Migración

### WebSocket Funcional:
- [x] Conexión WebSocket establecida
- [x] Envío y recepción de mensajes
- [x] Handoff a asesores humanos
- [x] Gestión de conexiones en DynamoDB
- [x] Cleanup automático de conexiones

### APIs REST Funcionales:
- [x] Autenticación de usuarios
- [x] Gestión de conversaciones
- [x] Envío de mensajes
- [x] Integración con Botpress

### Infraestructura Desplegada:
- [x] API Gateway WebSocket
- [x] Tablas DynamoDB para conexiones
- [x] Funciones Lambda WebSocket
- [x] Roles IAM y políticas de seguridad

## 🚨 Criterios de Rollback
- Build falla por >2 horas
- Tests E2E fallan consistentemente  
- Performance >3 segundos de latencia
- Pérdida de mensajes >1%

## 📞 Contactos de Emergencia
- Desarrollador Principal: [Tu contacto]
- DevOps: [Contacto DevOps]
- Product Owner: [Contacto PO]
