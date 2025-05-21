"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationService = void 0;
const logger_1 = require("@shared/utils/logger");
const email_service_1 = require("@shared/services/email/email.service");
const errors_1 = require("@shared/utils/errors");
const cognito_service_1 = require("./cognito.service");
const botpress_service_1 = require("@services/botpress/services/botpress/botpress.service");
const token_service_1 = require("./token.service");
const user_model_1 = require("../models/user.model");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const observability_service_1 = require("@shared/services/observability/observability.service");
const anomaly_detection_service_1 = require("@shared/services/observability/anomaly-detection.service");
const metrics_1 = require("@shared/utils/metrics");
class AuthenticationService {
    logger;
    metrics;
    cognitoService;
    botpressService;
    tokenService;
    dynamodb;
    observability;
    anomalyDetection;
    constructor() {
        this.logger = new logger_1.Logger('AuthenticationService');
        this.metrics = new metrics_1.MetricsService('Authentication');
        this.cognitoService = new cognito_service_1.CognitoService();
        this.tokenService = new token_service_1.TokenService();
        const ddbClient = new client_dynamodb_1.DynamoDBClient({});
        this.dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient);
        this.botpressService = botpress_service_1.BotpressService.getInstance();
        this.observability = observability_service_1.ObservabilityService.getInstance();
        this.anomalyDetection = anomaly_detection_service_1.AnomalyDetectionService.getInstance();
    }
    async forgotPassword(email) {
        try {
            this.logger.info('Starting password recovery process', { email });
            console.log('Starting password recovery process', {
                email,
                timestamp: new Date().toISOString()
            });
            const normalizedEmail = email.toLowerCase().trim();
            const user = await this.getUserByEmail(normalizedEmail);
            console.log('User lookup result in DynamoDB:', {
                userExists: !!user,
                email: normalizedEmail,
                userId: user?.userId,
                userSub: user?.userSub,
                userStatus: user?.status,
                timestamp: new Date().toISOString()
            });
            if (!user) {
                this.logger.info('Password recovery requested for non-existent user in DynamoDB', { email: normalizedEmail });
                console.log('Password recovery requested for non-existent user in DynamoDB', { email: normalizedEmail });
                try {
                    console.log('Checking if user exists in Cognito despite not being in DynamoDB', { email: normalizedEmail });
                    await this.cognitoService.getUserByEmail(normalizedEmail);
                    console.log('User exists in Cognito but not in DynamoDB', { email: normalizedEmail });
                }
                catch (cognitoCheckError) {
                    console.log('User does not exist in Cognito either', {
                        email: normalizedEmail,
                        errorName: cognitoCheckError instanceof Error ? cognitoCheckError.name : 'Unknown'
                    });
                }
            }
            else {
                if (!user.userSub) {
                    this.logger.warn('User does not have a valid userSub', { email: normalizedEmail, userId: user.userId });
                    console.log('User does not have a valid userSub', { email: normalizedEmail, userId: user.userId });
                    try {
                        const cognitoUser = await this.cognitoService.getUserByEmail(normalizedEmail);
                        if (cognitoUser && cognitoUser.sub) {
                            await this.updateUserSub(user.userId, cognitoUser.sub);
                            user.userSub = cognitoUser.sub;
                            this.logger.info('Updated user with Cognito sub', {
                                email: normalizedEmail,
                                userId: user.userId,
                                sub: cognitoUser.sub
                            });
                            console.log('Updated user with Cognito sub', {
                                email: normalizedEmail,
                                userId: user.userId,
                                sub: cognitoUser.sub
                            });
                        }
                    }
                    catch (subError) {
                        this.logger.error('Error retrieving userSub from Cognito', {
                            error: subError,
                            email: normalizedEmail,
                            userId: user.userId
                        });
                        console.error('Error retrieving userSub from Cognito', {
                            error: subError,
                            email: normalizedEmail,
                            userId: user.userId
                        });
                    }
                }
            }
            console.log('Sending password reset code via Cognito', { email: normalizedEmail });
            let deliveryDetails;
            try {
                deliveryDetails = await this.cognitoService.forgotPassword(normalizedEmail);
                console.log('Cognito forgotPassword call successful', {
                    email: normalizedEmail,
                    deliveryDetails
                });
                this.logger.info('Password recovery code sent successfully via Cognito', {
                    email: normalizedEmail,
                    deliveryDetails
                });
                console.log('IMPORTANT INFORMATION ABOUT THE RESET CODE:');
                console.log('1. The code has been sent to: ' + (deliveryDetails.destination || normalizedEmail));
                console.log('2. The code is valid for a limited time (usually 1 hour)');
                console.log('3. The code must be used with the /auth/reset-password endpoint');
                console.log('4. The code format is 6 digits (e.g., 123456)');
                console.log('5. The code is case-sensitive and must be entered exactly as received');
                try {
                    console.log('Also sending a custom email via SES with additional instructions', { email: normalizedEmail });
                    const emailService = email_service_1.EmailService.getInstance();
                    await emailService.sendPasswordResetInstructions(normalizedEmail);
                    console.log('Custom password reset instructions email sent successfully via SES', { email: normalizedEmail });
                }
                catch (sesError) {
                    console.error('Error sending custom instructions email via SES (non-blocking):', {
                        error: sesError,
                        name: sesError instanceof Error ? sesError.name : 'Unknown',
                        message: sesError instanceof Error ? sesError.message : String(sesError),
                        stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
                    });
                }
                await this.metrics.incrementCounter('PasswordRecoveryRequested');
                await this.observability.trackAuthEvent('PasswordRecoveryRequested', {
                    email: normalizedEmail,
                    deliveryMedium: deliveryDetails.deliveryMedium
                });
                return deliveryDetails;
            }
            catch (cognitoError) {
                console.error('Error sending password reset code via Cognito:', {
                    error: cognitoError,
                    name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                    message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
                    stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace',
                    email: normalizedEmail
                });
                throw cognitoError;
            }
        }
        catch (error) {
            this.logger.error('Error in password recovery process', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email
            });
            console.error('Error in password recovery process', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            await this.metrics.incrementCounter('PasswordRecoveryFailed');
            if (error instanceof Error) {
                if (error.name === 'UserNotFoundException') {
                    console.log('UserNotFoundException handled silently', { email });
                    return { destination: email, deliveryMedium: 'EMAIL' };
                }
                if (error.name === 'LimitExceededException') {
                    throw new errors_1.AuthenticationError('Too many attempts. Please wait a few minutes before requesting a new code.');
                }
                if (error.name === 'InvalidParameterException' ||
                    error.name === 'InvalidEmailRoleAccessPolicyException' ||
                    error.message.includes('email')) {
                    if (error.message.includes('not verified') ||
                        error.message.includes('identity') ||
                        error.message.includes('verification')) {
                        throw new errors_1.AuthenticationError('Email delivery configuration error: The sender email is not verified in SES. Please contact support.');
                    }
                    throw new errors_1.AuthenticationError('Email delivery configuration error: ' + error.message);
                }
            }
            throw new errors_1.AuthenticationError('Password recovery failed: ' + (error.message || 'Unknown error'));
        }
    }
    async updateUserSub(userId, userSub) {
        try {
            await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
                Key: {
                    userId: userId
                },
                UpdateExpression: 'SET userSub = :userSub',
                ExpressionAttributeValues: {
                    ':userSub': userSub
                }
            }));
            this.logger.info('User sub updated successfully', { userId, userSub });
        }
        catch (error) {
            this.logger.error('Error updating user sub', { error, userId, userSub });
        }
    }
    async resetPassword(email, newPassword, confirmationCode) {
        try {
            this.logger.info('Starting password reset process', { email });
            console.log('Starting password reset process', {
                email,
                confirmationCodeLength: confirmationCode ? confirmationCode.length : 0,
                timestamp: new Date().toISOString()
            });
            const normalizedEmail = email.toLowerCase().trim();
            const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');
            console.log('Normalized inputs', {
                email: normalizedEmail,
                codeLength: normalizedCode.length,
                codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                timestamp: new Date().toISOString()
            });
            if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
                console.warn('Confirmation code format is invalid', {
                    email: normalizedEmail,
                    codeLength: normalizedCode.length,
                    isNumeric: /^\d+$/.test(normalizedCode),
                    codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                    timestamp: new Date().toISOString()
                });
                if (normalizedCode.length !== 6) {
                    throw new errors_1.ValidationError(`Invalid confirmation code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`);
                }
                if (!/^\d+$/.test(normalizedCode)) {
                    throw new errors_1.ValidationError('Invalid confirmation code format: Code must contain only digits.');
                }
            }
            const user = await this.getUserByEmail(normalizedEmail);
            console.log('User lookup result in DynamoDB:', {
                userExists: !!user,
                email: normalizedEmail,
                userId: user?.userId,
                userSub: user?.userSub,
                userStatus: user?.status,
                timestamp: new Date().toISOString()
            });
            console.log('Calling Cognito to confirm forgot password', {
                email: normalizedEmail,
                codeLength: normalizedCode.length,
                codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                timestamp: new Date().toISOString()
            });
            try {
                await this.cognitoService.confirmForgotPassword(normalizedEmail, normalizedCode, newPassword);
                console.log('Cognito confirmForgotPassword call successful', {
                    email: normalizedEmail,
                    timestamp: new Date().toISOString()
                });
            }
            catch (confirmError) {
                console.error('Error from Cognito during confirmForgotPassword in authentication service', {
                    error: confirmError,
                    errorName: confirmError instanceof Error ? confirmError.name : 'Unknown',
                    errorMessage: confirmError instanceof Error ? confirmError.message : String(confirmError),
                    stack: confirmError instanceof Error ? confirmError.stack : 'No stack trace',
                    email: normalizedEmail,
                    codeLength: normalizedCode.length,
                    codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                    timestamp: new Date().toISOString()
                });
                throw confirmError;
            }
            if (user) {
                if (user.status === user_model_1.UserStatus.PENDING_PASSWORD_RESET ||
                    user.status === user_model_1.UserStatus.PENDING_VERIFICATION) {
                    console.log('Updating user status to ACTIVE', {
                        email: normalizedEmail,
                        userId: user.userId,
                        currentStatus: user.status
                    });
                    await this.updateUserStatus(user.userId, user_model_1.UserStatus.ACTIVE);
                    console.log('User status updated to ACTIVE', {
                        email: normalizedEmail,
                        userId: user.userId
                    });
                }
                else {
                    console.log('No need to update user status, already active', {
                        email: normalizedEmail,
                        userId: user.userId,
                        status: user.status
                    });
                }
            }
            else {
                console.log('User not found in DynamoDB, but password reset in Cognito was successful', {
                    email: normalizedEmail
                });
                try {
                    const cognitoUser = await this.cognitoService.getUserByEmail(normalizedEmail);
                    console.log('User exists in Cognito but not in DynamoDB', {
                        email: normalizedEmail,
                        cognitoStatus: cognitoUser.UserStatus,
                        sub: cognitoUser.sub
                    });
                    if (cognitoUser && cognitoUser.sub) {
                        console.log('Creating user record in DynamoDB based on Cognito data', {
                            email: normalizedEmail,
                            sub: cognitoUser.sub
                        });
                        await this.getOrCreateUserRecord(cognitoUser);
                        console.log('User record created in DynamoDB', {
                            email: normalizedEmail
                        });
                    }
                }
                catch (cognitoError) {
                    console.error('Error getting user from Cognito after password reset', {
                        error: cognitoError,
                        email: normalizedEmail,
                        errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                        errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
                    });
                }
            }
            try {
                console.log('Sending password reset confirmation email', { email: normalizedEmail });
                const emailService = email_service_1.EmailService.getInstance();
                await emailService.sendEmail({
                    to: normalizedEmail,
                    subject: 'Contraseña restablecida con éxito - SPECTRUM Platform',
                    html: `
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
                  .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
                  .success { color: #5cb85c; font-weight: bold; }
                  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>SPECTRUM Platform</h1>
                  </div>
                  <div class="content">
                    <p>Hola,</p>

                    <p class="success">¡Tu contraseña ha sido restablecida con éxito!</p>

                    <p>Ya puedes iniciar sesión en la plataforma SPECTRUM con tu nueva contraseña.</p>

                    <p>Si no realizaste esta acción, por favor contacta inmediatamente a nuestro equipo de soporte.</p>

                    <p>Saludos,<br>El equipo de SPECTRUM</p>
                  </div>
                  <div class="footer">
                    <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
                    <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.</p>
                  </div>
                </div>
              </body>
            </html>
          `,
                    text: `
            Contraseña restablecida con éxito - SPECTRUM Platform

            Hola,

            ¡Tu contraseña ha sido restablecida con éxito!

            Ya puedes iniciar sesión en la plataforma SPECTRUM con tu nueva contraseña.

            Si no realizaste esta acción, por favor contacta inmediatamente a nuestro equipo de soporte.

            Saludos,
            El equipo de SPECTRUM

            Este es un correo automático, por favor no respondas a este mensaje.
            © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
          `
                });
                console.log('Password reset confirmation email sent successfully', { email: normalizedEmail });
            }
            catch (emailError) {
                console.error('Error sending password reset confirmation email (non-blocking):', {
                    error: emailError,
                    email: normalizedEmail,
                    errorName: emailError instanceof Error ? emailError.name : 'Unknown',
                    errorMessage: emailError instanceof Error ? emailError.message : String(emailError)
                });
            }
            this.logger.info('Password reset completed successfully', { email: normalizedEmail });
            console.log('Password reset completed successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString()
            });
            await this.metrics.incrementCounter('PasswordResetSuccess');
            await this.observability.trackAuthEvent('PasswordResetCompleted', { email: normalizedEmail });
        }
        catch (error) {
            this.logger.error('Error in password reset process', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            console.error('Error in password reset process', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            await this.metrics.incrementCounter('PasswordResetFailed');
            if (error instanceof Error) {
                switch (error.name) {
                    case 'CodeMismatchException':
                        throw new errors_1.ValidationError('The confirmation code is incorrect. Please check the code and try again.');
                    case 'ExpiredCodeException':
                        this.logger.info('Confirmation code has expired, sending a new code', {
                            email,
                            timestamp: new Date().toISOString()
                        });
                        console.log('Confirmation code has expired, sending a new code', {
                            email,
                            timestamp: new Date().toISOString()
                        });
                        try {
                            const deliveryDetails = await this.cognitoService.forgotPassword(email);
                            this.logger.info('New confirmation code sent successfully', {
                                email,
                                deliveryDetails,
                                timestamp: new Date().toISOString()
                            });
                            console.log('New confirmation code sent successfully', {
                                email,
                                deliveryDetails,
                                timestamp: new Date().toISOString()
                            });
                            return {
                                message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.',
                                deliveryDetails
                            };
                        }
                        catch (sendError) {
                            this.logger.error('Failed to send a new confirmation code', {
                                error: sendError,
                                email,
                                timestamp: new Date().toISOString()
                            });
                            throw new errors_1.ValidationError('The confirmation code has expired. Please request a new code using the forgot password feature.');
                        }
                    case 'InvalidParameterException':
                        if (error.message.includes('Invalid code provided')) {
                            this.logger.info('Invalid code provided, suggesting to request a new code', {
                                email,
                                errorName: error.name,
                                errorMessage: error.message
                            });
                            console.log('Invalid code provided, attempting to send a new code', {
                                email,
                                errorName: error.name,
                                errorMessage: error.message
                            });
                            try {
                                this.logger.info('Attempting to send a new confirmation code', { email });
                                console.log('Attempting to send a new confirmation code', { email });
                                const deliveryDetails = await this.forgotPassword(email);
                                this.logger.info('New confirmation code sent successfully', {
                                    email,
                                    deliveryDetails
                                });
                                console.log('New confirmation code sent successfully', {
                                    email,
                                    deliveryDetails,
                                    timestamp: new Date().toISOString()
                                });
                                return {
                                    message: 'The confirmation code is invalid. We have sent a new code to your email. Please check your inbox and try again with the new code.'
                                };
                            }
                            catch (sendError) {
                                this.logger.error('Failed to send a new confirmation code', {
                                    error: sendError,
                                    email,
                                    originalError: error
                                });
                                console.error('Failed to send a new confirmation code', {
                                    error: sendError,
                                    email,
                                    originalError: error,
                                    errorName: sendError instanceof Error ? sendError.name : 'Unknown',
                                    errorMessage: sendError instanceof Error ? sendError.message : String(sendError)
                                });
                                throw new errors_1.ValidationError('The confirmation code is invalid. Please request a new code using the forgot password feature.');
                            }
                        }
                        throw new errors_1.ValidationError('Invalid parameters: ' + error.message);
                    case 'LimitExceededException':
                        throw new errors_1.ValidationError('Too many attempts. Please try again after some time.');
                    case 'UserNotFoundException':
                        throw new errors_1.ValidationError('User not found. Please check your email address and try again.');
                    case 'NotAuthorizedException':
                        throw new errors_1.ValidationError('Not authorized: ' + error.message);
                    default:
                        throw new errors_1.AuthenticationError('Password reset failed: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Password reset failed: ' + (error.message || 'Unknown error'));
        }
    }
    async verifyEmail(email, code) {
        try {
            this.logger.info('Starting email verification process', { email });
            await this.cognitoService.confirmSignUpWithCode(email, code);
            const user = await this.getUserByEmail(email);
            if (user && user.status === user_model_1.UserStatus.PENDING_VERIFICATION) {
                await this.updateUserStatus(user.userId, user_model_1.UserStatus.ACTIVE);
            }
            this.logger.info('Email verification completed successfully', { email });
            await this.metrics.incrementCounter('EmailVerificationSuccess');
            await this.observability.trackAuthEvent('EmailVerified', { email });
        }
        catch (error) {
            this.logger.error('Error in email verification process', { error, email });
            await this.metrics.incrementCounter('EmailVerificationFailed');
            if (error.name === 'CodeMismatchException') {
                throw new errors_1.ValidationError('Invalid verification code');
            }
            if (error.name === 'ExpiredCodeException') {
                throw new errors_1.ValidationError('Verification code has expired');
            }
            throw new errors_1.AuthenticationError('Email verification failed: ' + (error.message || 'Unknown error'));
        }
    }
    async resendVerificationCode(email) {
        try {
            this.logger.info('Starting resend verification code process', { email });
            console.log('Starting resend verification code process', { email });
            const user = await this.getUserByEmail(email);
            if (user && user.status === user_model_1.UserStatus.ACTIVE) {
                console.log('User is already active in DynamoDB, checking Cognito status', { email });
            }
            const deliveryDetails = await this.cognitoService.resendConfirmationCode(email);
            if (deliveryDetails.userStatus === 'CONFIRMED') {
                console.log('User is already confirmed in Cognito', { email });
                if (user && user.status !== user_model_1.UserStatus.ACTIVE) {
                    console.log('Updating user status in DynamoDB to ACTIVE', { email, userId: user.userId });
                    const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
                    await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: tableName,
                        Key: {
                            userId: user.userId
                        },
                        UpdateExpression: 'SET #status = :status',
                        ExpressionAttributeNames: {
                            '#status': 'status'
                        },
                        ExpressionAttributeValues: {
                            ':status': user_model_1.UserStatus.ACTIVE
                        }
                    }));
                    this.logger.info('User status updated to ACTIVE', { email, userId: user.userId });
                }
                return {
                    destination: email,
                    deliveryMedium: 'EMAIL',
                    userStatus: 'CONFIRMED'
                };
            }
            return deliveryDetails;
        }
        catch (error) {
            this.logger.error('Error resending verification code', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            console.error('Error in verification code resend process', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email
            });
            await this.metrics.incrementCounter('VerificationCodeResendFailed');
            if (error instanceof Error && error.name === 'UserNotFoundException') {
                this.logger.info('Verification code requested for non-existent user', { email });
                return {
                    destination: email,
                    deliveryMedium: 'EMAIL',
                    userStatus: 'UNKNOWN'
                };
            }
            if (error instanceof errors_1.ValidationError) {
                throw error;
            }
            throw new errors_1.AuthenticationError('Failed to resend verification code: ' + (error.message || 'Unknown error'));
        }
    }
    async updateUserStatus(userId, status) {
        try {
            await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
                Key: {
                    userId: userId
                },
                UpdateExpression: 'SET #status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': status
                }
            }));
            this.logger.info('User status updated successfully', { userId, status });
        }
        catch (error) {
            this.logger.error('Error updating user status', { error, userId, status });
        }
    }
    async registerUser(credentials) {
        const startTime = Date.now();
        console.log('Starting user registration process', {
            body: credentials
        });
        try {
            this.logger.info('Starting user registration process', {
                email: credentials.email,
                userType: credentials.userType
            });
            await this.verifyEmailAvailability(credentials.email);
            console.log('Email availability verified', {
                email: credentials.email
            });
            let userSub;
            try {
                userSub = await this.cognitoService.registerUser(credentials) || '';
                this.logger.info('Cognito registration completed', { email: credentials.email });
            }
            catch (error) {
                this.logger.error('Cognito registration failed', { error, email: credentials.email });
                await this.metrics.incrementCounter('RegistrationFailureCognito');
                throw error;
            }
            const userId = (0, uuid_1.v4)();
            let botpressUserKeyId;
            try {
                const botpressResponse = await this.botpressService.createBotpressUser(userId, credentials.email);
                botpressUserKeyId = botpressResponse.key;
                this.logger.info('Botpress user created', { name: credentials.email });
            }
            catch (error) {
                this.logger.error('Botpress user creation failed', { error, email: credentials.email });
                await this.metrics.incrementCounter('RegistrationFailureBotpress');
            }
            const user = new user_model_1.UserModel({
                userId: userId,
                userSub: userSub,
                email: credentials.email,
                name: credentials.name,
                botpressUserKeyId: botpressUserKeyId,
                phoneNumber: credentials.phoneNumber,
                userType: credentials.userType || 'basic',
                language: credentials.language || 'es',
                status: user_model_1.UserStatus.PENDING_VERIFICATION,
                createdAt: new Date().toISOString()
            });
            const transactItems = [{
                    Put: {
                        TableName: `${process.env.RESOURCE_PREFIX}-users`,
                        Item: user.toDynamoDB(),
                        ConditionExpression: 'attribute_not_exists(email)',
                    }
                }];
            this.logger.info('User record prepared', { user });
            try {
                await this.dynamodb.send(new lib_dynamodb_1.TransactWriteCommand({
                    TransactItems: transactItems
                }));
                console.log('User record created in DynamoDB', { email: credentials.email });
            }
            catch (error) {
                console.log('DynamoDB transaction failed', { error, email: credentials.email });
                try {
                    await this.cognitoService.deleteUser(credentials.email);
                    console.log('Cognito user cleaned up after DynamoDB failure', { email: credentials.email });
                }
                catch (cleanupError) {
                    this.logger.error('Failed to cleanup Cognito user after DynamoDB failure', {
                        originalError: error,
                        cleanupError,
                        email: credentials.email
                    });
                    console.error('Failed to cleanup Cognito user after DynamoDB failure', { error, cleanupError, email: credentials.email });
                }
                throw error;
            }
            try {
            }
            catch (error) {
                console.log('Error in user registration', { error, email: credentials.email });
                this.logger.error('Error in user registration', { error, email: credentials.email });
                await this.metrics.incrementCounter('RegistrationFailureDynamoDB');
                throw error;
            }
            console.log('User registration completed successfully', {
                email: credentials.email,
                duration: Date.now() - startTime
            });
            const shouldAutoConfirm = process.env.STAGE === 'dev' && process.env.AUTO_CONFIRM_USERS === 'true';
            console.log('Checking auto-confirmation settings', {
                stage: process.env.STAGE,
                autoConfirmUsers: process.env.AUTO_CONFIRM_USERS,
                shouldAutoConfirm
            });
            if (shouldAutoConfirm) {
                try {
                    console.log('Auto-confirming user in development environment', { email: credentials.email });
                    await this.cognitoService.confirmSignUp(credentials.email);
                    user.status = user_model_1.UserStatus.ACTIVE;
                    this.logger.info('User auto-confirmed in development environment', { email: credentials.email });
                    console.log('IMPORTANTE: La cuenta ha sido auto-confirmada automáticamente porque AUTO_CONFIRM_USERS=true');
                    console.log('Para probar el flujo de verificación, establece AUTO_CONFIRM_USERS=false');
                }
                catch (confirmError) {
                    console.error('Error auto-confirming user', {
                        error: confirmError,
                        email: credentials.email,
                        errorName: confirmError instanceof Error ? confirmError.name : 'Unknown',
                        errorMessage: confirmError instanceof Error ? confirmError.message : String(confirmError)
                    });
                    console.log('Auto-confirmation failed, falling back to sending verification email', { email: credentials.email });
                    await this.sendVerificationEmail(credentials.email);
                }
            }
            else {
                console.log('Auto-confirmation disabled, sending verification email', { email: credentials.email });
                await this.sendVerificationEmail(credentials.email);
                console.log('IMPORTANTE: Se ha enviado un correo de verificación a ' + credentials.email);
                console.log('El usuario debe usar el código recibido en el endpoint /auth/verify-email para confirmar su cuenta');
                console.log('Hasta que la cuenta no sea confirmada, el usuario no podrá iniciar sesión');
            }
            const duration = Date.now() - startTime;
            await this.metrics.recordLatency('RegistrationDuration', duration);
            await this.metrics.incrementCounter('RegistrationSuccess');
            await this.observability.trackAuthEvent('UserRegistered', {
                userType: user.userType,
                duration
            });
            console.log('User registration completed successfully', {
                userId: user.userId,
                email: credentials.email,
                duration
            });
            this.logger.info('User registration completed successfully', {
                userId: user.userId,
                email: user.email,
                duration
            });
            return user;
        }
        catch (error) {
            console.log('User registration failed', { error, email: credentials.email });
            await this.metrics.incrementCounter('RegistrationFailure');
            this.logger.error('User registration failed', {
                error,
                email: credentials.email,
                duration: Date.now() - startTime
            });
            if (error instanceof errors_1.ConflictError || error instanceof errors_1.ValidationError) {
                throw error;
            }
            throw new errors_1.AuthenticationError('Registration failed: ' + (error.message || 'Unknown error'));
        }
    }
    async login(credentials) {
        try {
            this.logger.info('Starting login process', {
                email: credentials.email,
                timestamp: new Date().toISOString()
            });
            console.log('Starting login process', {
                email: credentials.email,
                timestamp: new Date().toISOString()
            });
            const normalizedEmail = credentials.email.toLowerCase().trim();
            try {
                console.log('Checking if user exists in DynamoDB', { email: normalizedEmail });
                const existingUser = await this.getUserByEmail(normalizedEmail);
                if (existingUser) {
                    console.log('User exists in DynamoDB', {
                        email: normalizedEmail,
                        userId: existingUser.userId,
                        status: existingUser.status
                    });
                    if (existingUser.status !== user_model_1.UserStatus.ACTIVE) {
                        console.log('User is not active in DynamoDB', {
                            email: normalizedEmail,
                            status: existingUser.status
                        });
                        try {
                            const cognitoAttributes = await this.cognitoService.getUserByEmail(normalizedEmail);
                            console.log('User status in Cognito', {
                                email: normalizedEmail,
                                cognitoStatus: cognitoAttributes.UserStatus
                            });
                            if (cognitoAttributes.UserStatus === 'CONFIRMED' && existingUser.status !== user_model_1.UserStatus.ACTIVE) {
                                console.log('User is confirmed in Cognito but not active in DynamoDB, updating status', {
                                    email: normalizedEmail,
                                    cognitoStatus: cognitoAttributes.UserStatus,
                                    dynamoStatus: existingUser.status
                                });
                                const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
                                await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                                    TableName: tableName,
                                    Key: {
                                        userId: existingUser.userId
                                    },
                                    UpdateExpression: 'SET #status = :status',
                                    ExpressionAttributeNames: {
                                        '#status': 'status'
                                    },
                                    ExpressionAttributeValues: {
                                        ':status': user_model_1.UserStatus.ACTIVE
                                    }
                                }));
                                console.log('User status updated to ACTIVE in DynamoDB', {
                                    email: normalizedEmail,
                                    userId: existingUser.userId
                                });
                            }
                        }
                        catch (cognitoError) {
                            console.error('Error checking user status in Cognito', {
                                error: cognitoError,
                                email: normalizedEmail
                            });
                        }
                    }
                }
                else {
                    console.log('User does not exist in DynamoDB, will be created after successful authentication', {
                        email: normalizedEmail
                    });
                }
            }
            catch (dbError) {
                console.error('Error checking user in DynamoDB', {
                    error: dbError,
                    email: normalizedEmail
                });
            }
            console.log('Authenticating with Cognito', { email: normalizedEmail });
            const tokens = await this.cognitoService.authenticateUser({
                email: normalizedEmail,
                password: credentials.password
            });
            console.log('Authentication successful, tokens received', {
                email: normalizedEmail,
                accessTokenLength: tokens.accessToken.length,
                idTokenLength: tokens.idToken.length,
                refreshTokenLength: tokens.refreshToken.length
            });
            console.log('Getting user attributes from Cognito', { email: normalizedEmail });
            const userAttributes = await this.cognitoService.getUserByEmail(normalizedEmail);
            console.log('User attributes received from Cognito', {
                email: normalizedEmail,
                userStatus: userAttributes.UserStatus,
                emailVerified: userAttributes['email_verified']
            });
            console.log('Creating or updating user record in DynamoDB', { email: normalizedEmail });
            const user = await this.getOrCreateUserRecord(userAttributes);
            console.log('User record created or updated', {
                email: normalizedEmail,
                userId: user.userId,
                status: user.status
            });
            await this.observability.trackAuthEvent('LoginSuccess', {
                userId: user.userId
            });
            this.logger.info('Login successful', {
                email: normalizedEmail,
                userId: user.userId,
                timestamp: new Date().toISOString()
            });
            return {
                user,
                tokens
            };
        }
        catch (error) {
            this.logger.error('Error in login', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email: credentials.email
            });
            console.error('Error in login', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email: credentials.email
            });
            await this.observability.trackAuthEvent('LoginFailure', {
                email: credentials.email,
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            await this.anomalyDetection.trackMetric(credentials.email, 'failedLogins');
            if (error instanceof Error) {
                if (error.message.includes('not confirmed')) {
                    throw new errors_1.AuthenticationError('User is not confirmed. Please verify your email before logging in.');
                }
                if (error.message.includes('Invalid credentials')) {
                    throw new errors_1.AuthenticationError('Invalid email or password. Please check your credentials and try again.');
                }
                if (error.message.includes('No tokens received')) {
                    throw new errors_1.AuthenticationError('Authentication failed: Unable to generate authentication tokens. Please try again or contact support.');
                }
            }
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Login failed: ' + (error.message || 'Unknown error'));
        }
    }
    async logout(accessToken) {
        try {
            this.logger.info('Starting logout process');
            console.log('Starting logout process', {
                accessTokenLength: accessToken ? accessToken.length : 0,
                accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            });
            if (!accessToken) {
                console.error('No access token provided for logout');
                throw new errors_1.AuthenticationError('No access token provided');
            }
            if (!accessToken.includes('.') || accessToken.split('.').length !== 3) {
                console.error('Invalid token format', {
                    accessTokenLength: accessToken.length,
                    accessTokenFirstChars: accessToken.substring(0, 10) + '...'
                });
                throw new errors_1.AuthenticationError('Invalid token format');
            }
            try {
                console.log('Verifying token before logout');
                const payload = await this.tokenService.verifyToken(accessToken);
                console.log('Token verified successfully', {
                    sub: payload.sub,
                    username: payload.username,
                    hasEmail: !!payload.email
                });
            }
            catch (verifyError) {
                console.error('Error verifying token before logout', {
                    error: verifyError,
                    errorName: verifyError instanceof Error ? verifyError.name : 'Unknown',
                    errorMessage: verifyError instanceof Error ? verifyError.message : String(verifyError)
                });
            }
            console.log('Invalidating token in Cognito');
            try {
                await this.cognitoService.signOut(accessToken);
                console.log('Token invalidated successfully in Cognito');
            }
            catch (cognitoError) {
                console.error('Error invalidating token in Cognito', {
                    error: cognitoError,
                    errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                    errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
                });
                if (cognitoError instanceof Error &&
                    (cognitoError.name === 'NotAuthorizedException' ||
                        cognitoError.message.includes('expired'))) {
                    console.log('Token already invalid or expired in Cognito, continuing with local invalidation');
                }
                else {
                    throw cognitoError;
                }
            }
            console.log('Adding token to local blacklist');
            try {
                await this.tokenService.invalidateToken(accessToken);
                console.log('Token added to local blacklist successfully');
            }
            catch (blacklistError) {
                console.error('Error adding token to local blacklist', {
                    error: blacklistError,
                    errorName: blacklistError instanceof Error ? blacklistError.name : 'Unknown',
                    errorMessage: blacklistError instanceof Error ? blacklistError.message : String(blacklistError)
                });
            }
            this.logger.info('Logout completed successfully');
            console.log('Logout completed successfully', {
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            this.logger.error('Error in logout', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            console.error('Error in logout', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Logout failed: ' + (error.message || 'Unknown error'));
        }
    }
    async verifyEmailAvailability(email) {
        try {
            console.log('Verifying email availability', { email });
            const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
            console.log('Using table name:', { tableName });
            const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName: tableName,
                IndexName: 'EmailIndex',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email
                },
                Limit: 1
            }));
            if (result.Items && result.Items.length > 0) {
                console.log('Email already registered', { email });
                throw new errors_1.ConflictError('Email already registered');
            }
            console.log('Email availability verified', { email });
        }
        catch (error) {
            if (error instanceof errors_1.ConflictError) {
                throw error;
            }
            console.log('Error verifying email availability', { error, email });
            this.logger.error('Error verifying email availability', { error, email });
            throw new Error('Error verifying email availability');
        }
    }
    async validateToken(token) {
        try {
            const payload = await this.tokenService.verifyToken(token);
            this.logger.info('Token verified successfully', {
                sub: payload.sub,
                username: payload.username,
                hasEmail: !!payload.email
            });
            this.logger.debug('Token payload', { payload: JSON.stringify(payload) });
            let user = null;
            let searchMethods = [];
            let searchErrors = {};
            if (payload.email && payload.email.trim() !== '') {
                this.logger.info('Searching user by email', { email: payload.email });
                searchMethods.push('email');
                try {
                    user = await this.getUserByEmail(payload.email);
                    if (user) {
                        this.logger.info('User found by email', { userId: user.userId, email: payload.email });
                        return user;
                    }
                }
                catch (emailError) {
                    const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
                    this.logger.warn('Error searching user by email', { error: errorMessage, email: payload.email });
                    searchErrors['email'] = errorMessage;
                }
            }
            if (payload.username) {
                this.logger.info('Searching user by username', { username: payload.username });
                searchMethods.push('username');
                try {
                    user = await this.getUserBySub(payload.username);
                    if (user) {
                        this.logger.info('User found by username', { userId: user.userId, username: payload.username });
                        return user;
                    }
                }
                catch (usernameError) {
                    const errorMessage = usernameError instanceof Error ? usernameError.message : String(usernameError);
                    this.logger.warn('Error searching user by username', { error: errorMessage, username: payload.username });
                    searchErrors['username'] = errorMessage;
                }
            }
            if (payload.sub) {
                this.logger.info('Searching user by sub', { sub: payload.sub });
                searchMethods.push('sub');
                try {
                    user = await this.getUserBySub(payload.sub);
                    if (user) {
                        this.logger.info('User found by sub', { userId: user.userId, sub: payload.sub });
                        return user;
                    }
                }
                catch (subError) {
                    const errorMessage = subError instanceof Error ? subError.message : String(subError);
                    this.logger.warn('Error searching user by sub', { error: errorMessage, sub: payload.sub });
                    searchErrors['sub'] = errorMessage;
                }
            }
            this.logger.error('User not found after trying multiple methods', {
                searchMethods,
                searchErrors,
                sub: payload.sub,
                username: payload.username,
                hasEmail: !!payload.email
            });
            let errorMessage = `User not found. Tried searching by: ${searchMethods.join(', ')}`;
            if (Object.keys(searchErrors).length > 0) {
                const errorDetails = Object.entries(searchErrors)
                    .map(([method, error]) => `${method}: ${error}`)
                    .join('; ');
                errorMessage += `. Errors: ${errorDetails}`;
            }
            throw new errors_1.AuthenticationError(errorMessage);
        }
        catch (error) {
            this.logger.error('Error validating token', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Token validation failed: ' + (error.message || 'Unknown error'));
        }
    }
    async getOrCreateUserRecord(attributes) {
        try {
            console.log('getOrCreateUserRecord called with attributes', {
                hasAttributes: !!attributes,
                attributeKeys: attributes ? Object.keys(attributes) : []
            });
            if (!attributes || Object.keys(attributes).length === 0) {
                throw new Error('No user attributes provided');
            }
            const email = attributes.email || attributes['email'];
            if (!email) {
                console.error('Email not found in user attributes', { attributes });
                throw new Error('Email not found in user attributes');
            }
            const normalizedEmail = email.toLowerCase().trim();
            console.log('Looking for existing user record', { email: normalizedEmail });
            const existingUser = await this.getUserByEmail(normalizedEmail);
            if (existingUser) {
                console.log('Existing user found, updating last login', {
                    email: normalizedEmail,
                    userId: existingUser.userId,
                    status: existingUser.status
                });
                if (existingUser.status !== user_model_1.UserStatus.ACTIVE && attributes.UserStatus === 'CONFIRMED') {
                    console.log('User is confirmed in Cognito but not active in DynamoDB, updating status', {
                        email: normalizedEmail,
                        cognitoStatus: attributes.UserStatus,
                        dynamoStatus: existingUser.status
                    });
                    const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
                    await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                        TableName: tableName,
                        Key: {
                            userId: existingUser.userId
                        },
                        UpdateExpression: 'SET #status = :status',
                        ExpressionAttributeNames: {
                            '#status': 'status'
                        },
                        ExpressionAttributeValues: {
                            ':status': user_model_1.UserStatus.ACTIVE
                        }
                    }));
                    console.log('User status updated to ACTIVE', {
                        email: normalizedEmail,
                        userId: existingUser.userId
                    });
                    existingUser.status = user_model_1.UserStatus.ACTIVE;
                }
                await this.updateLastLogin(existingUser.userId);
                console.log('Last login updated successfully', {
                    email: normalizedEmail,
                    userId: existingUser.userId
                });
                return existingUser;
            }
            console.log('User not found, creating new record', { email: normalizedEmail });
            const userSub = attributes.sub || '';
            const emailVerified = attributes['email_verified'] === 'true' || attributes.UserStatus === 'CONFIRMED';
            let userStatus = user_model_1.UserStatus.PENDING_VERIFICATION;
            if (emailVerified || attributes.UserStatus === 'CONFIRMED') {
                userStatus = user_model_1.UserStatus.ACTIVE;
            }
            console.log('Creating new user with status', {
                email: normalizedEmail,
                userStatus,
                emailVerified,
                cognitoStatus: attributes.UserStatus
            });
            const newUser = new user_model_1.UserModel({
                email: normalizedEmail,
                name: attributes.name || '',
                userType: attributes['custom:userType'] || 'basic',
                status: userStatus,
                userSub: userSub
            });
            console.log('New user model created', {
                email: normalizedEmail,
                userId: newUser.userId,
                status: newUser.status,
                userSub: newUser.userSub
            });
            const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
            this.logger.debug('Using table name for creating user record:', { tableName });
            console.log('Saving new user to DynamoDB', {
                email: normalizedEmail,
                tableName
            });
            await this.dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName: tableName,
                Item: newUser.toDynamoDB()
            }));
            console.log('New user saved successfully', {
                email: normalizedEmail,
                userId: newUser.userId,
                status: newUser.status
            });
            return newUser;
        }
        catch (error) {
            console.error('Error in getOrCreateUserRecord', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            throw new errors_1.AuthenticationError('Failed to process user record: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserByEmail(email) {
        if (!email || email.trim() === '') {
            this.logger.warn('Empty email provided to getUserByEmail');
            return null;
        }
        try {
            const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
            this.logger.debug('Using table name for getUserByEmail:', { tableName });
            const response = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName: tableName,
                IndexName: 'EmailIndex',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email
                },
                Limit: 1
            }));
            if (!response.Items || response.Items.length === 0) {
                return null;
            }
            return user_model_1.UserModel.fromDynamoDB(response.Items[0]);
        }
        catch (error) {
            this.logger.error('Error getting user by email', { error, email });
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserBySub(sub) {
        if (!sub || sub.trim() === '') {
            this.logger.warn('Empty sub provided to getUserBySub');
            return null;
        }
        try {
            this.logger.info('Searching user by sub using SubIndex', { sub });
            try {
                const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
                this.logger.debug('Using table name for getUserBySub:', { tableName });
                const queryResponse = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                    TableName: tableName,
                    IndexName: 'SubIndex',
                    KeyConditionExpression: 'userSub = :userSub',
                    ExpressionAttributeValues: {
                        ':userSub': sub
                    },
                    Limit: 1
                }));
                if (queryResponse.Items && queryResponse.Items.length > 0) {
                    this.logger.info('User found by SubIndex', { sub });
                    return user_model_1.UserModel.fromDynamoDB(queryResponse.Items[0]);
                }
                this.logger.info('User not found using SubIndex', { sub });
            }
            catch (indexError) {
                this.logger.warn('Error using SubIndex, falling back to scan', {
                    error: indexError instanceof Error ? indexError.message : String(indexError),
                    sub
                });
            }
            this.logger.info('Scanning for user by userSub', { sub });
            const scanResponse = await this.dynamodb.send(new lib_dynamodb_1.ScanCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
                FilterExpression: 'userSub = :userSub',
                ExpressionAttributeValues: {
                    ':userSub': sub
                },
                Limit: 1
            }));
            if (scanResponse.Items && scanResponse.Items.length > 0) {
                this.logger.info('User found by userSub scan', { sub });
                return user_model_1.UserModel.fromDynamoDB(scanResponse.Items[0]);
            }
            this.logger.info('Trying to get user by userId', { userId: sub });
            const getResponse = await this.dynamodb.send(new lib_dynamodb_1.GetCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
                Key: {
                    userId: sub
                }
            }));
            if (getResponse.Item) {
                this.logger.info('User found by userId', { userId: sub });
                return user_model_1.UserModel.fromDynamoDB(getResponse.Item);
            }
            this.logger.info('User not found by any method', { sub });
            return null;
        }
        catch (error) {
            this.logger.error('Error getting user by sub', { error, sub });
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserById(userId) {
        try {
            this.logger.info('Getting user by ID', { userId });
            const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
            this.logger.debug('Using table name for getUserById:', { tableName });
            const response = await this.dynamodb.send(new lib_dynamodb_1.GetCommand({
                TableName: tableName,
                Key: {
                    userId: userId
                }
            }));
            if (!response.Item) {
                this.logger.info('User not found', { userId });
                return null;
            }
            this.logger.info('User found', { userId });
            return user_model_1.UserModel.fromDynamoDB(response.Item);
        }
        catch (error) {
            this.logger.error('Error getting user by ID', { error, userId });
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async updateLastLogin(userId) {
        try {
            const tableName = process.env.USERS_TABLE || `${process.env.RESOURCE_PREFIX}-users`;
            this.logger.debug('Using table name for updateLastLogin:', { tableName });
            await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: tableName,
                Key: {
                    userId: userId
                },
                UpdateExpression: 'SET lastLogin = :now',
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString()
                }
            }));
        }
        catch (error) {
            this.logger.error('Error updating last login', { error, userId });
        }
    }
    async refreshTokens(userSub, refreshToken) {
        try {
            const response = await this.cognitoService.refreshUserTokens(userSub, refreshToken);
            console.log('Tokens refreshed', { response });
            if (!response) {
                throw new errors_1.AuthenticationError('Failed to refresh tokens');
            }
            const decodedToken = await this.tokenService.verifyToken(response.accessToken);
            console.log('Decoded token', { decodedToken });
            const userAttributes = await this.cognitoService.getUserBySub(userSub);
            const user = await this.getOrCreateUserRecord(userAttributes);
            console.log('User record updated', { user });
            const result = {
                user,
                tokens: {
                    accessToken: response.accessToken,
                    refreshToken: response.refreshToken,
                    idToken: response.idToken,
                    expiresIn: response.expiresIn || 3600
                }
            };
            console.log('Token refresh successful', { result });
            return result;
        }
        catch (error) {
            console.log('Error refreshing tokens', { error });
            if (error.name === 'NotAuthorizedException') {
                throw new errors_1.AuthenticationError('Invalid refresh token');
            }
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Token refresh failed: ' + (error.message || 'Unknown error'));
        }
    }
    async cleanup() {
        await this.tokenService.cleanup();
    }
    async sendVerificationEmail(email) {
        try {
            this.logger.info('Sending verification email', { email });
            console.log('Sending verification email', { email });
            console.log('Sending verification code via Cognito', { email });
            try {
                const deliveryDetails = await this.cognitoService.resendConfirmationCode(email);
                console.log('Cognito resendConfirmationCode call successful', {
                    email,
                    deliveryDetails
                });
                if (deliveryDetails.userStatus === 'CONFIRMED') {
                    console.log('User is already confirmed, no need to send verification code', { email });
                    this.logger.info('User is already confirmed, no need to send verification code', { email });
                    return;
                }
                this.logger.info('Verification code sent successfully via Cognito', {
                    email,
                    destination: deliveryDetails.destination,
                    deliveryMedium: deliveryDetails.deliveryMedium
                });
                console.log('IMPORTANTE: El código de verificación ha sido enviado por Cognito a ' +
                    (deliveryDetails.destination || email) + ' via ' + (deliveryDetails.deliveryMedium || 'EMAIL') + '. ' +
                    'Este código debe ser utilizado en el endpoint /auth/verify-email para confirmar la cuenta.');
                try {
                    console.log('Sending backup email with instructions via SES', { email });
                    await this.sendInstructionalEmail(email);
                    console.log('Backup instructional email sent successfully via SES', { email });
                }
                catch (sesError) {
                    console.error('Error sending backup instructional email', {
                        error: sesError,
                        email,
                        errorName: sesError instanceof Error ? sesError.name : 'Unknown',
                        errorMessage: sesError instanceof Error ? sesError.message : String(sesError)
                    });
                }
            }
            catch (cognitoError) {
                console.error('Error sending verification code via Cognito', {
                    error: cognitoError,
                    email,
                    errorName: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                    errorMessage: cognitoError instanceof Error ? cognitoError.message : String(cognitoError)
                });
                console.log('Cognito failed, sending instructional email via SES', { email });
                try {
                    await this.sendInstructionalEmail(email);
                    console.log('Instructional email sent successfully via SES after Cognito failure', { email });
                }
                catch (sesError) {
                    console.error('Error sending instructional email via SES', {
                        error: sesError,
                        email,
                        errorName: sesError instanceof Error ? sesError.name : 'Unknown',
                        errorMessage: sesError instanceof Error ? sesError.message : String(sesError)
                    });
                    throw cognitoError;
                }
            }
        }
        catch (error) {
            this.logger.error('Error sending verification email', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            console.error('Failed to send verification email', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
        }
    }
    async sendInstructionalEmail(email) {
        try {
            console.log('Preparing instructional email', { email });
            const emailService = email_service_1.EmailService.getInstance();
            const subject = 'Instrucciones para verificar tu cuenta - SPECTRUM Platform';
            const sampleCode = Math.floor(100000 + Math.random() * 900000).toString();
            const html = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4a90e2; color: white; padding: 10px 20px; text-align: center; }
              .content { padding: 20px; border: 1px solid #ddd; border-top: none; }
              .instructions { background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
              .code { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; padding: 10px; background-color: #f5f5f5; border-radius: 4px; }
              .warning { color: #e74c3c; font-weight: bold; }
              .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
              .button { display: inline-block; background-color: #4a90e2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin-top: 15px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>SPECTRUM Platform</h1>
              </div>
              <div class="content">
                <p>Hola,</p>
                <p>Gracias por registrarte en la plataforma SPECTRUM. Para completar tu registro, necesitas verificar tu dirección de correo electrónico.</p>

                <div class="instructions">
                  <h3>Instrucciones para verificar tu cuenta:</h3>
                  <p>1. Deberías haber recibido un correo de AWS Cognito con un código de verificación de 6 dígitos.</p>
                  <p>2. Si no has recibido el código, puedes solicitar uno nuevo utilizando el endpoint <strong>/auth/resend-verification-code</strong>.</p>
                  <p>3. Una vez que tengas el código, utilízalo con el endpoint <strong>/auth/verify-email</strong> para confirmar tu cuenta.</p>
                </div>

                <p><strong>¿No recibiste el código de AWS Cognito?</strong> Revisa tu carpeta de spam o solicita un nuevo código.</p>

                <p class="warning">IMPORTANTE: El código de verificación debe venir de un correo de AWS Cognito, no de este correo.</p>

                <p>Un código de verificación se ve así (este es solo un ejemplo y NO funcionará para verificar tu cuenta):</p>
                <div class="code">${sampleCode}</div>

                <p><strong>¿Problemas para verificar tu cuenta?</strong> Contacta a nuestro equipo de soporte.</p>

                <p>Saludos,<br>El equipo de SPECTRUM</p>
              </div>
              <div class="footer">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
                <p>&copy; ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
        </html>
      `;
            const text = `
        Instrucciones para verificar tu cuenta - SPECTRUM Platform

        Hola,

        Gracias por registrarte en la plataforma SPECTRUM. Para completar tu registro, necesitas verificar tu dirección de correo electrónico.

        Instrucciones para verificar tu cuenta:

        1. Deberías haber recibido un correo de AWS Cognito con un código de verificación de 6 dígitos.
        2. Si no has recibido el código, puedes solicitar uno nuevo utilizando el endpoint /auth/resend-verification-code.
        3. Una vez que tengas el código, utilízalo con el endpoint /auth/verify-email para confirmar tu cuenta.

        IMPORTANTE: El código de verificación debe venir de un correo de AWS Cognito, no de este correo.

        Un código de verificación se ve así (este es solo un ejemplo y NO funcionará para verificar tu cuenta):
        ${sampleCode}

        ¿No recibiste el código? Revisa tu carpeta de spam o solicita un nuevo código.
        ¿Problemas para verificar tu cuenta? Contacta a nuestro equipo de soporte.

        Saludos,
        El equipo de SPECTRUM

        Este es un correo automático, por favor no respondas a este mensaje.
        © ${new Date().getFullYear()} SPECTRUM Platform. Todos los derechos reservados.
      `;
            await emailService.sendEmail({
                to: email,
                subject,
                text,
                html
            });
            console.log('Instructional email sent successfully', { email });
        }
        catch (error) {
            console.error('Error sending instructional email', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}
exports.AuthenticationService = AuthenticationService;
//# sourceMappingURL=authentication.service.js.map