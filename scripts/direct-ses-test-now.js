// scripts/direct-ses-test-now.js

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Crear cliente de SES
const sesClient = new SESClient({ region: "us-east-1" });

// Generar un asunto único
const uniqueSubject = `Prueba de Diagnóstico SES - ${new Date().toISOString()} - ${Math.random().toString(36).substring(2, 8)}`;

// Parámetros del correo
const params = {
  Source: "anderson.montilva@technoapes.co",
  Destination: {
    ToAddresses: ["andersonmontilva@gmail.com"]
  },
  Message: {
    Subject: {
      Data: uniqueSubject
    },
    Body: {
      Text: {
        Data: `Este es un correo de diagnóstico para verificar si SES está funcionando correctamente. Hora: ${new Date().toISOString()}`
      },
      Html: {
        Data: `
          <html>
            <body>
              <h1>Prueba de Diagnóstico SES</h1>
              <p>Este es un correo de diagnóstico para verificar si SES está funcionando correctamente.</p>
              <p>Hora de envío: ${new Date().toISOString()}</p>
              <p>ID único: ${Math.random().toString(36).substring(2, 15)}</p>
            </body>
          </html>
        `
      }
    }
  }
};

// Enviar correo
async function sendEmail() {
  try {
    console.log("Enviando correo de diagnóstico...");
    console.log("Asunto:", uniqueSubject);
    console.log("De:", params.Source);
    console.log("Para:", params.Destination.ToAddresses);
    
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    
    console.log("Correo enviado exitosamente:");
    console.log("- Message ID:", response.MessageId);
    console.log("- Hora de envío:", new Date().toISOString());
    console.log("Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver si has recibido el correo.");
  } catch (error) {
    console.error("Error al enviar el correo:");
    console.error("- Nombre del error:", error.name);
    console.error("- Mensaje del error:", error.message);
    console.error("- Código del error:", error.code);
    console.error("- Detalles completos:", error);
  }
}

sendEmail();
