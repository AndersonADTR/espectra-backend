// scripts/test-forgot-password-curl.js

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuración
const apiUrl = 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
const email = 'andersonmontilva@gmail.com';

// Crear archivo temporal con el cuerpo de la solicitud
const tempFilePath = path.join(os.tmpdir(), 'forgot-password-body.json');
fs.writeFileSync(tempFilePath, JSON.stringify({ email }));

console.log('Probando endpoint forgot-password con curl...');
console.log('URL:', `${apiUrl}/auth/forgot-password`);
console.log('Cuerpo:', fs.readFileSync(tempFilePath, 'utf8'));

// Comando curl para forgot-password
const forgotPasswordCommand = `curl -v -X POST "${apiUrl}/auth/forgot-password" \\
  -H "Content-Type: application/json" \\
  -H "User-Agent: PostmanRuntime/7.32.3" \\
  -H "Accept: */*" \\
  -H "Accept-Encoding: gzip, deflate, br" \\
  -H "Connection: keep-alive" \\
  -d @${tempFilePath}`;

// Ejecutar curl para forgot-password
exec(forgotPasswordCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('Error ejecutando curl para forgot-password:', error);
    return;
  }
  
  console.log('Salida de curl para forgot-password:');
  console.log(stdout);
  console.log('Errores/Verbose de curl para forgot-password:');
  console.log(stderr);
  
  console.log('\n\nProbando endpoint test-email con curl...');
  console.log('URL:', `${apiUrl}/auth/test-email`);
  console.log('Cuerpo:', fs.readFileSync(tempFilePath, 'utf8'));
  
  // Comando curl para test-email
  const testEmailCommand = `curl -v -X POST "${apiUrl}/auth/test-email" \\
    -H "Content-Type: application/json" \\
    -H "User-Agent: PostmanRuntime/7.32.3" \\
    -H "Accept: */*" \\
    -H "Accept-Encoding: gzip, deflate, br" \\
    -H "Connection: keep-alive" \\
    -d @${tempFilePath}`;
  
  // Ejecutar curl para test-email
  exec(testEmailCommand, (error2, stdout2, stderr2) => {
    if (error2) {
      console.error('Error ejecutando curl para test-email:', error2);
      return;
    }
    
    console.log('Salida de curl para test-email:');
    console.log(stdout2);
    console.log('Errores/Verbose de curl para test-email:');
    console.log(stderr2);
    
    // Eliminar archivo temporal
    fs.unlinkSync(tempFilePath);
  });
});
