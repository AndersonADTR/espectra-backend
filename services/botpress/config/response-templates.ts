// services/botpress/config/response-templates.ts

export const RESPONSE_TEMPLATES = {
    // Respuestas del Bot
    BOT: {
      GREETING: {
        type: 'text',
        content: 'Hola, soy tu asistente virtual. ¿En qué puedo ayudarte hoy?'
      },
      CONFUSED: {
        type: 'text',
        content: 'Lo siento, no estoy seguro de entender. ¿Podrías reformular tu pregunta?'
      },
      HANDOFF_INITIATED: {
        type: 'text',
        content: 'Entiendo que necesitas ayuda más específica. Estoy conectándote con un asesor humano.'
      },
      PROCESSING: {
        type: 'text',
        content: 'Dame un momento mientras proceso tu solicitud...'
      },
      FAREWELL: {
        type: 'text',
        content: '¡Gracias por tu consulta! Si necesitas algo más, no dudes en preguntarme.'
      }
    },
  
    // Respuestas de Estado del Sistema
    SYSTEM: {
      ERROR: {
        GENERAL: {
          type: 'text',
          content: 'Lo siento, ha ocurrido un error. Por favor, intenta nuevamente en unos momentos.'
        },
        TIMEOUT: {
          type: 'text',
          content: 'La operación está tomando más tiempo de lo esperado. Por favor, intenta nuevamente.'
        },
        RATE_LIMIT: {
          type: 'text',
          content: 'Has alcanzado el límite de mensajes permitidos. Por favor, espera un momento.'
        }
      },
      MAINTENANCE: {
        type: 'text',
        content: 'El sistema está en mantenimiento. Estaremos de vuelta pronto.'
      }
    },
  
    // Respuestas de Handoff
    HANDOFF: {
      QUEUE: {
        type: 'text',
        content: 'Te estamos conectando con un asesor. Por favor, espera un momento.'
      },
      CONNECTED: {
        type: 'text',
        content: 'Has sido conectado con un asesor. ¡Bienvenido!'
      },
      DISCONNECTED: {
        type: 'text',
        content: 'La conversación con el asesor ha finalizado. ¿Hay algo más en lo que pueda ayudarte?'
      },
      NO_AGENTS: {
        type: 'text',
        content: 'Lo siento, no hay asesores disponibles en este momento. ¿Puedo ayudarte con algo más?'
      }
    },
  
    // Quick Replies
    QUICK_REPLIES: {
      HELP_OPTIONS: {
        type: 'quick_reply',
        content: '¿Cómo puedo ayudarte?',
        options: [
          { title: 'Consulta General', value: 'general' },
          { title: 'Soporte Técnico', value: 'technical' },
          { title: 'Hablar con Asesor', value: 'human' }
        ]
      },
      SATISFACTION: {
        type: 'quick_reply',
        content: '¿Te fue útil mi respuesta?',
        options: [
          { title: 'Sí, gracias', value: 'satisfied' },
          { title: 'No del todo', value: 'unsatisfied' }
        ]
      }
    },
  
    // Cartas y Carruseles
    RICH_CONTENT: {
      HELP_CARD: {
        type: 'card',
        content: {
          title: 'Centro de Ayuda',
          subtitle: 'Encuentra respuestas rápidas a tus preguntas',
          image_url: 'placeholder_image_url',
          buttons: [
            { title: 'Ver FAQs', value: 'faqs' },
            { title: 'Contactar Soporte', value: 'support' }
          ]
        }
      }
    }
  };