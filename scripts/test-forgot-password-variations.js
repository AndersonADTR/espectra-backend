// scripts/test-forgot-password-variations.js

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

// Función para probar el endpoint con diferentes configuraciones
async function testEndpoint() {
  console.log('Iniciando pruebas del endpoint forgot-password con diferentes configuraciones...');
  
  // Configuraciones a probar
  const configs = [
    {
      name: 'Configuración básica',
      url: `${apiUrl}/auth/forgot-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        email
      }
    },
    {
      name: 'Con cabeceras adicionales de Postman',
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
      }
    },
    {
      name: 'Con datos como string',
      url: `${apiUrl}/auth/forgot-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        email
      })
    },
    {
      name: 'Con URL completa',
      url: `${apiUrl}/auth/forgot-password`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'zjgnryu8yj.execute-api.us-east-1.amazonaws.com'
      },
      data: {
        email
      }
    },
    {
      name: 'Prueba del endpoint test-email',
      url: `${apiUrl}/auth/test-email`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        email
      }
    }
  ];
  
  // Ejecutar cada configuración
  for (const config of configs) {
    console.log(`\n\nProbando: ${config.name}`);
    console.log('Configuración:', JSON.stringify(config, null, 2));
    
    try {
      const response = await axiosInstance(config);
      console.log('Respuesta exitosa:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });
    } catch (error) {
      console.error('Error en la solicitud:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }
  }
}

// Ejecutar pruebas
testEndpoint().catch(console.error);
