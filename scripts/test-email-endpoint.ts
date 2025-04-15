// scripts/test-email-endpoint.ts

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

async function testEmailEndpoint() {
  try {
    console.log('Starting test email endpoint test');
    
    // Correo específico para la prueba
    const email = 'andersonmontilva@gmail.com';
    const apiUrl = process.env.API_URL || 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';
    
    console.log(`Testing test-email endpoint for email: ${email}`);
    console.log(`Using API URL: ${apiUrl}`);
    
    // Crear un archivo temporal con el cuerpo de la solicitud
    const requestBodyPath = path.join(__dirname, 'test-email-request.json');
    
    const requestBody = {
      email: email
    };
    
    fs.writeFileSync(requestBodyPath, JSON.stringify(requestBody));
    
    try {
      // Llamar al endpoint de test-email usando curl
      console.log('Calling test-email endpoint...');
      
      const curlCommand = `curl -X POST "${apiUrl}/auth/test-email" \\
        -H "Content-Type: application/json" \\
        -d @${requestBodyPath}`;
      
      console.log('Executing command:', curlCommand);
      const response = await runCommand(curlCommand);
      
      console.log('Response from test-email endpoint:');
      console.log(response);
      
      try {
        const jsonResponse = JSON.parse(response);
        if (jsonResponse.success) {
          console.log('Test email sent successfully!');
          console.log('Check your email for the test email');
          if (jsonResponse.data && jsonResponse.data.messageId) {
            console.log('Message ID:', jsonResponse.data.messageId);
          }
        } else {
          console.log('Test email request failed:', jsonResponse.message);
          if (jsonResponse.errors) {
            console.log('Errors:', jsonResponse.errors);
          }
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.log('Raw response:', response);
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
    console.error('Error testing test-email endpoint:', error);
  }
}

// Ejecutar prueba
testEmailEndpoint().catch(console.error);
