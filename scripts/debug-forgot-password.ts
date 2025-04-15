// scripts/debug-forgot-password.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error('Command stderr:', stderr);
    }
    return stdout.trim();
  } catch (error) {
    console.error('Error executing command:', error);
    throw error;
  }
}

async function debugForgotPasswordFlow() {
  try {
    console.log('Starting debug forgot password flow');
    
    // Correo específico para la prueba
    const email = 'andersonmontilva@gmail.com';
    const apiUrl = process.env.API_URL || 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
    
    console.log(`Testing forgot password flow for email: ${email}`);
    console.log(`Using API URL: ${apiUrl}`);
    
    // Crear un archivo temporal con el cuerpo de la solicitud
    const requestBodyPath = path.join(__dirname, 'forgot-password-request.json');
    
    const requestBody = {
      email: email
    };
    
    fs.writeFileSync(requestBodyPath, JSON.stringify(requestBody));
    
    try {
      // Llamar al endpoint de forgot-password usando curl con opciones de depuración
      console.log('Calling forgot-password endpoint with debug options...');
      
      const curlCommand = `curl -v -X POST "${apiUrl}/auth/forgot-password" \\
        -H "Content-Type: application/json" \\
        -H "User-Agent: PostmanRuntime/7.32.3" \\
        -H "Accept: */*" \\
        -H "Accept-Encoding: gzip, deflate, br" \\
        -H "Connection: keep-alive" \\
        -d @${requestBodyPath}`;
      
      console.log('Executing command:', curlCommand);
      const response = await runCommand(curlCommand);
      
      console.log('Response from forgot-password endpoint:');
      console.log(response);
      
      try {
        const jsonResponse = JSON.parse(response);
        if (jsonResponse.success) {
          console.log('Forgot password request successful!');
          console.log('Check your email for the password reset code');
        } else {
          console.log('Forgot password request failed:', jsonResponse.message);
          if (jsonResponse.errors) {
            console.log('Errors:', jsonResponse.errors);
          }
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.log('Raw response:', response);
      }
      
      // Probar también el endpoint de test-email para comparar
      console.log('\n\nTesting test-email endpoint for comparison...');
      
      const testEmailCommand = `curl -v -X POST "${apiUrl}/auth/test-email" \\
        -H "Content-Type: application/json" \\
        -H "User-Agent: PostmanRuntime/7.32.3" \\
        -H "Accept: */*" \\
        -H "Accept-Encoding: gzip, deflate, br" \\
        -H "Connection: keep-alive" \\
        -d @${requestBodyPath}`;
      
      console.log('Executing command:', testEmailCommand);
      const testEmailResponse = await runCommand(testEmailCommand);
      
      console.log('Response from test-email endpoint:');
      console.log(testEmailResponse);
      
      try {
        const jsonResponse = JSON.parse(testEmailResponse);
        if (jsonResponse.success) {
          console.log('Test email request successful!');
          console.log('Check your email for the test email');
        } else {
          console.log('Test email request failed:', jsonResponse.message);
          if (jsonResponse.errors) {
            console.log('Errors:', jsonResponse.errors);
          }
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.log('Raw response:', testEmailResponse);
      }
      
    } catch (requestError) {
      console.error('Error making request:', requestError);
    } finally {
      // Eliminar el archivo temporal
      if (fs.existsSync(requestBodyPath)) {
        fs.unlinkSync(requestBodyPath);
      }
    }
    
  } catch (error) {
    console.error('Error debugging forgot password flow:', error);
  }
}

// Ejecutar prueba
debugForgotPasswordFlow().catch(console.error);
