// services/botpress/config/error-messages.ts

export const ERROR_MESSAGES = {
    // Errores de Autenticación
    AUTH: {
      INVALID_TOKEN: 'Token de autenticación inválido o expirado',
      MISSING_TOKEN: 'Token de autenticación requerido',
      UNAUTHORIZED: 'No autorizado para realizar esta acción',
      SESSION_EXPIRED: 'La sesión ha expirado, por favor inicia sesión nuevamente'
    },
  
    // Errores de Validación
    VALIDATION: {
      INVALID_MESSAGE: 'Formato de mensaje inválido',
      INVALID_PAYLOAD: 'Payload inválido o malformado',
      MISSING_REQUIRED_FIELDS: 'Faltan campos requeridos',
      INVALID_FORMAT: 'Formato de datos inválido',
      MESSAGE_TOO_LONG: 'El mensaje excede la longitud máxima permitida'
    },
  
    // Errores de Límites
    LIMITS: {
      RATE_LIMIT_EXCEEDED: 'Has excedido el límite de solicitudes permitidas',
      TOKEN_LIMIT_EXCEEDED: 'Has alcanzado el límite de tokens disponibles',
      QUEUE_FULL: 'La cola de mensajes está llena, intenta más tarde',
      CONCURRENT_LIMIT: 'Has alcanzado el límite de conversaciones simultáneas'
    },
  
    // Errores de Servicio
    SERVICE: {
      BOTPRESS_UNAVAILABLE: 'El servicio de chat no está disponible en este momento',
      CONNECTION_ERROR: 'Error de conexión con el servicio',
      TIMEOUT: 'La operación ha excedido el tiempo de espera',
      INTERNAL_ERROR: 'Error interno del servidor'
    },
  
    // Errores de Base de Datos
    DATABASE: {
      QUERY_FAILED: 'Error al consultar la base de datos',
      SAVE_FAILED: 'Error al guardar los datos',
      DELETE_FAILED: 'Error al eliminar los datos',
      CONNECTION_ERROR: 'Error de conexión con la base de datos'
    },
  
    // Errores de Handoff
    HANDOFF: {
      NO_AGENTS: 'No hay asesores disponibles en este momento',
      TRANSFER_FAILED: 'Error al transferir la conversación',
      INVALID_STATE: 'Estado de handoff inválido',
      ALREADY_IN_QUEUE: 'Ya estás en la cola de espera'
    },
  
    // Errores de Procesamiento
    PROCESSING: {
      MESSAGE_PROCESSING_FAILED: 'Error al procesar el mensaje',
      CONTEXT_UPDATE_FAILED: 'Error al actualizar el contexto',
      INVALID_OPERATION: 'Operación no válida en el estado actual',
      RETRY_FAILED: 'Error al reintentar la operación'
    },
  
    // Errores de Cache
    CACHE: {
      CACHE_MISS: 'Datos no encontrados en caché',
      CACHE_UPDATE_FAILED: 'Error al actualizar la caché',
      CACHE_INVALIDATION_FAILED: 'Error al invalidar la caché'
    },
  
    // Errores de Webhook
    WEBHOOK: {
      INVALID_SIGNATURE: 'Firma de webhook inválida',
      PAYLOAD_TOO_LARGE: 'Payload del webhook demasiado grande',
      PROCESSING_FAILED: 'Error al procesar el webhook'
    }
  } as const;
  
  // Funciones de utilidad para errores
  export const getErrorMessage = (
    category: keyof typeof ERROR_MESSAGES,
    key: string,
    params?: Record<string, string>
  ): string => {
    const message = ERROR_MESSAGES[category]?.[key as keyof typeof ERROR_MESSAGES[typeof category]];
    
    if (!message) {
      return ERROR_MESSAGES.SERVICE.INTERNAL_ERROR;
    }
  
    if (params) {
      return Object.entries(params).reduce<string>(
        (msg, [paramKey, value]) => msg.replace(`{${paramKey}}`, value),
        message
      );
    }
  
    return message;
  };