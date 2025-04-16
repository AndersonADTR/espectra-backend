// scripts/debug-forgot-password-flow.js

const { CognitoIdentityProviderClient, ForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');
const axios = require('axios');

// Configuración
const region = 'us-east-1';
const userPoolId = 'us-east-1_wY0TSEhHl';
const clientId = '45j7k6tsgvlp63savmaan6i5um';
const clientSecret = 'j6ih6moq1e7kqfkbv334e33atc2vp6785e9m2v6kqc29nt3n9uq'; // Secreto del cliente obtenido de la configuración
const email = 'andersonmontilva@gmail.com';
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';

// Función para calcular el SECRET_HASH
function calculateSecretHash(username, clientId, clientSecret) {
  if (!clientSecret) return undefined;

  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

// Función para probar el flujo de forgot-password directamente con Cognito
async function testCognitoForgotPassword() {
  try {
    console.log('=== PRUEBA DIRECTA CON COGNITO ===');
    console.log('Configuración:');
    console.log('- Region:', region);
    console.log('- User Pool ID:', userPoolId);
    console.log('- Client ID:', clientId);
    console.log('- Email:', email);
    console.log('- Client Secret configurado:', !!clientSecret);

    // Crear cliente de Cognito
    const client = new CognitoIdentityProviderClient({ region });

    // Generar SECRET_HASH
    const secretHash = calculateSecretHash(email, clientId, clientSecret);
    console.log('- SECRET_HASH generado:', !!secretHash);

    // Crear comando para solicitar recuperación de contraseña
    const command = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ...(secretHash ? { SecretHash: secretHash } : {})
    });

    console.log('Enviando solicitud de recuperación de contraseña a Cognito...');
    const startTime = new Date();
    const response = await client.send(command);
    const endTime = new Date();

    console.log('Respuesta recibida en', endTime - startTime, 'ms');
    console.log('Detalles de entrega:');
    if (response.CodeDeliveryDetails) {
      console.log('- Destino:', response.CodeDeliveryDetails.Destination);
      console.log('- Medio de entrega:', response.CodeDeliveryDetails.DeliveryMedium);
      console.log('- Atributo:', response.CodeDeliveryDetails.AttributeName);
    } else {
      console.log('No hay detalles de entrega disponibles');
    }

    console.log('Solicitud de recuperación de contraseña enviada exitosamente');
    console.log('Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver si has recibido el correo.');

  } catch (error) {
    console.error('Error en la prueba directa con Cognito:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);
    console.error('- Código del error:', error.$metadata?.httpStatusCode);
    console.error('- Tipo de error:', error.__type);
    console.error('- Detalles completos:', error);
  }
}

// Función para probar el endpoint de forgot-password
async function testEndpointForgotPassword() {
  try {
    console.log('\n\n=== PRUEBA CON EL ENDPOINT ===');
    console.log('URL:', `${apiUrl}/auth/forgot-password`);
    console.log('Email:', email);

    const startTime = new Date();
    console.log('Hora de inicio:', startTime.toISOString());

    const response = await axios({
      url: `${apiUrl}/auth/forgot-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiagnosticScript/1.0',
        'Accept': '*/*'
      },
      data: {
        email
      }
    });

    const endTime = new Date();
    console.log('Hora de finalización:', endTime.toISOString());
    console.log('Tiempo de respuesta:', `${endTime - startTime}ms`);

    console.log('Respuesta del endpoint:');
    console.log('- Status:', response.status);
    console.log('- Status Text:', response.statusText);
    console.log('- Headers:', JSON.stringify(response.headers, null, 2));
    console.log('- Data:', JSON.stringify(response.data, null, 2));

    if (response.status === 200 && response.data.success) {
      console.log('El endpoint respondió correctamente.');
      console.log('Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver si has recibido el correo de recuperación de contraseña.');
    } else {
      console.error('El endpoint respondió con un error.');
    }
  } catch (error) {
    console.error('Error al probar el endpoint:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);

    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Status Text:', error.response.statusText);
      console.error('- Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Función para probar el envío directo de correos con SES
async function testDirectSESEmail() {
  try {
    console.log('\n\n=== PRUEBA DIRECTA CON SES ===');

    // Importar SES de manera dinámica
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

    // Crear cliente de SES
    const sesClient = new SESClient({ region });

    // Generar un asunto único
    const uniqueSubject = `DIAGNÓSTICO: Recuperación de contraseña - ${new Date().toISOString()} - ${Math.random().toString(36).substring(2, 8)}`;

    // Parámetros del correo
    const params = {
      Source: 'anderson.montilva@technoapes.co',
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: uniqueSubject
        },
        Body: {
          Text: {
            Data: `Este es un correo de diagnóstico para simular el flujo de recuperación de contraseña. Tu código de recuperación simulado es: 123456`
          },
          Html: {
            Data: `
              <html>
                <body>
                  <h1>Recuperación de contraseña - SPECTRUM Platform</h1>
                  <p>Este es un correo de diagnóstico para simular el flujo de recuperación de contraseña.</p>
                  <p>Tu código de recuperación simulado es: <strong>123456</strong></p>
                  <p>Hora de envío: ${new Date().toISOString()}</p>
                  <p>ID único: ${Math.random().toString(36).substring(2, 15)}</p>
                </body>
              </html>
            `
          }
        }
      }
    };

    console.log('Enviando correo de diagnóstico...');
    console.log('- Asunto:', uniqueSubject);
    console.log('- De:', params.Source);
    console.log('- Para:', params.Destination.ToAddresses);

    const startTime = new Date();
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    const endTime = new Date();

    console.log('Correo enviado exitosamente:');
    console.log('- Message ID:', response.MessageId);
    console.log('- Tiempo de respuesta:', endTime - startTime, 'ms');
    console.log('Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver si has recibido el correo.');

  } catch (error) {
    console.error('Error al enviar el correo directo con SES:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);
    console.error('- Código del error:', error.code);
    console.error('- Detalles completos:', error);
  }
}

// Ejecutar todas las pruebas
async function runAllTests() {
  try {
    // Prueba directa con Cognito
    await testCognitoForgotPassword();

    // Prueba con el endpoint
    await testEndpointForgotPassword();

    // Prueba directa con SES
    await testDirectSESEmail();

    console.log('\n\nTodas las pruebas completadas. Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver qué correos has recibido.');

  } catch (error) {
    console.error('Error ejecutando las pruebas:', error);
  }
}

// Ejecutar todas las pruebas
runAllTests();
