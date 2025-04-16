// scripts/debug-reset-password-flow.js

const axios = require('axios');
const readline = require('readline');
const { CognitoIdentityProviderClient, ForgotPasswordCommand, ConfirmForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const region = 'us-east-1';
const userPoolId = 'us-east-1_wY0TSEhHl';
const clientId = '45j7k6tsgvlp63savmaan6i5um';
const clientSecret = 'j6ih6moq1e7kqfkbv334e33atc2vp6785e9m2v6kqc29nt3n9uq';
const email = 'jeimyk17@gmail.com'; // Usar el email que está dando problemas
const newPassword = '12345678!Am'; // Asegúrate de que cumpla con los requisitos de contraseña

// Crear cliente de Cognito
const cognitoClient = new CognitoIdentityProviderClient({ region });

// Crear interfaz de readline para entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para calcular el SECRET_HASH
function calculateSecretHash(username, clientId, clientSecret) {
  const message = username + clientId;
  const hmac = crypto.createHmac('sha256', clientSecret);
  hmac.update(message);
  return hmac.digest('base64');
}

// Función para solicitar el código de confirmación al usuario
function askForConfirmationCode() {
  return new Promise((resolve) => {
    rl.question('Por favor, ingresa el código de confirmación que recibiste por correo: ', (code) => {
      resolve(code.trim());
    });
  });
}

// Función para probar el flujo de forgot-password directamente con Cognito
async function testDirectCognitoForgotPassword() {
  try {
    console.log('\n=== PRUEBA DIRECTA CON COGNITO - FORGOT PASSWORD ===');
    
    // Normalizar el email
    const normalizedEmail = email.toLowerCase().trim();
    console.log('Email normalizado:', normalizedEmail);
    
    // Generar SECRET_HASH
    const secretHash = calculateSecretHash(normalizedEmail, clientId, clientSecret);
    console.log('SECRET_HASH generado correctamente');
    
    // Crear comando para solicitar recuperación de contraseña
    const command = new ForgotPasswordCommand({
      ClientId: clientId,
      Username: normalizedEmail,
      SecretHash: secretHash
    });
    
    console.log('Enviando solicitud de recuperación de contraseña a Cognito...');
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await cognitoClient.send(command);
    
    console.log('Respuesta recibida de Cognito:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Tipo de respuesta:', typeof response);
    console.log('- Tiene respuesta:', !!response);
    
    if (response.CodeDeliveryDetails) {
      console.log('- Detalles de entrega:');
      console.log('  - Destino:', response.CodeDeliveryDetails.Destination);
      console.log('  - Medio de entrega:', response.CodeDeliveryDetails.DeliveryMedium);
      console.log('  - Atributo:', response.CodeDeliveryDetails.AttributeName);
    } else {
      console.log('- No hay detalles de entrega disponibles');
    }
    
    console.log('Solicitud de recuperación de contraseña enviada exitosamente');
    console.log('Por favor, revisa tu correo y proporciona el código cuando lo recibas.');
    
    return true;
  } catch (error) {
    console.error('Error en la prueba directa con Cognito:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);
    console.error('- Código del error:', error.$metadata?.httpStatusCode);
    console.error('- Tipo de error:', error.__type);
    console.error('- Detalles completos:', error);
    
    return false;
  }
}

// Función para probar el flujo de reset-password directamente con Cognito
async function testDirectCognitoResetPassword(confirmationCode) {
  try {
    console.log('\n=== PRUEBA DIRECTA CON COGNITO - RESET PASSWORD ===');
    
    // Normalizar el email y el código
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = confirmationCode.trim().replace(/\\s+/g, '');
    
    console.log('Email normalizado:', normalizedEmail);
    console.log('Código normalizado:', normalizedCode);
    console.log('Longitud del código:', normalizedCode.length);
    console.log('¿El código es numérico?', /^\\d+$/.test(normalizedCode));
    
    // Generar SECRET_HASH
    const secretHash = calculateSecretHash(normalizedEmail, clientId, clientSecret);
    console.log('SECRET_HASH generado correctamente');
    
    // Crear comando para confirmar la recuperación de contraseña
    const command = new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: normalizedEmail,
      ConfirmationCode: normalizedCode,
      Password: newPassword,
      SecretHash: secretHash
    });
    
    console.log('Enviando solicitud de confirmación a Cognito...');
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await cognitoClient.send(command);
    
    console.log('Respuesta recibida de Cognito:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Tipo de respuesta:', typeof response);
    console.log('- Tiene respuesta:', !!response);
    
    console.log('Contraseña restablecida exitosamente');
    
    return true;
  } catch (error) {
    console.error('Error en la prueba directa con Cognito:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);
    console.error('- Código del error:', error.$metadata?.httpStatusCode);
    console.error('- Tipo de error:', error.__type);
    console.error('- Detalles completos:', error);
    
    return false;
  }
}

// Función para probar el endpoint de forgot-password
async function testEndpointForgotPassword() {
  try {
    console.log('\n=== PRUEBA CON EL ENDPOINT - FORGOT PASSWORD ===');
    console.log('URL:', `${apiUrl}/auth/forgot-password`);
    console.log('Email:', email);
    console.log('Timestamp:', new Date().toISOString());
    
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
    
    console.log('Respuesta del endpoint:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Status:', response.status);
    console.log('- Status Text:', response.statusText);
    console.log('- Headers:', JSON.stringify(response.headers, null, 2));
    console.log('- Data:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200 && response.data.success) {
      console.log('El endpoint respondió correctamente.');
      console.log('Por favor, revisa tu correo y proporciona el código cuando lo recibas.');
      return true;
    } else {
      console.error('El endpoint respondió con un error.');
      return false;
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
    
    return false;
  }
}

// Función para probar el endpoint de reset-password
async function testEndpointResetPassword(confirmationCode) {
  try {
    console.log('\n=== PRUEBA CON EL ENDPOINT - RESET PASSWORD ===');
    console.log('URL:', `${apiUrl}/auth/reset-password`);
    console.log('Email:', email);
    console.log('Código de confirmación:', confirmationCode);
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await axios({
      url: `${apiUrl}/auth/reset-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiagnosticScript/1.0',
        'Accept': '*/*'
      },
      data: {
        email,
        password: newPassword,
        confirmationCode
      }
    });
    
    console.log('Respuesta del endpoint:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Status:', response.status);
    console.log('- Status Text:', response.statusText);
    console.log('- Headers:', JSON.stringify(response.headers, null, 2));
    console.log('- Data:', JSON.stringify(response.data, null, 2));
    
    if (response.status === 200 && response.data.success) {
      console.log('El endpoint respondió correctamente.');
      console.log('Contraseña restablecida exitosamente.');
      return true;
    } else if (response.status === 200 && response.data.code === 'CODE_EXPIRED_NEW_CODE_SENT') {
      console.log('El código ha expirado, pero se ha enviado uno nuevo.');
      console.log('Por favor, revisa tu correo y ejecuta este script nuevamente con el nuevo código.');
      return false;
    } else {
      console.error('El endpoint respondió con un error.');
      return false;
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
    
    return false;
  }
}

// Función principal para ejecutar todas las pruebas
async function runTests() {
  try {
    console.log('=== INICIANDO PRUEBAS DE DIAGNÓSTICO ===');
    console.log('Configuración:');
    console.log('- API URL:', apiUrl);
    console.log('- Region:', region);
    console.log('- User Pool ID:', userPoolId);
    console.log('- Client ID:', clientId);
    console.log('- Email:', email);
    console.log('- Timestamp:', new Date().toISOString());
    
    // Paso 1: Probar el endpoint de forgot-password
    console.log('\nPaso 1: Probando el endpoint de forgot-password...');
    const endpointForgotPasswordSuccess = await testEndpointForgotPassword();
    
    if (!endpointForgotPasswordSuccess) {
      console.log('\nPaso 1 alternativo: Probando directamente con Cognito...');
      const directForgotPasswordSuccess = await testDirectCognitoForgotPassword();
      
      if (!directForgotPasswordSuccess) {
        console.error('\nNo se pudo enviar el código de recuperación. Abortando pruebas.');
        rl.close();
        return;
      }
    }
    
    // Paso 2: Solicitar el código de confirmación al usuario
    console.log('\nPaso 2: Solicitando código de confirmación...');
    const confirmationCode = await askForConfirmationCode();
    console.log('Código de confirmación recibido:', confirmationCode);
    
    // Paso 3: Probar el endpoint de reset-password
    console.log('\nPaso 3: Probando el endpoint de reset-password...');
    const endpointResetPasswordSuccess = await testEndpointResetPassword(confirmationCode);
    
    if (!endpointResetPasswordSuccess) {
      console.log('\nPaso 3 alternativo: Probando directamente con Cognito...');
      const directResetPasswordSuccess = await testDirectCognitoResetPassword(confirmationCode);
      
      if (!directResetPasswordSuccess) {
        console.error('\nNo se pudo restablecer la contraseña.');
      }
    }
    
    console.log('\n=== PRUEBAS COMPLETADAS ===');
    
  } catch (error) {
    console.error('Error en las pruebas:', error);
  } finally {
    rl.close();
  }
}

// Ejecutar las pruebas
runTests();
