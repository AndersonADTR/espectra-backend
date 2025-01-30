// services/botpress/config/chat-api.config.ts

export const CHAT_API_CONFIG = {
    BASE_URL: `https://chat.botpress.cloud/${process.env.CHAT_WEBHOOK_ID}`,
    HEADERS: {
      'Content-Type': 'application/json'
    },
    TIMEOUTS: {
      REQUEST: 10000,    // 10 segundos
      HANDOFF: 300000    // 5 minutos
    },
    MESSAGE_TYPES: {
      TEXT: 'text',
      HANDOFF: 'handoff',
      TYPING: 'typing',
      CARD: 'card'
    },
    HANDOFF: {
      CONFIDENCE_THRESHOLD: 0.7,
      AUTO_TRIGGER_PATTERNS: [
        'help',
        'agent',
        'human',
        'support'
      ]
    },
    RETRY: {
      MAX_ATTEMPTS: 3,
      DELAY: 1000,
      MAX_DELAY: 5000
    }
  } as const;
  
  export const MESSAGE_TEMPLATES = {
    HANDOFF_REQUESTED: 'Un agente se unirá a la conversación pronto.',
    HANDOFF_STARTED: 'Un agente se ha unido a la conversación.',
    HANDOFF_ENDED: 'La conversación con el agente ha terminado.',
    HANDOFF_UNAVAILABLE: 'Lo siento, no hay agentes disponibles en este momento.',
    ERROR: 'Lo siento, ha ocurrido un error. Por favor, intenta nuevamente.'
  } as const;
  
  export const EVENTS = {
    TYPES: {
      MESSAGE: 'message',
      HANDOFF_REQUEST: 'handoff_request',
      HANDOFF_STARTED: 'handoff_started',
      HANDOFF_ENDED: 'handoff_ended',
      TYPING: 'typing'
    }
  } as const;