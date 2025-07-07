// services/botpress/handlers/token/token-alert.handler.ts

import { Handler, EventBridgeEvent } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
// SPECTRUM: BotpressEventsHandler removed - using polling instead

interface TokenAlertDetail {
  userId: string;
  usagePercentage: number;
  plan: string;
  remainingTokens: number;
  dailyLimit: number;
  alertType: 'APPROACHING_LIMIT' | 'NEAR_LIMIT' | 'LIMIT_REACHED';
}

/**
 * Handler Lambda para procesar alertas de límite de tokens
 * Este Lambda se activa mediante eventos de EventBridge cuando se detecta
 * que un usuario se acerca o ha superado su límite de tokens
 */
export const handler: Handler = async (event: EventBridgeEvent<'token-usage-alert', TokenAlertDetail>) => {
  console.info('Processing token alert event', { event });
  
  try {
    const detail = event.detail;
    // Si el evento viene de EventBridge, tendrá una estructura específica
    if (detail && detail.userId) {
      const { userId, usagePercentage, plan, remainingTokens, dailyLimit, alertType } = detail;
      
      // Enviar notificación al usuario via SSE
      await sendSSENotification(detail);

      // Enviar email de notificación si es un nivel de alerta alto
      if (detail.alertType === 'NEAR_LIMIT' || detail.alertType === 'LIMIT_REACHED') {
        await sendEmailNotification(detail);
      }

      // Determinar severidad de la alerta basada en el porcentaje de uso
      let severity = 'INFO';
      if (usagePercentage >= 100) {
        severity = 'HIGH';
      } else if (usagePercentage >= 80) {
        severity = 'MEDIUM';
      }
      
      // Obtener datos del usuario para personalizar el mensaje
      const user = await getUserDetails(userId);
      const userName = user?.name || 'user';
      
      // Construir mensaje personalizado
      let message = '';
      const formattedPercentage = usagePercentage.toFixed(1);
      
      if (alertType === 'LIMIT_REACHED') {
        message = `
          Hello ${userName},
          
          You have reached 100% of your daily token limit (${dailyLimit} tokens) for your ${plan} plan.
          
          ${remainingTokens <= 0 
            ? 'You cannot use more tokens today unless you upgrade your plan.' 
            : `You have ${remainingTokens} tokens remaining for today.`}
          
          Your tokens will be automatically reset tomorrow.
          
          If you need more tokens immediately, consider upgrading your plan.
          
          Best regards,
          The SPECTRUM Team
        `;
      } else {
        message = `
          Hello ${userName},
          
          You have used ${formattedPercentage}% of your daily token limit (${dailyLimit} tokens) for your ${plan} plan.
          
          You have ${remainingTokens} tokens remaining for today.
          
          Your tokens will be automatically reset tomorrow.
          
          Best regards,
          The SPECTRUM Team
        `;
      }
      
      // Enviar notificación por canales configurados
      await sendNotifications(userId, message.trim(), severity, plan);
      
      console.info('Token alert processed successfully', { 
        userId, 
        usagePercentage, 
        severity,
        alertType
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Token alert processed successfully'
        })
      };
    } else {
        console.error('Invalid event format', { event });
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid event format'
        })
      };
    }
  } catch (error) {
    console.error('Error processing token alert', { error });
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing token alert',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * SPECTRUM: Token alerts now handled via polling
 * Content creators will see alerts when they poll for messages
 * @param detail Detalles de la alerta
 */
async function sendSSENotification(detail: TokenAlertDetail): Promise<void> {
  try {
    // SPECTRUM: Token alerts are now stored and retrieved via polling
    // The polling endpoint will include system messages like token alerts

    console.info('SPECTRUM: Token alert logged for polling retrieval', {
      userId: detail.userId,
      alertType: detail.alertType,
      message: getAlertMessage(detail)
    });
  } catch (error) {
    console.error('Error sending SSE token alert notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: detail.userId
    });
    // No lanzamos el error para que el flujo continúe con otras notificaciones
  }
}

/**
 * Genera el mensaje de alerta apropiado según el tipo
 */
function getAlertMessage(detail: TokenAlertDetail): string {
  switch (detail.alertType) {
    case 'NEAR_LIMIT':
      return `Has usado ${detail.usagePercentage}% de tus tokens diarios. Te quedan ${detail.remainingTokens} tokens.`;
    case 'LIMIT_REACHED':
      return 'Has alcanzado tu límite diario de tokens. Tu plan se renovará mañana.';
    case 'WARNING':
      return `Advertencia: Has usado ${detail.usagePercentage}% de tus tokens diarios.`;
    default:
      return 'Notificación sobre el uso de tokens.';
  }
}

/**
 * Envía una notificación por email al usuario
 * @param detail Detalles de la alerta
 */
async function sendEmailNotification(detail: TokenAlertDetail): Promise<void> {
  
  const sesClient = new SESClient({});
  
  try {
    // Obtener el email del usuario (esto podría venir de una base de datos)
    const userEmail = await getUserDetails(detail.userId);
    
    if (!userEmail) {
      console.error('User email not found', { userId: detail.userId });
      return;
    }
    
    // Construir el mensaje según el tipo de alerta
    let subject, message;
    
    if (detail.alertType === 'LIMIT_REACHED') {
      subject = 'SPECTRUM AI: Token Limit Reached';
      message = `
        <p>You have reached your daily token limit of ${detail.dailyLimit} tokens.</p>
        <p>Your conversations will be limited until your tokens reset tomorrow.</p>
        <p>Consider upgrading your plan for higher token limits.</p>
      `;
    } else {
      subject = 'SPECTRUM AI: Approaching Token Limit';
      message = `
        <p>You are approaching your daily token limit.</p>
        <p>Current usage: ${detail.usagePercentage.toFixed(1)}% (${detail.remainingTokens} tokens remaining out of ${detail.dailyLimit})</p>
        <p>Consider using tokens wisely or upgrading your plan for higher limits.</p>
      `;
    }
    
    // Enviar el email
    await sesClient.send(new SendEmailCommand({
      Destination: {
        ToAddresses: [userEmail]
      },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: `
              <html>
                <body>
                  <h2>SPECTRUM AI Token Usage Alert</h2>
                  ${message}
                  <p>Thank you for using SPECTRUM AI.</p>
                </body>
              </html>
            `
          }
        },
        Subject: {
          Charset: 'UTF-8',
          Data: subject
        }
      },
      Source: process.env.NOTIFICATION_EMAIL_SENDER || 'notifications@spectrum-ai.com'
    }));
    
    console.info('Email notification sent', { userId: detail.userId, email: userEmail });
  } catch (error) {
    console.error('Error sending email notification', { error, userId: detail.userId });
    // No lanzamos el error para que el flujo continúe
  }
}

/**
 * Obtiene detalles del usuario desde DynamoDB
 * @param userId ID del usuario
 * @returns Datos del usuario o null si no se encuentra
 */
async function getUserDetails(userId: string): Promise<any | null> {
  const client = new DynamoDBClient({});
  const ddbDocClient = DynamoDBDocumentClient.from(client);
  const tableName = process.env.USERS_TABLE || 
    `${process.env.RESOURCE_PREFIX}-users`;
  
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: tableName,
      Key: { userId }
    }));
    
    return result.Item || null;
  } catch (error) {
    // En caso de error, seguimos el flujo pero devolvemos null
    // para que el proceso de alerta no se detenga
    console.error('Error getting user details', { error, userId });
    return null;
  }
}

/**
 * Envía notificaciones por los canales configurados
 * @param userId ID del usuario
 * @param message Mensaje a enviar
 * @param severity Severidad de la alerta
 * @param plan Plan del usuario
 */
async function sendNotifications(
  userId: string, 
  message: string, 
  severity: string,
  plan: string
): Promise<void> {
  
  // Enviar por SNS para notificaciones por email
  try {
    // Determinar el tema SNS según la severidad y el plan
    let snsTopicArn = '';
    
    if (severity === 'HIGH') {
      snsTopicArn = process.env.SNS_HIGH_PRIORITY_TOPIC || '';
    } else if (severity === 'MEDIUM') {
      snsTopicArn = process.env.SNS_MEDIUM_PRIORITY_TOPIC || '';
    } else {
      snsTopicArn = process.env.SNS_LOW_PRIORITY_TOPIC || '';
    }
    
    // Solo enviar si hay un tema configurado
    if (snsTopicArn) {
      const snsClient = new SNSClient({});
      
      const command = new PublishCommand({
        TopicArn: snsTopicArn,
        Subject: `SPECTRUM Token Usage Alert - ${severity}`,
        Message: message,
        MessageAttributes: {
          'UserId': {
            DataType: 'String',
            StringValue: userId
          },
          'Severity': {
            DataType: 'String',
            StringValue: severity
          },
          'Plan': {
            DataType: 'String',
            StringValue: plan
          }
        }
      });
      
      await snsClient.send(command);
      console.info('Token alert notification sent via SNS', { userId, severity });
    }
  } catch (error) {
    console.error('Error sending SNS notification', { error, userId });
    // No propagamos el error para continuar con otros canales
  }
  
  // Aquí se pueden agregar otros canales de notificación según sea necesario
  // Por ejemplo, notificaciones push, SMS, etc.
}