// scripts/send-test-email-with-unique-subject-now.js

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Crear cliente de SES
const sesClient = new SESClient({ region: "us-east-1" });

// Generar un asunto único
const uniqueSubject = `IMPORTANTE: Prueba de Correo SPECTRUM - ${new Date().toISOString()} - ${Math.random().toString(36).substring(2, 8)}`;

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
        Data: `Este es un correo de prueba con un asunto único: ${uniqueSubject}. Por favor, verifica si este correo llega a tu bandeja de entrada o a la carpeta de spam.`
      },
      Html: {
        Data: `
          <html>
            <body>
              <h1>IMPORTANTE: Prueba de Correo SPECTRUM</h1>
              <p>Este es un correo de prueba con un asunto único: <strong>${uniqueSubject}</strong></p>
              <p>Hora de envío: ${new Date().toISOString()}</p>
              <p>ID único: ${Math.random().toString(36).substring(2, 15)}</p>
              <p>Si estás recibiendo este correo, significa que la configuración de SES está funcionando correctamente.</p>
              <p>Por favor, verifica si este correo llega a tu bandeja de entrada o a la carpeta de spam.</p>
              <p>Si no ves este correo en tu bandeja de entrada, por favor:</p>
              <ol>
                <li>Verifica la carpeta de spam</li>
                <li>Verifica la carpeta de "Promociones" o "Social" en Gmail</li>
                <li>Agrega anderson.montilva@technoapes.co a tu lista de contactos</li>
                <li>Marca este correo como "No es spam" si lo encuentras en la carpeta de spam</li>
              </ol>
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
    console.log("De:", params.Source);
    console.log("Para:", params.Destination.ToAddresses);
    console.log("Hora de envío:", new Date().toISOString());
    
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
