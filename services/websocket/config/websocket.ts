// config/websocket.ts

export const WebSocketConfig = {
  PATH: '/ws',
  PING_INTERVAL: 30000, // 30 segundos
  PING_TIMEOUT: 10000, // 10 segundos
  RECONNECT_INTERVAL: 5000, // 5 segundos
  MAX_RECONNECT_ATTEMPTS: 5,
  CONNECTION_TIMEOUT: 300, // 5 minutos en segundos
  ERROR_CODES: {
    INVALID_MESSAGE: 4000,
    AUTH_FAILED: 4001,
    RATE_LIMIT: 4002,
    INVALID_STATE: 4003,
    SERVER_ERROR: 4500
  } as const,
  MESSAGE_TYPES: {
    PING: 'PING',
    PONG: 'PONG',
    ERROR: 'ERROR',
    RECONNECT: 'RECONNECT'
  } as const
};

export type WebSocketErrorCode = typeof WebSocketConfig.ERROR_CODES[keyof typeof WebSocketConfig.ERROR_CODES];
export type WebSocketSystemMessageType = typeof WebSocketConfig.MESSAGE_TYPES[keyof typeof WebSocketConfig.MESSAGE_TYPES];