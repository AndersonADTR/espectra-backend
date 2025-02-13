// services/botpress/config/handoff.config.ts

import { HandoffConfig, HandoffPriority } from '../types/handoff.types';

// Configuración principal del sistema de handoff
export const HANDOFF_CONFIG: HandoffConfig = {
  maxQueueSize: 100,
  maxWaitTime: 300000, // 5 minutos en ms
  autoRejectAfter: 600000, // 10 minutos en ms
  priorityWeights: {
    high: 3,
    medium: 2,
    low: 1
  },
  maxActiveHandoffsPerAdvisor: 3,
  autoAssignmentEnabled: true,
  notificationSettings: {
    advisorNotificationDelay: 30000, // 30 segundos
    userUpdateInterval: 60000, // 1 minuto
    escalationThreshold: 180000 // 3 minutos
  }
};

// Constantes para estados y mensajes del sistema
export const HANDOFF_CONSTANTS = {
  QUEUE: {
    TABLE_NAME: process.env.HANDOFF_QUEUE_TABLE || '',
    INDEX: {
      STATUS: 'StatusIndex',
      ADVISOR: 'AdvisorIndex',
      PRIORITY: 'PriorityIndex'
    },
    TTL_DAYS: 7,
    MAX_SIZE: 100
  },
  
  PRIORITY_LEVELS: {
    HIGH: 'high' as HandoffPriority,
    MEDIUM: 'medium' as HandoffPriority,
    LOW: 'low' as HandoffPriority
  },

  MESSAGES: {
    TO_USER: {
      QUEUED: 'Tu solicitud ha sido recibida. Un asesor te atenderá pronto.',
      ASSIGNED: 'Un asesor se ha unido a la conversación.',
      ACTIVE: 'La conversación con el asesor está en curso.',
      COMPLETED: 'La conversación con el asesor ha finalizado.',
      CANCELLED: 'La solicitud de asistencia ha sido cancelada.',
      TIMEOUT: 'Lo sentimos, no hay asesores disponibles en este momento.',
      WAITING: 'Estamos buscando un asesor disponible...'
    },
    TO_ADVISOR: {
      QUEUED: 'Nueva solicitud de asistencia en cola.',
      ASSIGNED: 'Se te ha asignado una nueva conversación.',
      ACTIVE: 'Conversación en curso.',
      COMPLETED: 'Has finalizado la conversación.',
      CANCELLED: 'La conversación ha sido cancelada.',
      TIMEOUT: 'La solicitud ha expirado.',
      WAITING: 'El usuario está esperando respuesta.'
    }
  },

  METRICS: {
    NAMESPACE: 'Spectra/Handoff',
    DIMENSIONS: {
      Environment: process.env.STAGE || 'dev',
      Service: 'HandoffSystem'
    }
  },

  ALERTS: {
    QUEUE_SIZE_THRESHOLD: 20,
    WAIT_TIME_THRESHOLD: 240000, // 4 minutos
    ADVISOR_LOAD_THRESHOLD: 0.8, // 80% de capacidad
    RESPONSE_TIME_THRESHOLD: 30000 // 30 segundos
  }
};

// Configuración de errores y códigos de estado
export const HANDOFF_ERRORS = {
  QUEUE_FULL: {
    code: 'HANDOFF_QUEUE_FULL',
    message: 'La cola de espera está llena en este momento.'
  },
  NO_ADVISORS: {
    code: 'HANDOFF_NO_ADVISORS',
    message: 'No hay asesores disponibles en este momento.'
  },
  INVALID_STATUS: {
    code: 'HANDOFF_INVALID_STATUS',
    message: 'Estado de handoff no válido.'
  },
  NOT_FOUND: {
    code: 'HANDOFF_NOT_FOUND',
    message: 'Solicitud de handoff no encontrada.'
  },
  ALREADY_ASSIGNED: {
    code: 'HANDOFF_ALREADY_ASSIGNED',
    message: 'Esta solicitud ya fue asignada a un asesor.'
  },
  ADVISOR_BUSY: {
    code: 'HANDOFF_ADVISOR_BUSY',
    message: 'El asesor ha alcanzado su límite de conversaciones activas.'
  }
};

// Configuración de logging específico para handoff
export const HANDOFF_LOGGING = {
  LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },
  EVENTS: {
    QUEUE: 'handoff_queued',
    ASSIGN: 'handoff_assigned',
    COMPLETE: 'handoff_completed',
    TIMEOUT: 'handoff_timeout',
    ERROR: 'handoff_error'
  },
  SENSITIVE_FIELDS: [
    'userId',
    'advisorId',
    'email',
    'phoneNumber'
  ]
};

// Configuración de validación
export const HANDOFF_VALIDATION = {
  MAX_METADATA_SIZE: 4096, // bytes
  MAX_MESSAGE_LENGTH: 1000,
  ALLOWED_PRIORITIES: ['high', 'medium', 'low'],
  ALLOWED_STATUSES: [
    'pending',
    'assigned',
    'active',
    'completed',
    'cancelled',
    'timeout'
  ],
  ID_PATTERNS: {
    QUEUE_ID: /^hq_[a-zA-Z0-9]{16}$/,
    ADVISOR_ID: /^adv_[a-zA-Z0-9]{16}$/,
    USER_ID: /^usr_[a-zA-Z0-9]{16}$/
  }
};

// Configuración de caché
export const HANDOFF_CACHE = {
  TTL: {
    QUEUE_ITEM: 300, // 5 minutos
    ADVISOR_STATUS: 60, // 1 minuto
    METRICS: 120 // 2 minutos
  },
  KEYS: {
    QUEUE_PREFIX: 'handoff:queue:',
    ADVISOR_PREFIX: 'handoff:advisor:',
    METRICS_PREFIX: 'handoff:metrics:'
  }
};