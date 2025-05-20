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
            console.log('Starting password recovery process', { email });
            const user = await this.getUserByEmail(email);
            console.log('User lookup result:', {
                userExists: !!user,
                email,
                userId: user?.userId,
                userSub: user?.userSub,
                userStatus: user?.status
            });
            if (!user) {
                this.logger.info('Password recovery requested for non-existent user', { email });
                console.log('Password recovery requested for non-existent user', { email });
                return;
            }
            if (!user.userSub) {
                this.logger.warn('User does not have a valid userSub', { email, userId: user.userId });
                console.log('User does not have a valid userSub', { email, userId: user.userId });
                try {
                    const cognitoUser = await this.cognitoService.getUserByEmail(email);
                    if (cognitoUser && cognitoUser.sub) {
                        await this.updateUserSub(user.userId, cognitoUser.sub);
                        user.userSub = cognitoUser.sub;
                        this.logger.info('Updated user with Cognito sub', { email, userId: user.userId, sub: cognitoUser.sub });
                        console.log('Updated user with Cognito sub', { email, userId: user.userId, sub: cognitoUser.sub });
                    }
                }
                catch (subError) {
                    this.logger.error('Error retrieving userSub from Cognito', {
                        error: subError,
                        email,
                        userId: user.userId
                    });
                    console.error('Error retrieving userSub from Cognito', {
                        error: subError,
                        email,
                        userId: user.userId
                    });
                }
            }
            try {
                console.log('Sending password reset email via direct SES', { email });
                try {
                    console.log('Trying to send password reset code via Cognito first', { email });
                    await this.cognitoService.forgotPassword(email);
                    console.log('Cognito forgotPassword call successful', { email });
                    this.logger.info('Password recovery code sent successfully via Cognito', { email });
                    console.log('Also sending a custom email via SES as backup', { email });
                    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
                    try {
                        const emailService = email_service_1.EmailService.getInstance();
                        console.log('EmailService instance created', {
                            defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
                            region: process.env.REGION || 'us-east-1'
                        });
                        await emailService.sendPasswordResetEmail(email, resetCode, true);
                        console.log('Custom password reset email sent successfully via direct SES', { email });
                        this.logger.info('Custom password reset email sent successfully via direct SES', { email });
                    }
                    catch (sesError) {
                        console.error('Error sending custom email via direct SES (non-blocking):', {
                            error: sesError,
                            name: sesError instanceof Error ? sesError.name : 'Unknown',
                            message: sesError instanceof Error ? sesError.message : String(sesError),
                            stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
                        });
                    }
                }
                catch (cognitoError) {
                    console.error('Error sending password reset code via Cognito:', {
                        error: cognitoError,
                        name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                        message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
                        stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
                    });
                    console.log('Cognito failed, using only direct SES as fallback', { email });
                    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
                    try {
                        const emailService = email_service_1.EmailService.getInstance();
                        console.log('EmailService instance created', {
                            defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
                            region: process.env.REGION || 'us-east-1'
                        });
                        await emailService.sendPasswordResetEmail(email, resetCode);
                        console.log('Password reset email sent successfully via direct SES', { email });
                        this.logger.info('Password reset email sent successfully via direct SES', { email });
                    }
                    catch (sesError) {
                        console.error('Error sending email via direct SES:', {
                            error: sesError,
                            name: sesError instanceof Error ? sesError.name : 'Unknown',
                            message: sesError instanceof Error ? sesError.message : String(sesError),
                            stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
                        });
                        throw cognitoError;
                    }
                }
                await this.metrics.incrementCounter('PasswordRecoveryRequested');
                await this.observability.trackAuthEvent('PasswordRecoveryRequested', { email });
            }
            catch (emailError) {
                console.error('All email delivery methods failed:', {
                    error: emailError,
                    name: emailError instanceof Error ? emailError.name : 'Unknown',
                    message: emailError instanceof Error ? emailError.message : String(emailError),
                    stack: emailError instanceof Error ? emailError.stack : 'No stack trace'
                });
                throw new errors_1.AuthenticationError('Failed to send password recovery email: ' + (emailError.message || 'Unknown error'));
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
                email
            });
            await this.metrics.incrementCounter('PasswordRecoveryFailed');
            if (error instanceof Error && error.name === 'UserNotFoundException') {
                console.log('UserNotFoundException handled silently', { email });
                return;
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
            await this.cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);
            const user = await this.getUserByEmail(email);
            if (user && user.status === user_model_1.UserStatus.PENDING_PASSWORD_RESET) {
                await this.updateUserStatus(user.userId, user_model_1.UserStatus.ACTIVE);
            }
            this.logger.info('Password reset completed successfully', { email });
            await this.metrics.incrementCounter('PasswordResetSuccess');
            await this.observability.trackAuthEvent('PasswordResetCompleted', { email });
        }
        catch (error) {
            this.logger.error('Error in password reset process', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            await this.metrics.incrementCounter('PasswordResetFailed');
            if (error.name === 'CodeMismatchException') {
                throw new errors_1.ValidationError('The confirmation code is incorrect. Please check the code and try again.');
            }
            if (error.name === 'ExpiredCodeException' ||
                (error.message && error.message.includes('Invalid code provided'))) {
                this.logger.info('Confirmation code has expired or is invalid, suggesting to request a new code', {
                    email,
                    errorName: error.name,
                    errorMessage: error.message
                });
                try {
                    this.logger.info('Attempting to send a new confirmation code', { email });
                    await this.forgotPassword(email);
                    this.logger.info('New confirmation code sent successfully', {
                        email,
                        message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.'
                    });
                    return {
                        message: 'The confirmation code has expired. We have sent a new code to your email. Please check your inbox and try again with the new code.'
                    };
                }
                catch (sendError) {
                    this.logger.error('Failed to send a new confirmation code', {
                        error: sendError,
                        email,
                        originalError: error
                    });
                    throw new errors_1.ValidationError('The confirmation code has expired. Please request a new code using the forgot password feature.');
                }
            }
            if (error.name === 'LimitExceededException') {
                throw new errors_1.ValidationError('Too many attempts. Please try again after some time.');
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
            if (!user) {
                this.logger.info('Verification code requested for non-existent user', { email });
                console.log('Verification code requested for non-existent user', { email });
                return;
            }
            if (user.status === user_model_1.UserStatus.ACTIVE) {
                this.logger.info('User is already verified', { email, userId: user.userId });
                console.log('User is already verified', { email, userId: user.userId });
                throw new errors_1.ValidationError('Email is already verified');
            }
            try {
                console.log('Trying to resend verification code via Cognito', { email });
                await this.cognitoService.resendConfirmationCode(email);
                console.log('Cognito resendConfirmationCode call successful', { email });
                this.logger.info('Verification code resent successfully via Cognito', { email });
                console.log('Also sending a custom verification email via SES as backup', { email });
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                try {
                    const emailService = email_service_1.EmailService.getInstance();
                    console.log('EmailService instance created', {
                        defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
                        region: process.env.REGION || 'us-east-1'
                    });
                    await emailService.sendVerificationEmail(email, verificationCode);
                    console.log('Custom verification email sent successfully via direct SES', { email });
                    this.logger.info('Custom verification email sent successfully via direct SES', { email });
                }
                catch (sesError) {
                    console.error('Error sending custom email via direct SES (non-blocking):', {
                        error: sesError,
                        name: sesError instanceof Error ? sesError.name : 'Unknown',
                        message: sesError instanceof Error ? sesError.message : String(sesError),
                        stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
                    });
                }
            }
            catch (cognitoError) {
                console.error('Error resending verification code via Cognito:', {
                    error: cognitoError,
                    name: cognitoError instanceof Error ? cognitoError.name : 'Unknown',
                    message: cognitoError instanceof Error ? cognitoError.message : String(cognitoError),
                    stack: cognitoError instanceof Error ? cognitoError.stack : 'No stack trace'
                });
                console.log('Cognito failed, using only direct SES as fallback', { email });
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                try {
                    const emailService = email_service_1.EmailService.getInstance();
                    console.log('EmailService instance created', {
                        defaultSender: process.env.SES_FROM_EMAIL || 'soporte@spectrumai.com.co',
                        region: process.env.REGION || 'us-east-1'
                    });
                    await emailService.sendVerificationEmail(email, verificationCode);
                    console.log('Verification email sent successfully via direct SES', { email });
                    this.logger.info('Verification email sent successfully via direct SES', { email });
                }
                catch (sesError) {
                    console.error('Error sending email via direct SES:', {
                        error: sesError,
                        name: sesError instanceof Error ? sesError.name : 'Unknown',
                        message: sesError instanceof Error ? sesError.message : String(sesError),
                        stack: sesError instanceof Error ? sesError.stack : 'No stack trace'
                    });
                    throw cognitoError;
                }
            }
            this.logger.info('Verification code resent successfully', { email });
            await this.metrics.incrementCounter('VerificationCodeResent');
            await this.observability.trackAuthEvent('VerificationCodeResent', { email });
        }
        catch (error) {
            this.logger.error('Error resending verification code', { error, email });
            console.error('Error in verification code resend process', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email
            });
            await this.metrics.incrementCounter('VerificationCodeResendFailed');
            if (error instanceof Error && error.name === 'UserNotFoundException') {
                this.logger.info('Verification code requested for non-existent user', { email });
                return;
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
            if (process.env.STAGE === 'dev') {
                await this.cognitoService.confirmSignUp(credentials.email);
                user.status = user_model_1.UserStatus.ACTIVE;
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
            const tokens = await this.cognitoService.authenticateUser(credentials);
            const userAttributes = await this.cognitoService.getUserByEmail(credentials.email);
            const user = await this.getOrCreateUserRecord(userAttributes);
            await this.observability.trackAuthEvent('LoginSuccess', {
                userId: user.userId
            });
            return {
                user,
                tokens
            };
        }
        catch (error) {
            console.log('Error in login', { error });
            await this.observability.trackAuthEvent('LoginFailure');
            await this.anomalyDetection.trackMetric(credentials.email, 'failedLogins');
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Login failed: ' + (error.message || 'Unknown error'));
        }
    }
    async logout(accessToken) {
        try {
            await this.cognitoService.signOut(accessToken);
            await this.tokenService.invalidateToken(accessToken);
        }
        catch (error) {
            this.logger.error('Error in logout', { error });
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Logout failed: ' + (error.message || 'Unknown error'));
        }
    }
    async verifyEmailAvailability(email) {
        try {
            console.log('Verifying email availability', { email });
            const result = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
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
            const email = attributes.email;
            if (!email) {
                throw new Error('Email not found in user attributes');
            }
            const existingUser = await this.getUserByEmail(email);
            if (existingUser) {
                await this.updateLastLogin(existingUser.userId);
                return existingUser;
            }
            const newUser = new user_model_1.UserModel({
                email: email,
                name: attributes.name || '',
                userType: attributes['custom:userType'] || 'basic',
                status: user_model_1.UserStatus.ACTIVE
            });
            await this.dynamodb.send(new lib_dynamodb_1.PutCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
                Item: newUser.toDynamoDB()
            }));
            return newUser;
        }
        catch (error) {
            console.log('Error in getOrCreateUserRecord', { error });
            throw new errors_1.AuthenticationError('Failed to process user record: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserByEmail(email) {
        if (!email || email.trim() === '') {
            this.logger.warn('Empty email provided to getUserByEmail');
            return null;
        }
        try {
            const response = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
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
                const queryResponse = await this.dynamodb.send(new lib_dynamodb_1.QueryCommand({
                    TableName: `${process.env.RESOURCE_PREFIX}-users`,
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
            const response = await this.dynamodb.send(new lib_dynamodb_1.GetCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
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
            await this.dynamodb.send(new lib_dynamodb_1.UpdateCommand({
                TableName: `${process.env.RESOURCE_PREFIX}-users`,
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
}
exports.AuthenticationService = AuthenticationService;
//# sourceMappingURL=authentication.service.js.map