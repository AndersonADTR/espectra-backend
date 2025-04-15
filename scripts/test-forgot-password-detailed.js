// scripts/test-forgot-password-detailed.js

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

// Función para probar el endpoint con detalles completos
async function testEndpointDetailed() {
  console.log('Iniciando prueba detallada del endpoint forgot-password...');
  
  // Configuración para forgot-password
  const forgotPasswordConfig = {
    url: `${apiUrl}/auth/forgot-password`,
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PostmanRuntime/7.32.3',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    },
    data: {
      email
    },
    validateStatus: function (status) {
      return true; // Siempre devolver true para capturar cualquier código de estado
    }
  };
  
  console.log('Configuración para forgot-password:', JSON.stringify(forgotPasswordConfig, null, 2));
  
  try {
    console.log('Enviando solicitud a forgot-password...');
    const forgotPasswordResponse = await axiosInstance(forgotPasswordConfig);
    
    console.log('Respuesta de forgot-password:');
    console.log('Status:', forgotPasswordResponse.status);
    console.log('Status Text:', forgotPasswordResponse.statusText);
    console.log('Headers:', JSON.stringify(forgotPasswordResponse.headers, null, 2));
    console.log('Data:', JSON.stringify(forgotPasswordResponse.data, null, 2));
    
    // Configuración para test-email
    const testEmailConfig = {
      url: `${apiUrl}/auth/test-email`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PostmanRuntime/7.32.3',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      data: {
        email
      },
      validateStatus: function (status) {
        return true; // Siempre devolver true para capturar cualquier código de estado
      }
    };
    
    console.log('\n\nIniciando prueba detallada del endpoint test-email...');
    console.log('Configuración para test-email:', JSON.stringify(testEmailConfig, null, 2));
    
    console.log('Enviando solicitud a test-email...');
    const testEmailResponse = await axiosInstance(testEmailConfig);
    
    console.log('Respuesta de test-email:');
    console.log('Status:', testEmailResponse.status);
    console.log('Status Text:', testEmailResponse.statusText);
    console.log('Headers:', JSON.stringify(testEmailResponse.headers, null, 2));
    console.log('Data:', JSON.stringify(testEmailResponse.data, null, 2));
    
  } catch (error) {
    console.error('Error en la solicitud:', error.message);
    if (error.response) {
      console.error('Respuesta de error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      });
    }
  }
}

// Ejecutar prueba
testEndpointDetailed().catch(console.error);
