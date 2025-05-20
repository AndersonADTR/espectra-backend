// scripts/direct-ses-test.js

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Crear cliente de SES
const sesClient = new SESClient({ region: "us-east-1" });

// Parámetros del correo
const params = {
  Source: "soporte@spectrumai.com.co",
  Destination: {
    ToAddresses: ["andersonmontilva@gmail.com"]
  },
  Message: {
    Subject: {
      Data: "Prueba Directa de SES - " + new Date().toISOString()
    },
    Body: {
      Text: {
        Data: "Este es un correo de prueba enviado directamente desde SES usando el SDK de AWS."
      },
      Html: {
        Data: `
          <html>
            <body>
              <h1>Prueba Directa de SES</h1>
              <p>Este es un correo de prueba enviado directamente desde SES usando el SDK de AWS.</p>
              <p>Hora de envío: ${new Date().toISOString()}</p>
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
    console.log("Enviando correo de prueba...");
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log("Correo enviado exitosamente:", response.MessageId);
  } catch (error) {
    console.error("Error al enviar el correo:", error);
  }
}

sendEmail();
