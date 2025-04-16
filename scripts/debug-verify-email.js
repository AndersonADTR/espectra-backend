// scripts/debug-verify-email.js

const axios = require('axios');
const readline = require('readline');
const { CognitoIdentityProviderClient, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const region = 'us-east-1';
const userPoolId = 'us-east-1_wY0TSEhHl';
const clientId = '45j7k6tsgvlp63savmaan6i5um';
const clientSecret = 'j6ih6moq1e7kqfkbv334e33atc2vp6785e9m2v6kqc29nt3n9uq';
const email = 'andersonmontilva@gmail.com'; // Usar el email que está dando problemas

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

// Función para solicitar el código de verificación al usuario
function askForVerificationCode() {
  return new Promise((resolve) => {
    rl.question('Por favor, ingresa el código de verificación que recibiste por correo: ', (code) => {
      resolve(code.trim());
    });
  });
}

// Función para probar la verificación de email directamente con Cognito
async function testDirectCognitoVerifyEmail(verificationCode) {
  try {
    console.log('\n=== PRUEBA DIRECTA CON COGNITO - VERIFY EMAIL ===');
    
    // Normalizar el email y el código
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = verificationCode.trim().replace(/\s+/g, '');
    
    console.log('Email normalizado:', normalizedEmail);
    console.log('Código normalizado:', normalizedCode);
    console.log('Longitud del código:', normalizedCode.length);
    console.log('¿El código es numérico?', /^\d+$/.test(normalizedCode));
    
    // Generar SECRET_HASH
    const secretHash = calculateSecretHash(normalizedEmail, clientId, clientSecret);
    console.log('SECRET_HASH generado correctamente');
    
    // Crear comando para confirmar el registro
    const command = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: normalizedEmail,
      ConfirmationCode: normalizedCode,
      SecretHash: secretHash
    });
    
    console.log('Enviando solicitud de confirmación a Cognito...');
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await cognitoClient.send(command);
    
    console.log('Respuesta recibida de Cognito:');
    console.log('- Timestamp:', new Date().toISOString());
    console.log('- Tipo de respuesta:', typeof response);
    console.log('- Tiene respuesta:', !!response);
    
    console.log('Correo electrónico verificado exitosamente');
    
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

// Función para probar el endpoint de verify-email
async function testEndpointVerifyEmail(verificationCode) {
  try {
    console.log('\n=== PRUEBA CON EL ENDPOINT - VERIFY EMAIL ===');
    console.log('URL:', `${apiUrl}/auth/verify-email`);
    console.log('Email:', email);
    console.log('Código de verificación:', verificationCode);
    console.log('Timestamp:', new Date().toISOString());
    
    const response = await axios({
      url: `${apiUrl}/auth/verify-email`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DiagnosticScript/1.0',
        'Accept': '*/*'
      },
      data: {
        email,
        code: verificationCode
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
      console.log('Correo electrónico verificado exitosamente.');
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

// Función para probar diferentes formatos del código
async function testDifferentCodeFormats(originalCode) {
  console.log('\n=== PRUEBA DE DIFERENTES FORMATOS DE CÓDIGO ===');
  
  const formats = [
    { name: 'Original', code: originalCode },
    { name: 'Sin espacios', code: originalCode.replace(/\s+/g, '') },
    { name: 'Solo dígitos', code: originalCode.replace(/[^\d]/g, '') },
    { name: 'Primeros 6 caracteres', code: originalCode.substring(0, 6) },
    { name: 'Últimos 6 caracteres', code: originalCode.substring(Math.max(0, originalCode.length - 6)) }
  ];
  
  for (const format of formats) {
    console.log(`\nProbando formato: ${format.name} (${format.code})`);
    
    // Probar directamente con Cognito
    const cognitoSuccess = await testDirectCognitoVerifyEmail(format.code);
    
    if (cognitoSuccess) {
      console.log(`¡Éxito! El formato "${format.name}" funcionó correctamente con Cognito.`);
      return format.code;
    }
  }
  
  console.log('Ninguno de los formatos probados funcionó correctamente.');
  return null;
}

// Función principal para ejecutar todas las pruebas
async function runTests() {
  try {
    console.log('=== INICIANDO PRUEBAS DE DIAGNÓSTICO DE VERIFICACIÓN DE EMAIL ===');
    console.log('Configuración:');
    console.log('- API URL:', apiUrl);
    console.log('- Region:', region);
    console.log('- User Pool ID:', userPoolId);
    console.log('- Client ID:', clientId);
    console.log('- Email:', email);
    console.log('- Timestamp:', new Date().toISOString());
    
    // Paso 1: Solicitar el código de verificación al usuario
    console.log('\nPaso 1: Solicitando código de verificación...');
    const verificationCode = await askForVerificationCode();
    console.log('Código de verificación recibido:', verificationCode);
    
    // Paso 2: Probar el endpoint de verify-email
    console.log('\nPaso 2: Probando el endpoint de verify-email...');
    const endpointSuccess = await testEndpointVerifyEmail(verificationCode);
    
    if (endpointSuccess) {
      console.log('\n¡Éxito! El endpoint de verify-email funcionó correctamente.');
    } else {
      console.log('\nEl endpoint de verify-email falló. Probando directamente con Cognito...');
      
      // Paso 3: Probar directamente con Cognito
      const cognitoSuccess = await testDirectCognitoVerifyEmail(verificationCode);
      
      if (cognitoSuccess) {
        console.log('\n¡Éxito! La verificación directa con Cognito funcionó correctamente.');
      } else {
        console.log('\nLa verificación directa con Cognito también falló. Probando diferentes formatos del código...');
        
        // Paso 4: Probar diferentes formatos del código
        const workingCode = await testDifferentCodeFormats(verificationCode);
        
        if (workingCode) {
          console.log(`\n¡Éxito! Se encontró un formato de código que funciona: ${workingCode}`);
          
          // Probar el endpoint con el código que funcionó
          console.log('\nProbando el endpoint con el código que funcionó...');
          const finalEndpointSuccess = await testEndpointVerifyEmail(workingCode);
          
          if (finalEndpointSuccess) {
            console.log('\n¡Éxito! El endpoint de verify-email funcionó con el código correcto.');
          } else {
            console.log('\nEl endpoint de verify-email sigue fallando incluso con el código correcto.');
          }
        } else {
          console.log('\nNo se pudo encontrar un formato de código que funcione.');
        }
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
