/**
 * Script para desplegar las plantillas serverless en el orden correcto
 *
 * Uso:
 * node deploy.js [--stage=dev] [--region=us-east-1] [--deployment-id=r1]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuración
const DEFAULT_STAGE = 'dev';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_DEPLOYMENT_ID = 'r1';

// Parsear argumentos
const args = process.argv.slice(2);
const stage = getArgValue(args, '--stage=', DEFAULT_STAGE);
const region = getArgValue(args, '--region=', DEFAULT_REGION);
const deploymentId = getArgValue(args, '--deployment-id=', DEFAULT_DEPLOYMENT_ID);

// Definir plantillas en orden de despliegue
const templates = [
  { name: 'KMS', file: 'serverless-kms.yml', description: 'Claves KMS para encriptación' },
  { name: 'SNS', file: 'serverless-sns.yml', description: 'Tópicos SNS para notificaciones' },
  { name: 'Cognito', file: 'serverless-cognito.yml', description: 'Recursos de autenticación con Cognito' },
  { name: 'Phase1', file: 'serverless-phase1.yml', description: 'Infraestructura de red base (VPC, subnets, security groups)' },
  { name: 'Phase2', file: 'serverless-phase2.yml', description: 'Recursos de almacenamiento y caché' },
  { name: 'Phase3', file: 'serverless-phase3.yml', description: 'Tablas DynamoDB y recursos de datos' },
  { name: 'Phase4', file: 'serverless-phase4.yml', description: 'API Gateway y configuración de endpoints' },
  { name: 'Phase5', file: 'serverless-phase5.yml', description: 'Funciones Lambda y permisos' }
];

// Función principal
async function deploy() {
  console.log(`
=======================================================
  DESPLIEGUE DE INFRAESTRUCTURA ESPECTRA
=======================================================
  Stage: ${stage}
  Region: ${region}
  Deployment ID: ${deploymentId}
=======================================================
`);

  // Establecer variables de entorno
  process.env.DEPLOYMENT_ID = deploymentId;

  // Desplegar cada plantilla en orden
  for (const [index, template] of templates.entries()) {
    console.log(`\n[${index + 1}/${templates.length}] Desplegando ${template.name}: ${template.description}`);

    try {
      // Verificar si la plantilla existe
      const templatePath = path.join(process.cwd(), template.file);
      if (!fs.existsSync(templatePath)) {
        console.log(`  ⚠️ La plantilla ${template.file} no existe. Saltando...`);
        continue;
      }

      // Ejecutar el despliegue
      console.log(`  🚀 Iniciando despliegue de ${template.file}...`);
      await runCommand('npx', [
        'serverless',
        'deploy',
        '-c', template.file,
        '--stage', stage,
        '--region', region,
        '--verbose'
      ]);

      console.log(`  ✅ Despliegue de ${template.name} completado con éxito.`);
    } catch (error) {
      console.error(`  ❌ Error al desplegar ${template.name}:`);
      console.error(`     ${error.message}`);

      // Preguntar si continuar con el siguiente despliegue
      const shouldContinue = await askToContinue();
      if (!shouldContinue) {
        console.log('\n⛔ Despliegue cancelado por el usuario.');
        process.exit(1);
      }
    }
  }

  console.log(`
=======================================================
  DESPLIEGUE COMPLETADO
=======================================================
  Todos los recursos han sido desplegados correctamente.
=======================================================
`);
}

// Función para ejecutar comandos
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`El comando falló con código de salida ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Función para obtener valores de argumentos
function getArgValue(args, prefix, defaultValue) {
  const arg = args.find(a => a.startsWith(prefix));
  return arg ? arg.substring(prefix.length) : defaultValue;
}

// Función para preguntar si continuar
function askToContinue() {
  return new Promise((resolve) => {
    process.stdout.write('\n¿Desea continuar con el siguiente despliegue? (s/n): ');

    process.stdin.once('data', (data) => {
      const input = data.toString().trim().toLowerCase();
      resolve(input === 's' || input === 'si' || input === 'y' || input === 'yes');
    });
  });
}

// Ejecutar el script
deploy().catch(err => {
  console.error('Error en el despliegue:', err);
  process.exit(1);
});
