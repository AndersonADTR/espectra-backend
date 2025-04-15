// scripts/test-reset-password.js

const axios = require('axios');
const https = require('https');
const readline = require('readline');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const email = 'andersonmontilva@gmail.com';
const newPassword = '12345678!Am'; // Asegúrate de que cumpla con los requisitos de contraseña

// Crear instancia de axios con configuración para ignorar errores SSL
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

// Crear interfaz de readline para entrada del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Función para solicitar el código de confirmación al usuario
function askForConfirmationCode() {
  return new Promise((resolve) => {
    rl.question('Por favor, ingresa el código de confirmación que recibiste por correo: ', (code) => {
      resolve(code.trim());
    });
  });
}

// Función para probar el flujo de forgot-password
async function testForgotPassword() {
  try {
    console.log('Solicitando código de recuperación de contraseña...');
    
    const forgotPasswordResponse = await axiosInstance({
      url: `${apiUrl}/auth/forgot-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        email
      }
    });
    
    console.log('Respuesta de forgot-password:', {
      status: forgotPasswordResponse.status,
      data: forgotPasswordResponse.data
    });
    
    if (forgotPasswordResponse.data.success) {
      console.log(`Se ha enviado un código de recuperación a ${email}`);
      console.log('Por favor, revisa tu correo y proporciona el código cuando lo recibas.');
      
      // Esperar a que el usuario ingrese el código
      const confirmationCode = await askForConfirmationCode();
      
      // Probar el endpoint de reset-password
      console.log('Restableciendo contraseña...');
      
      try {
        const resetPasswordResponse = await axiosInstance({
          url: `${apiUrl}/auth/reset-password`,
          method: 'post',
          headers: {
            'Content-Type': 'application/json'
          },
          data: {
            email,
            password: newPassword,
            confirmationCode
          }
        });
        
        console.log('Respuesta de reset-password:', {
          status: resetPasswordResponse.status,
          data: resetPasswordResponse.data
        });
        
        if (resetPasswordResponse.data.success) {
          console.log('¡Contraseña restablecida exitosamente!');
          console.log('Ahora puedes iniciar sesión con tu nueva contraseña.');
        } else {
          console.error('Error al restablecer la contraseña:', resetPasswordResponse.data.message);
        }
      } catch (resetError) {
        console.error('Error al restablecer la contraseña:', {
          status: resetError.response?.status,
          data: resetError.response?.data
        });
      }
    } else {
      console.error('Error al solicitar el código de recuperación:', forgotPasswordResponse.data.message);
    }
  } catch (error) {
    console.error('Error en el flujo de recuperación de contraseña:', {
      status: error.response?.status,
      data: error.response?.data
    });
  } finally {
    rl.close();
  }
}

// Ejecutar prueba
testForgotPassword().catch(console.error);
