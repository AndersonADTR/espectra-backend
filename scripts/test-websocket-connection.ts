// scripts/test-websocket-connection.ts
import WebSocket from 'ws';
import { Logger } from '../shared/utils/logger';

const logger = new Logger('WebSocketTest');

const API_URL = 'wss://n9ux3u28s9.execute-api.us-east-1.amazonaws.com/dev';
const TOKEN = process.env.AUTH_TOKEN;

if (!TOKEN) {
  throw new Error('AUTH_TOKEN environment variable is required');
}

const ws = new WebSocket(`${API_URL}?Auth=${TOKEN}`, {
  headers: {
    'User-Agent': 'WebSocket-Test-Client'
  }
});

ws.on('open', () => {
  logger.info('Connection established successfully');
  
  // Enviar mensaje de prueba
  const testMessage = {
    type: 'test',
    content: 'Hello WebSocket',
    timestamp: new Date().toISOString()
  };
  
  ws.send(JSON.stringify(testMessage));
  logger.info('Test message sent', { message: testMessage });
});

ws.on('message', (data) => {
  logger.info('Message received', { data: data.toString() });
});

ws.on('error', (error) => {
  logger.error('WebSocket error occurred', {
    error: error.message,
    code: error.code
  });
});

ws.on('close', (code, reason) => {
  logger.info('Connection closed', {
    code,
    reason: reason.toString()
  });
  process.exit(0);
});

// Manejar cierre del proceso
process.on('SIGINT', () => {
  logger.info('Closing connection...');
  ws.close();
});