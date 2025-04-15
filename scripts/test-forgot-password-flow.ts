// scripts/test-forgot-password-flow.ts

import { exec } from 'child_process';
import { promisify } from 'util';

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

async function testForgotPasswordFlow() {
  try {
    console.log('Starting forgot password flow test');

    // Correo específico para la prueba
    const email = 'andersonmontilva@gmail.com';
    const apiUrl = process.env.API_URL || 'https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev';

    console.log(`Testing forgot password flow for email: ${email}`);
    console.log(`Using API URL: ${apiUrl}`);

    // Crear un archivo temporal con el cuerpo de la solicitud
    const fs = require('fs');
    const path = require('path');
    const requestBodyPath = path.join(__dirname, 'forgot-password-request.json');

    const requestBody = {
      email: email
    };

    fs.writeFileSync(requestBodyPath, JSON.stringify(requestBody));

    try {
      // Llamar al endpoint de forgot-password usando curl
      console.log('Calling forgot-password endpoint...');

      const curlCommand = `curl -X POST "${apiUrl}/auth/forgot-password" \
        -H "Content-Type: application/json" \
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

    } catch (requestError) {
      console.error('Error making request:', requestError);
    } finally {
      // Eliminar el archivo temporal
      if (fs.existsSync(requestBodyPath)) {
        fs.unlinkSync(requestBodyPath);
      }
    }

  } catch (error) {
    console.error('Error testing forgot password flow:', error);
  }
}

// Ejecutar prueba
testForgotPasswordFlow().catch(console.error);
