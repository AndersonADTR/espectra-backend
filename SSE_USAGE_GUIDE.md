# 📡 Guía de Uso SSE - SPECTRUM

## 🎯 Resumen

Esta guía explica cómo usar la implementación de Server-Sent Events (SSE) en SPECTRUM para recibir notificaciones en tiempo real desde Botpress y el sistema.

## 🔗 Endpoint SSE

### Conectar al Stream SSE

```http
GET /api/conversations/{conversationId}/listen?userId={userId}
Authorization: Bearer {jwt_token}
Accept: text/event-stream
Cache-Control: no-cache
```

**Parámetros:**
- `conversationId`: ID de la conversación a escuchar
- `userId`: ID del usuario (debe coincidir con el token JWT)

**Headers requeridos:**
- `Authorization`: Token JWT válido
- `Accept`: `text/event-stream`
- `Cache-Control`: `no-cache`

## 📱 Implementación Cliente

### JavaScript/TypeScript

```javascript
class SpectrumSSEClient {
  constructor(conversationId, userId, token) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.token = token;
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    const url = `/api/conversations/${this.conversationId}/listen?userId=${this.userId}`;
    
    this.eventSource = new EventSource(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    this.eventSource.onopen = (event) => {
      console.log('SSE connection opened');
      this.reconnectAttempts = 0;
    };

    this.eventSource.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.handleReconnect();
    };

    // Eventos específicos
    this.eventSource.addEventListener('BOT_RESPONSE', (event) => {
      this.handleBotResponse(JSON.parse(event.data));
    });

    this.eventSource.addEventListener('AGENT_MESSAGE', (event) => {
      this.handleAgentMessage(JSON.parse(event.data));
    });

    this.eventSource.addEventListener('HANDOFF_STATUS', (event) => {
      this.handleHandoffStatus(JSON.parse(event.data));
    });

    this.eventSource.addEventListener('TOKEN_ALERT', (event) => {
      this.handleTokenAlert(JSON.parse(event.data));
    });
  }

  handleMessage(data) {
    console.log('SSE message received:', data);
    // Procesar mensaje genérico
  }

  handleBotResponse(data) {
    console.log('Bot response:', data.content);
    // Mostrar respuesta del bot en la UI
  }

  handleAgentMessage(data) {
    console.log('Agent message:', data.content);
    // Mostrar mensaje del asesor en la UI
  }

  handleHandoffStatus(data) {
    console.log('Handoff status:', data.content.status);
    // Actualizar UI según estado del handoff
    switch(data.content.status) {
      case 'handoff_requested':
        this.showHandoffPending();
        break;
      case 'handoff_accepted':
        this.showAgentConnected(data.content.advisorName);
        break;
      case 'handoff_completed':
        this.showHandoffCompleted();
        break;
    }
  }

  handleTokenAlert(data) {
    console.log('Token alert:', data.content);
    // Mostrar alerta de tokens
    this.showTokenWarning(data.content);
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Backoff exponencial
      
      setTimeout(() => {
        console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.showConnectionError();
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Uso
const sseClient = new SpectrumSSEClient('conv-123', 'user-456', 'jwt-token');
sseClient.connect();
```

### React Hook

```javascript
import { useEffect, useState, useRef } from 'react';

export function useSpectrumSSE(conversationId, userId, token) {
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!conversationId || !userId || !token) return;

    const url = `/api/conversations/${conversationId}/listen?userId=${userId}`;
    
    eventSourceRef.current = new EventSource(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    eventSourceRef.current.onopen = () => {
      setConnectionStatus('connected');
    };

    eventSourceRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev, data]);
    };

    eventSourceRef.current.onerror = () => {
      setConnectionStatus('error');
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [conversationId, userId, token]);

  return {
    messages,
    connectionStatus,
    disconnect: () => eventSourceRef.current?.close()
  };
}
```

## 📨 Tipos de Eventos

### 1. BOT_RESPONSE
Respuesta del bot de Botpress.

```json
{
  "type": "BOT_RESPONSE",
  "conversationId": "conv-123",
  "content": {
    "text": "Hola, ¿en qué puedo ayudarte?",
    "type": "text",
    "payload": {}
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "messageId": "msg-456",
  "metadata": {
    "source": "botpress",
    "eventType": "message"
  }
}
```

### 2. AGENT_MESSAGE
Mensaje de un asesor humano.

```json
{
  "type": "AGENT_MESSAGE",
  "conversationId": "conv-123",
  "content": "Hola, soy María y te ayudaré con tu consulta.",
  "timestamp": "2024-01-15T10:35:00Z",
  "messageId": "agent_msg_789",
  "metadata": {
    "handoffId": "handoff-123",
    "advisorId": "advisor-456",
    "advisorName": "María",
    "source": "human_advisor"
  }
}
```

### 3. HANDOFF_STATUS
Estado del handoff a asesor humano.

```json
{
  "type": "HANDOFF_STATUS",
  "conversationId": "conv-123",
  "content": {
    "status": "handoff_requested",
    "message": "Tu consulta está siendo transferida a un asesor.",
    "handoffId": "handoff-123"
  },
  "timestamp": "2024-01-15T10:32:00Z",
  "metadata": {
    "source": "handoff_service"
  }
}
```

**Estados posibles:**
- `handoff_requested`: Handoff solicitado
- `handoff_accepted`: Asesor asignado
- `handoff_completed`: Handoff finalizado
- `handoff_cancelled`: Handoff cancelado

### 4. TOKEN_ALERT
Alertas sobre uso de tokens.

```json
{
  "type": "TOKEN_ALERT",
  "conversationId": "system",
  "content": {
    "alertType": "NEAR_LIMIT",
    "usagePercentage": 85,
    "remainingTokens": 150,
    "message": "Has usado 85% de tus tokens diarios."
  },
  "timestamp": "2024-01-15T10:40:00Z",
  "metadata": {
    "source": "system",
    "alertLevel": "NEAR_LIMIT"
  }
}
```

**Tipos de alerta:**
- `WARNING`: Advertencia general
- `NEAR_LIMIT`: Cerca del límite
- `LIMIT_REACHED`: Límite alcanzado

### 5. STATUS
Estados del sistema y conexión.

```json
{
  "type": "STATUS",
  "conversationId": "conv-123",
  "content": {
    "status": "typing",
    "message": "El asistente está escribiendo..."
  },
  "timestamp": "2024-01-15T10:33:00Z",
  "metadata": {
    "source": "botpress",
    "eventType": "typing"
  }
}
```

## 🔧 Configuración

### Variables de Entorno

```bash
# SSE Configuration
SSE_LOG_LEVEL=info
SSE_HEARTBEAT_INTERVAL=30000
SSE_CONNECTION_TIMEOUT=300000
SSE_MAX_RETRIES=3
SSE_CLEANUP_INTERVAL=300000
SSE_RATE_LIMIT_MAX_EVENTS=60

# Botpress Configuration
BOTPRESS_API_URL=https://api.botpress.cloud
```

### Límites y Restricciones

- **Conexiones por usuario**: Máximo 3 conexiones simultáneas
- **Rate limiting**: 60 eventos por minuto por usuario
- **Timeout de conexión**: 5 minutos de inactividad
- **Heartbeat**: Cada 30 segundos
- **Reconexión automática**: Hasta 5 intentos con backoff exponencial

## 🚨 Manejo de Errores

### Errores Comunes

1. **401 Unauthorized**: Token JWT inválido o expirado
2. **403 Forbidden**: Usuario no autorizado para la conversación
3. **404 Not Found**: Conversación no encontrada
4. **429 Too Many Requests**: Rate limit excedido
5. **500 Internal Server Error**: Error del servidor

### Estrategias de Recuperación

```javascript
eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  
  // Verificar estado de la conexión
  if (eventSource.readyState === EventSource.CLOSED) {
    // Conexión cerrada, intentar reconectar
    setTimeout(() => reconnect(), 5000);
  } else if (eventSource.readyState === EventSource.CONNECTING) {
    // Conectando, esperar
    console.log('SSE connecting...');
  }
};
```

## 📊 Monitoreo

### Métricas Disponibles

- `SSEActiveConnections`: Conexiones activas
- `SSEConnectionsCreated`: Conexiones creadas
- `SSEConnectionsClosed`: Conexiones cerradas
- `SSEConnectionErrors`: Errores de conexión
- `SSEEventsSent`: Eventos enviados
- `SSEEventsDeliveryFailed`: Fallos de entrega

### CloudWatch Dashboard

Accede al dashboard de SSE en CloudWatch para monitorear:
- Número de conexiones activas
- Latencia de eventos
- Tasa de errores
- Métricas de Lambda functions

## 🔍 Debugging

### Logs de Cliente

```javascript
// Habilitar logs detallados
const DEBUG_SSE = true;

if (DEBUG_SSE) {
  eventSource.onopen = (event) => {
    console.log('[SSE] Connection opened:', event);
  };
  
  eventSource.onmessage = (event) => {
    console.log('[SSE] Message received:', {
      data: event.data,
      lastEventId: event.lastEventId,
      type: event.type
    });
  };
}
```

### Logs de Servidor

Los logs del servidor están disponibles en CloudWatch Logs:
- `/aws/lambda/espectra-backend-dev-v4-r1-sse-conversation-listen`

## 🎯 Mejores Prácticas

1. **Siempre manejar reconexión automática**
2. **Implementar heartbeat del lado cliente**
3. **Validar datos recibidos antes de procesar**
4. **Cerrar conexiones cuando no se necesiten**
5. **Implementar fallback para navegadores sin soporte SSE**
6. **Usar rate limiting del lado cliente**
7. **Manejar estados de conexión en la UI**

## 🔄 Migración desde WebSocket

Si estás migrando desde WebSocket:

1. **Cambiar protocolo**: `ws://` → `https://` con `text/event-stream`
2. **Unidireccional**: SSE solo recibe, usar REST API para enviar
3. **Eventos tipados**: Usar `addEventListener` para eventos específicos
4. **Reconexión**: Implementar lógica de reconexión manual
5. **Headers**: Agregar headers de autenticación
