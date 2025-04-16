// scripts/test-resend-verification-code.js

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

// Función para probar el reenvío del código de verificación
async function testResendVerificationCode() {
  try {
    console.log('=== PRUEBA DE REENVÍO DE CÓDIGO DE VERIFICACIÓN ===');
    console.log(`Correo electrónico: ${email}`);
    console.log('Solicitando reenvío del código de verificación...');
    
    const response = await axios({
      url: `${apiUrl}/auth/resend-verification-code`,
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
    
    console.log('\nRespuesta del servidor:');
    console.log('- Status:', response.status);
    console.log('- Status Text:', response.statusText);
    console.log('- Headers:', JSON.stringify(response.headers, null, 2));
    console.log('- Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('\n¡Éxito! Se ha enviado un código de verificación a tu correo electrónico.');
      console.log('Por favor, revisa tu correo (incluyendo la carpeta de spam) y verifica que has recibido el código.');
      
      // Preguntar al usuario si recibió el correo
      rl.question('\n¿Has recibido el correo con el código de verificación? (sí/no): ', (answer) => {
        if (answer.toLowerCase() === 'sí' || answer.toLowerCase() === 'si') {
          console.log('\n¡Excelente! El sistema está funcionando correctamente.');
        } else {
          console.log('\nPosibles problemas:');
          console.log('1. El correo podría estar en la carpeta de spam.');
          console.log('2. Podría haber un problema con la configuración de SES en AWS.');
          console.log('3. El correo podría estar siendo bloqueado por tu proveedor de correo.');
          console.log('\nRecomendaciones:');
          console.log('1. Verifica que el correo esté verificado en SES.');
          console.log('2. Revisa los logs de CloudWatch para ver si hay errores.');
          console.log('3. Intenta con otro correo electrónico.');
        }
        rl.close();
      });
    } else {
      console.log('\nError: La solicitud fue procesada pero no fue exitosa.');
      console.log('Mensaje:', response.data.message);
      rl.close();
    }
  } catch (error) {
    console.error('\nError al solicitar el código de verificación:');
    console.error('- Nombre del error:', error.name);
    console.error('- Mensaje del error:', error.message);
    
    if (error.response) {
      console.error('- Status:', error.response.status);
      console.error('- Status Text:', error.response.statusText);
      console.error('- Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    rl.close();
  }
}

// Ejecutar la prueba
testResendVerificationCode();
