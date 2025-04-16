// scripts/test-forgot-password-now.js

const axios = require('axios');
const https = require('https');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const email = 'andersonmontilva@gmail.com';

// Crear instancia de axios con configuración para ignorar errores SSL
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false
  })
});

// Función para probar el endpoint de forgot-password
async function testForgotPassword() {
  try {
    console.log('Probando endpoint de forgot-password...');
    console.log('URL:', `${apiUrl}/auth/forgot-password`);
    console.log('Email:', email);
    
    const startTime = new Date();
    console.log('Hora de inicio:', startTime.toISOString());
    
    const response = await axiosInstance({
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

// Ejecutar prueba
testForgotPassword().catch(console.error);
