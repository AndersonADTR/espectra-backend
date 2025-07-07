# SPECTRUM - API Documentation para Equipo Móvil

## 🎯 **DOCUMENTACIÓN COMPLETA DE API PARA INTEGRACIÓN MÓVIL**
**Fecha:** 24 de Junio, 2025  
**Versión API:** v1  
**Estado:** ✅ PRODUCCIÓN - 100% FUNCIONAL  
**Equipo:** Mobile Development Team  

---

## 🌐 **INFORMACIÓN GENERAL DE LA API**

### **📍 Base URL**
```
https://jgsh83v6k5.execute-api.us-east-1.amazonaws.com/dev
```

### **🔧 Configuración Técnica**
- **Protocolo:** HTTPS (TLS 1.2+)
- **Formato:** JSON
- **Encoding:** UTF-8
- **Timeout:** 29 segundos máximo
- **Rate Limiting:** Gestionado por AWS API Gateway

### **🔒 Autenticación**
- **Tipo:** JWT Bearer Token
- **Header:** `Authorization: Bearer {accessToken}`
- **Duración:** 8 horas
- **Refresh:** 30 días

### **📱 Headers Requeridos**
```http
Content-Type: application/json
Authorization: Bearer {accessToken}
User-Agent: SPECTRUM-Mobile/{version}
```

### **🌍 CORS Configurado**
- **Origins:** `*` (todos los orígenes)
- **Methods:** GET, POST, PUT, DELETE, OPTIONS
- **Headers:** Content-Type, Authorization, X-Amz-Date, X-Api-Key

---

## � **RESUMEN DE ENDPOINTS DISPONIBLES**

### **🔐 Módulo de Autenticación (9 endpoints)**
1. **POST /auth/register** - Registro de content creators
2. **POST /auth/contact-request** - Solicitud de contacto (sin auth)
3. **POST /auth/login** - Login con JWT de 8 horas
4. **POST /auth/verify-email** - Verificación de email
5. **POST /auth/forgot-password** - Solicitar reset de contraseña
6. **POST /auth/reset-password** - Confirmar reset de contraseña
7. **POST /auth/refresh-token** - Renovación de tokens
8. **GET /auth/me** - Información del usuario
9. **POST /auth/logout** - Cerrar sesión

### **💬 Módulo de Conversaciones (6 endpoints)**
10. **GET /conversations** - Obtener/crear conversación
11. **POST /conversations** - Crear nueva conversación
12. **GET /conversations/{id}** - Detalles de conversación
13. **GET /conversations/{id}/messages** - Historial completo
14. **POST /conversations/{id}/messages** - Enviar mensaje
15. **GET /conversations/{id}/poll** - **ENDPOINT PRINCIPAL** para polling

### **🔄 Endpoints Adicionales (3 endpoints)**
16. **GET /tokens/usage** - Gestión de tokens
17. **POST /handoff/request** - Human handoff
18. **POST /sessions/create** - Gestión de sesiones

**📊 Total: 18 endpoints documentados**

---

## �🔐 **MÓDULO DE AUTENTICACIÓN**

### **1. Registro de Content Creator**
```http
POST /auth/register
```

**Request Body:**
```json
{
  "email": "contentcreator@example.com",
  "password": "SecurePassword123!",
  "name": "Content Creator Name",
  "phoneNumber": "+1234567890",
  "userType": "content_creator",
  "language": "es"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "userId": "user-123",
  "verificationRequired": true
}
```

**Errores Comunes:**
- `400` - Email ya existe
- `400` - Contraseña no cumple requisitos
- `500` - Error interno del servidor

---

### **2. Solicitud de Contacto**
```http
POST /auth/contact-request
```

**Request Body:**
```json
{
  "name": "Content Creator Name",
  "email": "contentcreator@example.com",
  "phoneNumber": "+1234567890",
  "metadata": {
    "company": "Creator Studio LLC",
    "message": "Estoy interesado en SPECTRUM para mi equipo de content creators",
    "source": "mobile_app"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Solicitud de contacto enviada exitosamente",
  "requestId": "contact-req-123",
  "timestamp": "2025-06-24T22:30:00Z"
}
```

**Errores Comunes:**
- `400` - Datos requeridos faltantes
- `429` - Demasiadas solicitudes del mismo email
- `500` - Error interno del servidor

**⚠️ NOTA:** Este endpoint no requiere autenticación y se usa para leads de ventas.

---

### **3. Login**
```http
POST /auth/login
```

**Request Body:**
```json
{
  "email": "contentcreator@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 28800,
  "tokenType": "Bearer",
  "user": {
    "userId": "user-123",
    "userSub": "f4d82438-50f1-706b-c263-2afdf0820cdd",
    "email": "contentcreator@example.com",
    "name": "Content Creator Name",
    "userType": "content_creator",
    "botpressUserKeyId": "bp-key-789",
    "emailVerified": true
  }
}
```

**⚠️ IMPORTANTE:** Guardar `userSub` para polling y `accessToken` para autenticación.

---

### **4. Verificación de Email**
```http
POST /auth/verify-email
```

**Request Body:**
```json
{
  "email": "contentcreator@example.com",
  "verificationCode": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verificado exitosamente"
}
```

---

### **5. Recuperación de Contraseña**
```http
POST /auth/forgot-password
```

**Request Body:**
```json
{
  "email": "contentcreator@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Código de recuperación enviado al email",
  "resetToken": "temp-reset-token-123"
}
```

**Errores Comunes:**
- `400` - Email no registrado
- `429` - Demasiadas solicitudes (rate limiting)
- `500` - Error interno del servidor

**⚠️ NOTA:** Este endpoint no requiere autenticación. El código se envía por email.

**🔄 Flujo Completo de Reset:**
1. **POST /auth/forgot-password** - Solicitar código
2. **Verificar código** recibido por email
3. **POST /auth/reset-password** - Cambiar contraseña

---

### **6. Confirmar Reset de Contraseña**
```http
POST /auth/reset-password
```

**Request Body:**
```json
{
  "email": "contentcreator@example.com",
  "password": "NewSecurePassword123!",
  "confirmationCode": "123456"
}
```

**Response (200) - Éxito:**
```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": {
    "email": "contentcreator@example.com",
    "canLogin": true,
    "message": "You can now login with your new password"
  },
  "errors": null
}
```

**Response (200) - Código Expirado (Nuevo Código Enviado):**
```json
{
  "success": false,
  "message": "The confirmation code has expired. A new code has been sent to your email.",
  "code": "CODE_EXPIRED_NEW_CODE_SENT",
  "data": {
    "email": "contentcreator@example.com",
    "newCodeSent": true,
    "expirationTime": "1 hour",
    "destination": "c***@e***",
    "deliveryMedium": "EMAIL",
    "instructions": "Please check your email for a new 6-digit verification code and try again with the new code.",
    "codeFormat": "6 digits (e.g., 123456)"
  },
  "errors": null
}
```

**Errores Comunes:**
- `400` - Datos inválidos (email, contraseña o código)
- `400` - Código de confirmación incorrecto
- `400` - Contraseña no cumple requisitos de seguridad
- `429` - Demasiadas solicitudes (rate limiting)
- `500` - Error interno del servidor

**⚠️ NOTA:** Este endpoint no requiere autenticación. Completa el flujo iniciado con forgot-password.

**🔒 Requisitos de Contraseña:**
- Mínimo 8 caracteres
- Al menos una letra mayúscula
- Al menos una letra minúscula
- Al menos un número
- Al menos un carácter especial (!@#$%^&*)

---

### **7. Refresh Token**
```http
POST /auth/refresh-token
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 28800,
  "tokenType": "Bearer"
}
```

---

### **8. Información del Usuario**
```http
GET /auth/me
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "userId": "user-123",
  "userSub": "f4d82438-50f1-706b-c263-2afdf0820cdd",
  "email": "contentcreator@example.com",
  "name": "Content Creator Name",
  "userType": "content_creator",
  "emailVerified": true,
  "createdAt": "2025-06-24T10:00:00Z"
}
```

---

### **9. Logout**
```http
POST /auth/logout
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Sesión cerrada exitosamente"
}
```

---

## 💬 **MÓDULO DE CONVERSACIONES**

### **10. Obtener/Crear Conversación**
```http
GET /conversations
Authorization: Bearer {accessToken}
```

**Response (200) - Conversación Existente:**
```json
{
  "conversations": [
    {
      "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
      "userId": "user-123",
      "status": "active",
      "createdAt": "2025-06-24T21:00:00Z",
      "lastActivity": "2025-06-24T22:18:00Z"
    }
  ]
}
```

**Response (200) - Sin Conversación:**
```json
{
  "conversations": []
}
```

---

### **11. Crear Nueva Conversación**
```http
POST /conversations
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  
}
```

**Response (201):**
```json
{
  "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
  "userId": "user-123",
  "status": "active",
  "createdAt": "2025-06-24T22:20:00Z"
}
```

---

### **12. Obtener Detalles de Conversación**
```http
GET /conversations/{conversationId}
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
  "userId": "user-123",
  "status": "active",
  "createdAt": "2025-06-24T21:00:00Z",
  "lastActivity": "2025-06-24T22:18:00Z",
  "messageCount": 15
}
```

---

### **13. Obtener Historial de Mensajes**
```http
GET /conversations/{conversationId}/messages
Authorization: Bearer {accessToken}
```

**Response (200):**
```json
{
  "messages": [
    {
      "id": "8f425b67-e7fd-44f0-8d73-b386c626e210",
      "createdAt": "2025-06-24T22:18:03.677Z",
      "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
      "userId": "user_01JWY0JZPXJ21Q92K3DTJ8378F",
      "payload": {
        "type": "text",
        "text": "¡Excelente pregunta! Aquí tienes 5 tips para crear videos virales en TikTok..."
      }
    }
  ],
  "meta": {
    "total": 15,
    "hasMore": false
  }
}
```

---

### **14. Enviar Mensaje**
```http
POST /conversations/{conversationId}/messages
Authorization: Bearer {accessToken}
```

**Request Body:**
```json
{
  "content": "¿Cómo hacer videos virales en TikTok? Dame 5 tips específicos",
  "type": "text"
}
```

**Response (200):**
```json
{
  "success": true,
  "messageId": "msg-123",
  "timestamp": "2025-06-24T22:18:00Z",
  "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH"
}
```

---

## 📲 **POLLING OPTIMIZADO PARA MÓVILES (ENDPOINT PRINCIPAL)**

### **15. Polling de Respuestas del Bot**
```http
GET /conversations/{conversationId}/poll?userId={userSub}&since={timestamp}
Authorization: Bearer {accessToken}
```

**⚡ CONFIGURACIÓN RECOMENDADA:**
- **Intervalo:** 2 segundos
- **Timeout:** 5 segundos
- **Reintentos:** 3 con exponential backoff

**Parámetros:**
- `conversationId` (required): ID de la conversación
- `userId` (required): userSub del usuario (del login)
- `since` (optional): Timestamp ISO para obtener mensajes desde esa fecha

**Response (200) - Con Mensajes Nuevos:**
```json
{
  "messages": [
    {
      "id": "8f425b67-e7fd-44f0-8d73-b386c626e210",
      "createdAt": "2025-06-24T22:18:03.677Z",
      "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
      "userId": "user_01JWY0JZPXJ21Q92K3DTJ8378F",
      "payload": {
        "type": "text",
        "text": "¡Excelente pregunta! Aquí tienes 5 tips para crear videos virales en TikTok:\n\n1. **Hook en los primeros 3 segundos**..."
      }
    }
  ],
  "timestamp": "2025-06-24T22:18:05.000Z",
  "hasMore": true,
  "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
  "userId": "f4d82438-50f1-706b-c263-2afdf0820cdd",
  "context": {
    "platform": "spectrum",
    "userType": "content_creator",
    "pollingInterval": 2000,
    "lastPolled": "2025-06-24T22:18:05.000Z"
  },
  "status": {
    "connected": true,
    "botAvailable": true,
    "humanHandoffAvailable": true
  }
}
```

**Response (200) - Sin Mensajes Nuevos:**
```json
{
  "messages": [],
  "timestamp": "2025-06-24T22:18:07.000Z",
  "hasMore": false,
  "conversationId": "conv_01JYASTTJWKTGYQB4PTDJP48WH",
  "userId": "f4d82438-50f1-706b-c263-2afdf0820cdd",
  "context": {
    "platform": "spectrum",
    "userType": "content_creator",
    "pollingInterval": 2000,
    "lastPolled": "2025-06-24T22:18:07.000Z"
  },
  "status": {
    "connected": true,
    "botAvailable": true,
    "humanHandoffAvailable": false
  }
}
```

**Headers de Respuesta Específicos:**
```http
X-Spectrum-Platform: content-creators
X-Polling-Interval: 2000
X-Spectrum-Response-Time: 245
```

---

## 🔄 **ENDPOINTS ADICIONALES (PREPARADOS)**

### **16. Gestión de Tokens**
```http
GET /tokens/usage
Authorization: Bearer {accessToken}
```

### **17. Human Handoff**
```http
POST /handoff/request
Authorization: Bearer {accessToken}
```

### **18. Gestión de Sesiones**
```http
POST /sessions/create
Authorization: Bearer {accessToken}
```

---

## 📱 **FLUJO RECOMENDADO PARA APP MÓVIL**

### **🔄 1. Inicialización**
1. **Login** → Obtener `accessToken` y `userSub`
2. **GET /conversations** → Verificar conversación activa
3. **POST /conversations** → Crear si no existe

### **🔄 2. Envío de Mensaje**
1. **POST /conversations/{id}/messages** → Enviar pregunta
2. **Iniciar polling** → Cada 2 segundos

### **🔄 3. Polling Continuo**
```javascript
// Ejemplo de implementación
const pollForMessages = async () => {
  try {
    const response = await fetch(
      `${baseUrl}/conversations/${conversationId}/poll?userId=${userSub}&since=${lastTimestamp}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.messages.length > 0) {
      // Mostrar nuevos mensajes del bot
      displayMessages(data.messages);
      lastTimestamp = data.timestamp;
    }
    
    // Continuar polling cada 2 segundos
    setTimeout(pollForMessages, 2000);
  } catch (error) {
    console.error('Polling error:', error);
    // Reintentar con exponential backoff
    setTimeout(pollForMessages, 5000);
  }
};
```

---

## ⚠️ **MANEJO DE ERRORES**

### **Códigos de Estado HTTP**
- `200` - Éxito
- `201` - Creado exitosamente
- `400` - Error en la solicitud
- `401` - No autorizado (token inválido/expirado)
- `403` - Prohibido
- `404` - Recurso no encontrado
- `429` - Demasiadas solicitudes
- `500` - Error interno del servidor

### **Formato de Error Estándar**
```json
{
  "success": false,
  "message": "Descripción del error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción detallada",
    "action": "REFRESH_TOKEN"
  }
}
```

### **Códigos de Error de Autenticación**
- `INVALID_TOKEN` - Token inválido o malformado
- `EXPIRED_TOKEN` - Token expirado
- `TOKEN_VALIDATION_FAILED` - Fallo en validación
- `MISSING_TOKEN` - Token no proporcionado
- `USER_NOT_FOUND` - Usuario no encontrado
- `INSUFFICIENT_PERMISSIONS` - Permisos insuficientes

### **Acciones Recomendadas**
- `REFRESH_TOKEN` - Usar refresh token para obtener nuevo access token
- `LOGIN` - Redirigir al usuario al login
- `RETRY` - Reintentar la operación

### **Estrategia de Reintentos**
- **401 Unauthorized:** Renovar token automáticamente
- **429 Rate Limit:** Exponential backoff
- **500 Server Error:** Reintentar hasta 3 veces
- **Network Error:** Reintentar con backoff

### **🔄 Manejo Automático de Tokens Expirados**

**Flujo Recomendado:**
```javascript
const makeAuthenticatedRequest = async (url, options = {}) => {
  let accessToken = await getStoredToken();

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    // Si el token es inválido/expirado
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json();

      // Verificar si es un error de token
      if (errorData.error?.action === 'REFRESH_TOKEN') {
        console.log('Token expired, refreshing...');

        // Renovar token
        const refreshToken = await getStoredRefreshToken();
        const newTokens = await refreshAccessToken(refreshToken);

        // Guardar nuevos tokens
        await storeTokens(newTokens);

        // Reintentar request original con nuevo token
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newTokens.accessToken}`
          }
        });
      } else if (errorData.error?.action === 'LOGIN') {
        // Redirigir al login
        redirectToLogin();
        return;
      }
    }

    return response;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};
```

**Implementación de Refresh Token:**
```javascript
const refreshAccessToken = async (refreshToken) => {
  const response = await fetch(`${baseUrl}/auth/refresh-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      refreshToken
    })
  });

  if (!response.ok) {
    // Refresh token también expiró, redirigir al login
    redirectToLogin();
    throw new Error('Refresh token expired');
  }

  return await response.json();
};
```

---

## 🎯 **CASOS DE USO ESPECÍFICOS PARA CONTENT CREATORS**

### **📱 Preguntas Validadas**
- "¿Cómo hacer videos virales en TikTok?"
- "¿Qué herramientas de edición recomiendas?"
- "¿Cómo monetizar mi contenido en Instagram?"
- "¿Cuáles son las mejores horas para publicar?"
- "¿Cómo crear thumbnails atractivos para YouTube?"

### **🤖 Respuestas Especializadas**
El bot está entrenado específicamente para content creation y proporciona:
- Tips específicos por plataforma (TikTok, Instagram, YouTube)
- Recomendaciones de herramientas
- Estrategias de monetización
- Mejores prácticas de engagement
- Tendencias actuales

---

## 📊 **MÉTRICAS Y MONITOREO**

### **⚡ Latencias Esperadas**
- **Login:** < 500ms
- **Envío de mensaje:** < 1 segundo
- **Polling:** < 300ms
- **Respuesta del bot:** 2-5 segundos

### **📈 Límites de Rate**
- **Autenticación:** 10 requests/minuto
- **Mensajes:** 30 requests/minuto
- **Polling:** Sin límite (recomendado 2 segundos)

---

## 🚀 **PRÓXIMOS ENDPOINTS (ROADMAP)**

### **🔄 En Desarrollo**
- `GET /analytics/content` - Analytics de contenido
- `POST /integrations/tiktok` - Integración TikTok API
- `POST /integrations/instagram` - Integración Instagram API
- `GET /recommendations/trending` - Tendencias personalizadas

### **📱 Optimizaciones Móviles**
- Push notifications para respuestas
- Offline mode para mensajes
- Compresión de respuestas
- WebP para imágenes

---

## 📞 **SOPORTE TÉCNICO**

### **🔧 Debugging**
- **Logs:** CloudWatch con request ID
- **Monitoring:** 24/7 con alertas automáticas
- **Status Page:** En desarrollo

### **📧 Contacto**
- **Email:** dev-support@spectrumai.com.co
- **Slack:** #spectrum-mobile-integration
- **Documentation:** Actualizada en tiempo real

---

## 🧪 **ENTORNO DE TESTING**

### **🔧 Configuración de Testing**
```javascript
// Configuración base para testing
const config = {
  baseUrl: 'https://jgsh83v6k5.execute-api.us-east-1.amazonaws.com/dev',
  timeout: 30000,
  retries: 3,
  pollingInterval: 2000
};

// Headers base
const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'SPECTRUM-Mobile-Test/1.0'
};
```

### **👤 Usuario de Prueba**
```json
{
  "email": "test.contentcreator@spectrumai.com.co",
  "password": "TestPassword123!",
  "name": "Test Content Creator",
  "userType": "content_creator"
}
```

### **📱 Secuencia de Testing Completa**
```javascript
// 1. Registro (si es necesario)
const registerResponse = await fetch(`${baseUrl}/auth/register`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'TestPassword123!',
    name: 'Test Creator',
    phoneNumber: '+1234567890',
    userType: 'content_creator',
    language: 'es'
  })
});

// 1.5. Recuperación de contraseña (si es necesario)
const forgotPasswordResponse = await fetch(`${baseUrl}/auth/forgot-password`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: 'test@example.com'
  })
});

// 1.6. Confirmar reset de contraseña (si es necesario)
const resetPasswordResponse = await fetch(`${baseUrl}/auth/reset-password`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'NewTestPassword123!',
    confirmationCode: '123456' // Código recibido por email
  })
});

// 2. Login
const loginResponse = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'TestPassword123!'
  })
});

const { accessToken, user } = await loginResponse.json();

// 3. Obtener conversación
const conversationsResponse = await fetch(`${baseUrl}/conversations`, {
  headers: {
    ...headers,
    'Authorization': `Bearer ${accessToken}`
  }
});

// 4. Enviar mensaje de prueba
const messageResponse = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
  method: 'POST',
  headers: {
    ...headers,
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    content: '¿Cómo hacer videos virales en TikTok?',
    type: 'text'
  })
});

// 5. Polling para respuesta
const pollResponse = await fetch(
  `${baseUrl}/conversations/${conversationId}/poll?userId=${user.userSub}`,
  {
    headers: {
      ...headers,
      'Authorization': `Bearer ${accessToken}`
    }
  }
);
```

---

## 🔒 **SEGURIDAD Y MEJORES PRÁCTICAS**

### **🛡️ Almacenamiento Seguro**
```javascript
// ✅ CORRECTO - Usar almacenamiento seguro
import { SecureStore } from 'expo-secure-store';

// Guardar tokens de forma segura
await SecureStore.setItemAsync('accessToken', accessToken);
await SecureStore.setItemAsync('refreshToken', refreshToken);

// ❌ INCORRECTO - No usar AsyncStorage para tokens
// AsyncStorage.setItem('accessToken', accessToken); // NO HACER ESTO
```

### **🔄 Renovación Automática de Tokens**
```javascript
const makeAuthenticatedRequest = async (url, options = {}) => {
  let accessToken = await SecureStore.getItemAsync('accessToken');

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (response.status === 401) {
      // Token expirado, renovar automáticamente
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      const newTokens = await refreshAccessToken(refreshToken);

      // Reintentar con nuevo token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newTokens.accessToken}`
        }
      });
    }

    return response;
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};
```

### **📱 Manejo de Estados de Red**
```javascript
import NetInfo from '@react-native-async-storage/async-storage';

const handleNetworkState = () => {
  NetInfo.addEventListener(state => {
    if (state.isConnected) {
      // Reconectado - reanudar polling
      startPolling();
    } else {
      // Sin conexión - pausar polling
      stopPolling();
      showOfflineMessage();
    }
  });
};
```

---

## 📊 **ANALYTICS Y MÉTRICAS RECOMENDADAS**

### **📈 Métricas de Performance**
```javascript
// Tracking de latencias
const trackApiLatency = (endpoint, startTime) => {
  const latency = Date.now() - startTime;
  analytics.track('api_latency', {
    endpoint,
    latency,
    timestamp: new Date().toISOString()
  });
};

// Tracking de errores
const trackApiError = (endpoint, error, statusCode) => {
  analytics.track('api_error', {
    endpoint,
    error: error.message,
    statusCode,
    timestamp: new Date().toISOString()
  });
};
```

### **🎯 Métricas de Uso**
- **Mensajes enviados por sesión**
- **Tiempo de respuesta del bot**
- **Tasa de satisfacción con respuestas**
- **Frecuencia de uso por content creator**
- **Tipos de preguntas más comunes**

---

## 🚨 **TROUBLESHOOTING COMÚN**

### **❌ Error: "User is not authorized"**
**Causa:** Token expirado o inválido
**Solución:** Renovar token automáticamente
```javascript
if (response.status === 401) {
  await refreshAccessToken();
  // Reintentar request
}
```

### **❌ Error: "Polling returns empty messages"**
**Causa:** Filtrado incorrecto o userSub incorrecto
**Solución:** Verificar que se usa el `userSub` del login
```javascript
// ✅ CORRECTO
const { user } = await loginResponse.json();
const pollUrl = `${baseUrl}/conversations/${conversationId}/poll?userId=${user.userSub}`;

// ❌ INCORRECTO
// const pollUrl = `${baseUrl}/conversations/${conversationId}/poll?userId=${user.userId}`;
```

### **❌ Error: "Network timeout"**
**Causa:** Latencia alta o problemas de red
**Solución:** Implementar reintentos con backoff
```javascript
const retryWithBackoff = async (fn, retries = 3) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      return retryWithBackoff(fn, retries - 1);
    }
    throw error;
  }
};
```

---

## 📋 **CHECKLIST DE INTEGRACIÓN**

### **✅ Fase 1: Autenticación**
- [ ] Implementar registro de usuarios
- [ ] Implementar solicitud de contacto (leads)
- [ ] Implementar login con JWT
- [ ] Implementar verificación de email
- [ ] Implementar recuperación de contraseña
- [ ] Implementar confirmación de reset de contraseña
- [ ] Implementar renovación automática de tokens
- [ ] Implementar logout
- [ ] Almacenamiento seguro de tokens

### **✅ Fase 2: Conversaciones**
- [ ] Obtener/crear conversaciones
- [ ] Enviar mensajes al bot
- [ ] Mostrar historial de mensajes
- [ ] Manejo de estados de carga

### **✅ Fase 3: Polling (CRÍTICO)**
- [ ] Implementar polling cada 2 segundos
- [ ] Filtrar solo mensajes del bot
- [ ] Manejo de reconexión automática
- [ ] Optimización para batería móvil

### **✅ Fase 4: UX/UI**
- [ ] Indicadores de "bot escribiendo"
- [ ] Notificaciones de nuevos mensajes
- [ ] Manejo de estados offline
- [ ] Animaciones de carga

### **✅ Fase 5: Testing**
- [ ] Testing con usuario real
- [ ] Testing de reconexión
- [ ] Testing de renovación de tokens
- [ ] Testing de performance

---

## 🎬 **CASOS DE USO ESPECÍFICOS PARA TESTING**

### **📱 Flujo Content Creator - TikTok**
1. **Login** como content creator
2. **Enviar:** "¿Cómo hacer videos virales en TikTok?"
3. **Esperar respuesta** con tips específicos de TikTok
4. **Seguimiento:** "¿Qué herramientas de edición recomiendas?"
5. **Verificar** contexto mantenido

### **📱 Flujo Content Creator - Instagram**
1. **Enviar:** "¿Cómo monetizar mi contenido en Instagram?"
2. **Esperar respuesta** con estrategias de monetización
3. **Seguimiento:** "¿Cuáles son las mejores horas para publicar?"
4. **Verificar** respuestas específicas de Instagram

### **📱 Flujo Content Creator - YouTube**
1. **Enviar:** "¿Cómo crear thumbnails atractivos para YouTube?"
2. **Esperar respuesta** con tips de diseño
3. **Seguimiento:** "¿Qué palabras clave usar en títulos?"
4. **Verificar** respuestas específicas de YouTube

### **🔒 Flujo Completo de Reset de Contraseña**
1. **POST /auth/forgot-password** con email del usuario
2. **Verificar email** recibido con código de 6 dígitos
3. **POST /auth/reset-password** con email, nueva contraseña y código
4. **Manejar respuesta:**
   - **Éxito:** Usuario puede hacer login con nueva contraseña
   - **Código expirado:** Nuevo código enviado automáticamente
5. **POST /auth/login** con nueva contraseña para confirmar

---

## 📞 **CONTACTO Y FEEDBACK**

### **🔧 Para Issues Técnicos**
- **Email:** mobile-support@spectrumai.com.co
- **Slack:** #spectrum-mobile-dev
- **GitHub Issues:** spectrum-mobile-integration

### **📊 Para Feedback de UX**
- **Email:** ux-feedback@spectrumai.com.co
- **Slack:** #spectrum-ux-feedback
- **Testing Channel:** #spectrum-mobile-testing

### **📈 Para Métricas y Analytics**
- **Dashboard:** spectrum-analytics.spectrumai.com.co
- **Logs:** CloudWatch access disponible
- **Monitoring:** 24/7 con alertas automáticas

---

## 🚀 **ROADMAP DE INTEGRACIÓN**

### **📅 Semana 1-2: Setup Básico**
- Configuración del proyecto
- Implementación de autenticación
- Testing básico de endpoints

### **📅 Semana 3-4: Funcionalidad Core**
- Implementación de conversaciones
- Polling optimizado
- UX básica

### **📅 Semana 5-6: Optimización**
- Performance tuning
- Manejo de errores robusto
- Testing exhaustivo

### **📅 Semana 7-8: Lanzamiento**
- Testing con usuarios reales
- Feedback e iteración
- Deploy a producción

**🎬 API COMPLETAMENTE DOCUMENTADA Y LISTA PARA INTEGRACIÓN MÓVIL 🎬**

**¡El equipo móvil puede empezar a desarrollar inmediatamente con esta documentación completa!**
