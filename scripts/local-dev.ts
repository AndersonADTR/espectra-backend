// scripts/local-dev.js
const { spawn } = require('child_process');
const path = require('path');

async function startLocalDev() {
  // Instalar DynamoDB Local si no está instalado
  await spawn('sls', ['dynamodb', 'install'], {
    stdio: 'inherit'
  });

  // Iniciar servicios locales
  const offline = spawn('sls', [
    'offline', 'start',
    '--config', 'serverless-phase4.yml',
    '--stage', 'dev',
    '--reloadHandler'
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      IS_OFFLINE: 'true',
      AWS_REGION: 'local',
      // Mocks de servicios
      COGNITO_USER_POOL_ID: 'local_user_pool',
      COGNITO_CLIENT_ID: 'local_client',
      // Variables de conexión local
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      SQS_ENDPOINT: 'http://localhost:9324',
      SNS_ENDPOINT: 'http://localhost:9911'
    }
  });

  // Manejador de salida limpia
  process.on('SIGINT', () => {
    offline.kill('SIGINT');
    process.exit(0);
  });
}

startLocalDev();