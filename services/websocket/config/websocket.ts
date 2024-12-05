// config/websocket.ts

export const WebSocketConfig = {
  PATH: '/ws',
  PING_INTERVAL: 30000, // Intervalo de ping en milisegundos
  PING_TIMEOUT: 10000, // Tiempo de espera de respuesta del ping en milisegundos
  RECONNECT_INTERVAL: 5000, // Intervalo de reconexión en milisegundos
  MAX_RECONNECT_ATTEMPTS: 5, // Máximo número de intentos de reconexión
};