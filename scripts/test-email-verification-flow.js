// scripts/test-email-verification-flow.js

const axios = require('axios');
const readline = require('readline');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const email = 'jeimyk17@gmail.com'; // Cambia esto por tu correo electrónico

// Crear interfaz de readline para entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para solicitar el código de verificación al usuario
function askForVerificationCode() {
  return new Promise((resolve) => {
    rl.question('Por favor, ingresa el código de verificación que recibiste por correo: ', (code) => {
      resolve(code.trim());
    });
  });
}

// Función para probar el reenvío del código de verificación
async function testResendVerificationCode() {
  try {
    console.log('Solicitando reenvío del código de verificación...');
    
    const response = await axios({
      url: `${apiUrl}/auth/resend-verification-code`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        email
      }
    });
    
    console.log('Respuesta del servidor:', {
      status: response.status,
      data: response.data
    });
    
    if (response.data.success) {
      console.log(`Se ha enviado un código de verificación a ${email}`);
      console.log('Por favor, revisa tu correo y proporciona el código cuando lo recibas.');
      return true;
    } else {
      console.error('Error al solicitar el código de verificación:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('Error al solicitar el código de verificación:', {
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
}

// Función para probar la verificación del correo electrónico
async function testVerifyEmail(code) {
  try {
    console.log('Verificando correo electrónico...');
    
    const response = await axios({
      url: `${apiUrl}/auth/verify-email`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        email,
        code
      }
    });
    
    console.log('Respuesta del servidor:', {
      status: response.status,
      data: response.data
    });
    
    if (response.data.success) {
      console.log('¡Correo electrónico verificado exitosamente!');
      return true;
    } else {
      console.error('Error al verificar el correo electrónico:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('Error al verificar el correo electrónico:', {
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
}

// Función principal para ejecutar el flujo completo
async function runEmailVerificationFlow() {
  try {
    console.log('=== INICIANDO PRUEBA DE VERIFICACIÓN DE CORREO ELECTRÓNICO ===');
    console.log(`Correo electrónico: ${email}`);
    
    // Paso 1: Reenviar el código de verificación
    console.log('\nPaso 1: Reenviando el código de verificación...');
    const resendSuccess = await testResendVerificationCode();
    
    if (!resendSuccess) {
      console.log('\nNo se pudo reenviar el código de verificación. Abortando prueba.');
      rl.close();
      return;
    }
    
    // Paso 2: Solicitar el código de verificación al usuario
    console.log('\nPaso 2: Solicitando código de verificación...');
    const verificationCode = await askForVerificationCode();
    console.log('Código de verificación recibido:', verificationCode);
    
    // Paso 3: Verificar el correo electrónico
    console.log('\nPaso 3: Verificando el correo electrónico...');
    const verifySuccess = await testVerifyEmail(verificationCode);
    
    if (!verifySuccess) {
      console.log('\nNo se pudo verificar el correo electrónico.');
    }
    
    console.log('\n=== PRUEBA COMPLETADA ===');
    
  } catch (error) {
    console.error('Error en la prueba:', error);
  } finally {
    rl.close();
  }
}

// Ejecutar el flujo completo
runEmailVerificationFlow();
