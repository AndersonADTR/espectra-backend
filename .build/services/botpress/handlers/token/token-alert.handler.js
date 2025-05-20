"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sns_1 = require("@aws-sdk/client-sns");
const client_ses_1 = require("@aws-sdk/client-ses");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const websocket_service_1 = require("@services/websocket/services/websocket.service");
const handler = async (event) => {
    console.info('Processing token alert event', { event });
    try {
        const detail = event.detail;
        if (detail && detail.userId) {
            const { userId, usagePercentage, plan, remainingTokens, dailyLimit, alertType } = detail;
            await sendWebSocketNotification(detail);
            if (detail.alertType === 'NEAR_LIMIT' || detail.alertType === 'LIMIT_REACHED') {
                await sendEmailNotification(detail);
            }
            let severity = 'INFO';
            if (usagePercentage >= 100) {
                severity = 'HIGH';
            }
            else if (usagePercentage >= 80) {
                severity = 'MEDIUM';
            }
            const user = await getUserDetails(userId);
            const userName = user?.name || 'user';
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
            }
            else {
                message = `
          Hello ${userName},
          
          You have used ${formattedPercentage}% of your daily token limit (${dailyLimit} tokens) for your ${plan} plan.
          
          You have ${remainingTokens} tokens remaining for today.
          
          Your tokens will be automatically reset tomorrow.
          
          Best regards,
          The SPECTRUM Team
        `;
            }
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
        }
        else {
            console.error('Invalid event format', { event });
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Invalid event format'
                })
            };
        }
    }
    catch (error) {
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
exports.handler = handler;
async function sendWebSocketNotification(detail) {
    const websocketService = new websocket_service_1.WebSocketService();
    try {
        const message = {
            type: 'token_alert',
            alertType: detail.alertType,
            usagePercentage: detail.usagePercentage,
            remainingTokens: detail.remainingTokens,
            dailyLimit: detail.dailyLimit,
            timestamp: Date.now()
        };
        const sentCount = await websocketService.sendMessageToUser(detail.userId, message);
        console.info('WebSocket notification sent', {
            userId: detail.userId,
            sentCount
        });
    }
    catch (error) {
        console.error('Error sending WebSocket notification', { error, userId: detail.userId });
    }
}
async function sendEmailNotification(detail) {
    const sesClient = new client_ses_1.SESClient({});
    try {
        const userEmail = await getUserDetails(detail.userId);
        if (!userEmail) {
            console.error('User email not found', { userId: detail.userId });
            return;
        }
        let subject, message;
        if (detail.alertType === 'LIMIT_REACHED') {
            subject = 'SPECTRUM AI: Token Limit Reached';
            message = `
        <p>You have reached your daily token limit of ${detail.dailyLimit} tokens.</p>
        <p>Your conversations will be limited until your tokens reset tomorrow.</p>
        <p>Consider upgrading your plan for higher token limits.</p>
      `;
        }
        else {
            subject = 'SPECTRUM AI: Approaching Token Limit';
            message = `
        <p>You are approaching your daily token limit.</p>
        <p>Current usage: ${detail.usagePercentage.toFixed(1)}% (${detail.remainingTokens} tokens remaining out of ${detail.dailyLimit})</p>
        <p>Consider using tokens wisely or upgrading your plan for higher limits.</p>
      `;
        }
        await sesClient.send(new client_ses_1.SendEmailCommand({
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
    }
    catch (error) {
        console.error('Error sending email notification', { error, userId: detail.userId });
    }
}
async function getUserDetails(userId) {
    const client = new client_dynamodb_1.DynamoDBClient({});
    const ddbDocClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
    const tableName = process.env.USERS_TABLE ||
        `${process.env.RESOURCE_PREFIX}-users`;
    try {
        const result = await ddbDocClient.send(new lib_dynamodb_1.GetCommand({
            TableName: tableName,
            Key: { userId }
        }));
        return result.Item || null;
    }
    catch (error) {
        console.error('Error getting user details', { error, userId });
        return null;
    }
}
async function sendNotifications(userId, message, severity, plan) {
    try {
        let snsTopicArn = '';
        if (severity === 'HIGH') {
            snsTopicArn = process.env.SNS_HIGH_PRIORITY_TOPIC || '';
        }
        else if (severity === 'MEDIUM') {
            snsTopicArn = process.env.SNS_MEDIUM_PRIORITY_TOPIC || '';
        }
        else {
            snsTopicArn = process.env.SNS_LOW_PRIORITY_TOPIC || '';
        }
        if (snsTopicArn) {
            const snsClient = new client_sns_1.SNSClient({});
            const command = new client_sns_1.PublishCommand({
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
    }
    catch (error) {
        console.error('Error sending SNS notification', { error, userId });
    }
}
//# sourceMappingURL=token-alert.handler.js.map