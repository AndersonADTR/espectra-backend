// scripts/send-test-email-with-unique-subject.js

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Crear cliente de SES
const sesClient = new SESClient({ region: "us-east-1" });

// Generar un asunto único
const uniqueSubject = `Prueba de Correo SPECTRUM - ${new Date().toISOString()} - ${Math.random().toString(36).substring(2, 8)}`;

// Parámetros del correo
const params = {
  Source: "soporte@spectrumai.com.co",
  Destination: {
    ToAddresses: ["andersonmontilva@gmail.com"]
  },
  Message: {
    Subject: {
      Data: uniqueSubject
    },
    Body: {
      Text: {
        Data: `Este es un correo de prueba con un asunto único: ${uniqueSubject}`
      },
      Html: {
        Data: `
          <html>
            <body>
              <h1>Prueba de Correo SPECTRUM</h1>
              <p>Este es un correo de prueba con un asunto único: <strong>${uniqueSubject}</strong></p>
              <p>Hora de envío: ${new Date().toISOString()}</p>
              <p>Si estás recibiendo este correo, significa que la configuración de SES está funcionando correctamente.</p>
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
    console.log("Enviando correo de prueba con asunto único:", uniqueSubject);
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log("Correo enviado exitosamente:", response.MessageId);
    console.log("Por favor, verifica tu bandeja de entrada (y la carpeta de spam) para ver si has recibido el correo.");
  } catch (error) {
    console.error("Error al enviar el correo:", error);
  }
}

sendEmail();
