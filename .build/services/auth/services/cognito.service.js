"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoService = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const crypto = __importStar(require("crypto"));
const node_http_handler_1 = require("@aws-sdk/node-http-handler");
const logger_1 = require("@shared/utils/logger");
const config_service_1 = require("@shared/config/config.service");
const errors_1 = require("@shared/utils/errors");
class CognitoService {
    client;
    logger;
    userPoolId;
    clientId;
    constructor() {
        this.logger = new logger_1.Logger('CognitoService');
        this.client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
            region: config_service_1.config.getRequired('AWS_REGION'),
            maxAttempts: 3,
            retryMode: "adaptive",
            requestHandler: new node_http_handler_1.NodeHttpHandler({
                connectionTimeout: 5000,
                socketTimeout: 5000
            })
        });
        this.userPoolId = config_service_1.config.getRequired('COGNITO_USER_POOL_ID');
        this.clientId = config_service_1.config.getRequired('COGNITO_CLIENT_ID');
        this.logger.info('CognitoService initialized', {
            userPoolId: this.userPoolId,
            clientId: this.clientId,
            region: config_service_1.config.getRequired('AWS_REGION')
        });
    }
    calculateSecretHash(username, clientId) {
        const clientSecret = process.env.COGNITO_CLIENT_SECRET;
        if (!clientSecret) {
            throw new Error('Client secret not found in environment variables');
        }
        const message = username + clientId;
        const hmac = crypto.createHmac('SHA256', clientSecret);
        return hmac.update(message).digest('base64');
    }
    async refreshUserTokens(userSub, refreshToken) {
        try {
            console.log('Starting token refresh cognito service', {
                cognitoSub: userSub,
                refreshToken: refreshToken
            });
            const secretHash = this.calculateSecretHash(userSub, this.clientId);
            console.log('Calculated secret hash', { secret: secretHash });
            const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.REFRESH_TOKEN_AUTH,
                ClientId: this.clientId,
                AuthParameters: {
                    REFRESH_TOKEN: refreshToken,
                    SECRET_HASH: secretHash,
                    USERNAME: userSub
                }
            });
            console.log('Sending refresh token command', { command });
            const response = await this.client.send(command);
            if (!response.AuthenticationResult) {
                throw new errors_1.AuthenticationError('Failed to refresh tokens: No authentication result');
            }
            console.log('Token refresh successful');
            return {
                accessToken: response.AuthenticationResult.AccessToken,
                idToken: response.AuthenticationResult.IdToken,
                refreshToken: response.AuthenticationResult.RefreshToken || refreshToken,
                expiresIn: response.AuthenticationResult.ExpiresIn || 3600
            };
        }
        catch (error) {
            console.log('Error refreshing user tokens', { error });
            if (error.name === 'NotAuthorizedException') {
                throw new errors_1.AuthenticationError('Invalid refresh token');
            }
            throw new errors_1.AuthenticationError('Failed to refresh tokens: ' + (error.message || 'Unknown error'));
        }
    }
    async registerUser(credentials) {
        try {
            console.log('Starting Cognito user registration', {
                email: credentials.email,
                userPoolId: this.userPoolId,
                clientId: this.clientId
            });
            const userAttributes = [
                { Name: 'email', Value: credentials.email },
                { Name: 'name', Value: credentials.name },
                { Name: 'phone_number', Value: credentials.phoneNumber },
                { Name: 'custom:language', Value: credentials.language }
            ];
            if (credentials.userType) {
                userAttributes.push({ Name: 'custom:userType', Value: credentials.userType });
            }
            const secretHash = this.calculateSecretHash(credentials.email, this.clientId);
            console.log('Calculated secret hash', { secret: secretHash });
            const command = new client_cognito_identity_provider_1.SignUpCommand({
                ClientId: this.clientId,
                Username: credentials.email,
                Password: credentials.password,
                UserAttributes: userAttributes,
                SecretHash: secretHash
            });
            console.log('Sending SignUp command to Cognito', {
                command: JSON.stringify(command, null, 2)
            });
            const startTime = Date.now();
            const user = await this.client.send(command);
            const duration = Date.now() - startTime;
            console.log('Cognito registration complete', {
                email: credentials.email,
                duration
            });
            return user.UserSub;
        }
        catch (error) {
            console.log('Error in Cognito registration', {
                error,
                email: credentials.email,
                errorName: error.name,
                errorMessage: error.message,
                stack: process.env.STAGE === 'dev' ? error.stack : undefined
            });
            throw error;
        }
    }
    async authenticateUser(credentials) {
        try {
            const normalizedEmail = credentials.email.toLowerCase().trim();
            console.log('CognitoService.authenticateUser called', {
                email: normalizedEmail,
                userPoolId: this.userPoolId,
                clientId: this.clientId,
                timestamp: new Date().toISOString()
            });
            try {
                console.log('Verifying user status in Cognito before authentication', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                console.log('User exists in Cognito, checking status', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
                if (userInfo.UserStatus === 'UNCONFIRMED') {
                    console.error('User is not confirmed in Cognito', { email: normalizedEmail });
                    throw new errors_1.AuthenticationError('User is not confirmed. Please verify your email before logging in.');
                }
            }
            catch (userError) {
                if (userError.name === 'UserNotFoundException') {
                    console.error('User not found in Cognito during pre-authentication check', { email: normalizedEmail });
                    throw new errors_1.AuthenticationError('User not found');
                }
                console.error('Error checking user status before authentication', {
                    error: userError,
                    errorName: userError instanceof Error ? userError.name : 'Unknown',
                    errorMessage: userError instanceof Error ? userError.message : String(userError),
                    email: normalizedEmail
                });
            }
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully for authentication', {
                email: normalizedEmail,
                secretHashLength: secretHash ? secretHash.length : 0
            });
            const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
                ClientId: this.clientId,
                AuthParameters: {
                    USERNAME: normalizedEmail,
                    PASSWORD: credentials.password,
                    SECRET_HASH: secretHash
                }
            });
            console.log('Sending InitiateAuthCommand to Cognito', {
                email: normalizedEmail,
                authFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
                clientId: this.clientId,
                hasSecretHash: !!secretHash
            });
            const response = await this.client.send(command);
            console.log('InitiateAuthCommand response received', {
                hasResponse: !!response,
                hasAuthResult: !!response.AuthenticationResult,
                hasChallenge: !!response.ChallengeName,
                challengeName: response.ChallengeName,
                timestamp: new Date().toISOString()
            });
            if (!response.AuthenticationResult) {
                console.error('No AuthenticationResult in response', {
                    email: normalizedEmail,
                    response: JSON.stringify(response),
                    challengeName: response.ChallengeName,
                    challengeParameters: response.ChallengeParameters
                });
                if (response.ChallengeName) {
                    console.log('Authentication challenge required', {
                        email: normalizedEmail,
                        challengeName: response.ChallengeName,
                        challengeParameters: response.ChallengeParameters
                    });
                    throw new errors_1.AuthenticationError(`Authentication challenge required: ${response.ChallengeName}`);
                }
                throw new errors_1.AuthenticationError('Authentication failed: No tokens received');
            }
            if (!response.AuthenticationResult.AccessToken ||
                !response.AuthenticationResult.IdToken ||
                !response.AuthenticationResult.RefreshToken) {
                console.error('Missing tokens in AuthenticationResult', {
                    email: normalizedEmail,
                    hasAccessToken: !!response.AuthenticationResult.AccessToken,
                    hasIdToken: !!response.AuthenticationResult.IdToken,
                    hasRefreshToken: !!response.AuthenticationResult.RefreshToken
                });
                throw new errors_1.AuthenticationError('Authentication failed: Incomplete tokens received');
            }
            const tokens = {
                accessToken: response.AuthenticationResult.AccessToken,
                refreshToken: response.AuthenticationResult.RefreshToken,
                idToken: response.AuthenticationResult.IdToken,
                expiresIn: response.AuthenticationResult.ExpiresIn || 3600
            };
            console.log('User authenticated successfully', {
                email: normalizedEmail,
                accessTokenLength: tokens.accessToken.length,
                idTokenLength: tokens.idToken.length,
                refreshTokenLength: tokens.refreshToken.length,
                expiresIn: tokens.expiresIn
            });
            return tokens;
        }
        catch (error) {
            console.error('Error authenticating user', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email: credentials.email
            });
            if (error instanceof Error) {
                switch (error.name) {
                    case 'NotAuthorizedException':
                        if (error.message.includes('not confirmed')) {
                            throw new errors_1.AuthenticationError('User is not confirmed. Please verify your email before logging in.');
                        }
                        throw new errors_1.AuthenticationError('Invalid credentials');
                    case 'UserNotFoundException':
                        throw new errors_1.AuthenticationError('User not found');
                    case 'UserNotConfirmedException':
                        throw new errors_1.AuthenticationError('User is not confirmed. Please verify your email before logging in.');
                    case 'PasswordResetRequiredException':
                        throw new errors_1.AuthenticationError('Password reset required. Please use the forgot password feature.');
                    case 'LimitExceededException':
                        throw new errors_1.AuthenticationError('Too many attempts. Please try again after some time.');
                    default:
                        throw new errors_1.AuthenticationError('Authentication failed: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Authentication failed: ' + (error.message || 'Unknown error'));
        }
    }
    async deleteUser(email) {
        try {
            const command = new client_cognito_identity_provider_1.AdminDeleteUserCommand({
                UserPoolId: this.userPoolId,
                Username: email
            });
            await this.client.send(command);
            this.logger.info('User deleted from Cognito', { email });
        }
        catch (error) {
            this.logger.error('Error deleting user from Cognito', { error, email });
            if (error.name === 'UserNotFoundException') {
                return;
            }
            throw new errors_1.AuthenticationError('Failed to delete user: ' + (error.message || 'Unknown error'));
        }
    }
    async confirmSignUp(email) {
        try {
            const command = new client_cognito_identity_provider_1.AdminConfirmSignUpCommand({
                UserPoolId: this.userPoolId,
                Username: email
            });
            await this.client.send(command);
            this.logger.info('User confirmed successfully', { email });
        }
        catch (error) {
            this.logger.error('Error confirming user', { error, email });
            throw new errors_1.AuthenticationError('Failed to confirm user: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserBySub(userSub) {
        try {
            const listUsersCommand = new client_cognito_identity_provider_1.ListUsersCommand({
                UserPoolId: this.userPoolId,
                Filter: `sub = "${userSub}"`,
                Limit: 1
            });
            const listResponse = await this.client.send(listUsersCommand);
            if (!listResponse.Users || listResponse.Users.length === 0) {
                throw new Error('User not found');
            }
            const username = listResponse.Users[0].Username;
            if (!username) {
                throw new Error('Username not found for the provided Sub');
            }
            const command = new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: this.userPoolId,
                Username: username
            });
            const response = await this.client.send(command);
            if (!response.UserAttributes) {
                throw new Error('No user attributes found');
            }
            const attributes = {};
            response.UserAttributes.forEach(attr => {
                if (attr.Name && attr.Value) {
                    attributes[attr.Name] = attr.Value;
                }
            });
            this.logger.info('User retrieved by Sub successfully', { userSub });
            return attributes;
        }
        catch (error) {
            this.logger.error('Error getting user from Cognito by Sub', { error, userSub });
            if (error.name === 'UserNotFoundException') {
                throw new errors_1.AuthenticationError('User not found');
            }
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async getUserByEmail(email) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            console.log('CognitoService.getUserByEmail called', {
                email: normalizedEmail,
                userPoolId: this.userPoolId,
                timestamp: new Date().toISOString()
            });
            const command = new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: this.userPoolId,
                Username: normalizedEmail
            });
            console.log('Sending AdminGetUserCommand to Cognito', {
                email: normalizedEmail,
                userPoolId: this.userPoolId
            });
            const response = await this.client.send(command);
            console.log('AdminGetUserCommand response received', {
                hasResponse: !!response,
                hasUserAttributes: !!response.UserAttributes,
                userStatus: response.UserStatus,
                enabled: response.Enabled,
                timestamp: new Date().toISOString()
            });
            const attributes = {
                UserStatus: response.UserStatus,
                Enabled: response.Enabled,
                UserCreateDate: response.UserCreateDate,
                UserLastModifiedDate: response.UserLastModifiedDate
            };
            if (response.UserAttributes) {
                response.UserAttributes.forEach(attr => {
                    if (attr.Name && attr.Value !== undefined) {
                        attributes[attr.Name] = attr.Value;
                    }
                });
            }
            else {
                console.warn('No user attributes found in response', {
                    email: normalizedEmail,
                    userStatus: response.UserStatus
                });
            }
            console.log('User retrieved successfully from Cognito', {
                email: normalizedEmail,
                userStatus: attributes.UserStatus,
                enabled: attributes.Enabled,
                sub: attributes.sub,
                emailVerified: attributes['email_verified']
            });
            return attributes;
        }
        catch (error) {
            console.error('Error getting user from Cognito', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            if (error.name === 'UserNotFoundException') {
                console.log('User not found in Cognito', { email });
                throw new errors_1.AuthenticationError('User not found');
            }
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async signOut(accessToken) {
        try {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH TEST: CognitoService.signOut called',
                accessTokenLength: accessToken ? accessToken.length : 0,
                accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            }));
            console.log('CognitoService.signOut called', {
                accessTokenLength: accessToken ? accessToken.length : 0,
                accessTokenFirstChars: accessToken ? accessToken.substring(0, 10) + '...' : 'null',
                timestamp: new Date().toISOString()
            });
            if (!accessToken) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH TEST: No access token provided for sign out',
                    timestamp: new Date().toISOString()
                }));
                console.error('No access token provided for sign out');
                throw new errors_1.AuthenticationError('No access token provided');
            }
            if (!accessToken.includes('.') || accessToken.split('.').length !== 3) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH TEST: Invalid token format',
                    accessTokenLength: accessToken.length,
                    accessTokenFirstChars: accessToken.substring(0, 10) + '...',
                    timestamp: new Date().toISOString()
                }));
                console.error('Invalid token format', {
                    accessTokenLength: accessToken.length,
                    accessTokenFirstChars: accessToken.substring(0, 10) + '...'
                });
                throw new errors_1.AuthenticationError('Invalid token format');
            }
            const command = new client_cognito_identity_provider_1.GlobalSignOutCommand({
                AccessToken: accessToken
            });
            console.log(JSON.stringify({
                message: 'CLOUDWATCH TEST: Sending GlobalSignOutCommand to Cognito',
                timestamp: new Date().toISOString()
            }));
            console.log('Sending GlobalSignOutCommand to Cognito');
            try {
                const response = await this.client.send(command);
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH TEST: GlobalSignOutCommand response received',
                    success: true,
                    responseType: typeof response,
                    hasResponse: !!response,
                    timestamp: new Date().toISOString()
                }));
                console.log('GlobalSignOutCommand response received', {
                    success: true,
                    responseType: typeof response,
                    hasResponse: !!response,
                    timestamp: new Date().toISOString()
                });
            }
            catch (signOutError) {
                console.log(JSON.stringify({
                    message: 'CLOUDWATCH TEST: Error from Cognito during sign out',
                    errorName: signOutError instanceof Error ? signOutError.name : 'Unknown',
                    errorMessage: signOutError instanceof Error ? signOutError.message : String(signOutError),
                    timestamp: new Date().toISOString()
                }));
                console.error('Error from Cognito during sign out', {
                    error: signOutError,
                    errorName: signOutError instanceof Error ? signOutError.name : 'Unknown',
                    errorMessage: signOutError instanceof Error ? signOutError.message : String(signOutError),
                    stack: signOutError instanceof Error ? signOutError.stack : 'No stack trace'
                });
                if (signOutError instanceof Error) {
                    if (signOutError.name === 'NotAuthorizedException') {
                        console.log(JSON.stringify({
                            message: 'CLOUDWATCH TEST: Invalid or expired access token',
                            timestamp: new Date().toISOString()
                        }));
                        throw new errors_1.AuthenticationError('Invalid or expired access token');
                    }
                    if (signOutError.name === 'InvalidParameterException') {
                        console.log(JSON.stringify({
                            message: 'CLOUDWATCH TEST: Invalid token parameter',
                            errorMessage: signOutError.message,
                            timestamp: new Date().toISOString()
                        }));
                        throw new errors_1.AuthenticationError('Invalid token parameter: ' + signOutError.message);
                    }
                    console.log(JSON.stringify({
                        message: 'CLOUDWATCH TEST: Failed to sign out',
                        errorMessage: signOutError.message,
                        timestamp: new Date().toISOString()
                    }));
                    throw new errors_1.AuthenticationError('Failed to sign out: ' + signOutError.message);
                }
                throw signOutError;
            }
            console.log(JSON.stringify({
                message: 'CLOUDWATCH TEST: User signed out successfully',
                timestamp: new Date().toISOString()
            }));
            this.logger.info('User signed out successfully');
            console.log('User signed out successfully');
        }
        catch (error) {
            console.log(JSON.stringify({
                message: 'CLOUDWATCH TEST: Error signing out user',
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                timestamp: new Date().toISOString()
            }));
            this.logger.error('Error signing out user', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            console.error('Error signing out user', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            throw error instanceof errors_1.AuthenticationError ? error : new errors_1.AuthenticationError('Failed to sign out: ' + (error.message || 'Unknown error'));
        }
    }
    async forgotPassword(email) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            console.log('CognitoService.forgotPassword called', {
                email: normalizedEmail,
                userPoolId: this.userPoolId,
                clientId: this.clientId,
                timestamp: new Date().toISOString()
            });
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully');
            let userStatus = 'UNKNOWN';
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                userStatus = userInfo.UserStatus || 'UNKNOWN';
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
                if (userStatus !== 'CONFIRMED') {
                    console.warn('User is not confirmed in Cognito, this may affect password reset', {
                        email: normalizedEmail,
                        userStatus
                    });
                    this.logger.warn('User is not confirmed in Cognito, this may affect password reset', {
                        email: normalizedEmail,
                        userStatus
                    });
                }
            }
            catch (userError) {
                if (userError.name === 'UserNotFoundException') {
                    console.log('User not found in Cognito, attempting to proceed anyway', { email: normalizedEmail });
                }
                else {
                    console.error('Error verifying user existence', {
                        error: userError,
                        errorName: userError instanceof Error ? userError.name : 'Unknown',
                        errorMessage: userError instanceof Error ? userError.message : String(userError),
                        email: normalizedEmail
                    });
                }
            }
            const command = new client_cognito_identity_provider_1.ForgotPasswordCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                SecretHash: secretHash
            });
            console.log('Sending ForgotPasswordCommand to Cognito', {
                clientId: this.clientId,
                username: normalizedEmail,
                timestamp: new Date().toISOString()
            });
            const response = await this.client.send(command);
            const deliveryDetails = response && response.CodeDeliveryDetails ? {
                destination: response.CodeDeliveryDetails.Destination,
                deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                attributeName: response.CodeDeliveryDetails.AttributeName
            } : { destination: 'unknown', deliveryMedium: 'unknown' };
            console.log('ForgotPasswordCommand response received', {
                success: true,
                timestamp: new Date().toISOString(),
                deliveryDetails
            });
            if (!response || !response.CodeDeliveryDetails) {
                console.warn('No code delivery details in Cognito response', {
                    email: normalizedEmail,
                    timestamp: new Date().toISOString()
                });
            }
            else {
                console.log('Code delivery details from Cognito', {
                    destination: response.CodeDeliveryDetails.Destination,
                    deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                    attributeName: response.CodeDeliveryDetails.AttributeName,
                    timestamp: new Date().toISOString()
                });
            }
            console.log('IMPORTANT: A password reset code has been sent. This code:');
            console.log('1. Is valid for a limited time (usually 1 hour)');
            console.log('2. Must be entered exactly as received (6 digits)');
            console.log('3. Should be used with the /auth/reset-password endpoint');
            console.log('4. Will replace any previously sent codes');
            this.logger.info('Password recovery code sent successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString(),
                deliveryDetails
            });
            console.log('Password recovery code sent successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString(),
                destination: deliveryDetails.destination,
                deliveryMedium: deliveryDetails.deliveryMedium
            });
            return deliveryDetails;
        }
        catch (error) {
            this.logger.error('Error sending password recovery code', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email
            });
            console.error('Detailed error sending password recovery code', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            if (error instanceof Error) {
                switch (error.name) {
                    case 'UserNotFoundException':
                        this.logger.info('Password recovery requested for non-existent user', { email });
                        console.log('Password recovery requested for non-existent user (handled silently)', { email });
                        return { destination: email, deliveryMedium: 'EMAIL' };
                    case 'LimitExceededException':
                        throw new errors_1.AuthenticationError('Too many attempts. Please wait a few minutes before requesting a new code.');
                    case 'InvalidParameterException':
                        if (error.message.includes('Password reset required')) {
                            throw new errors_1.AuthenticationError('This account requires a password reset through the AWS Console. Please contact support.');
                        }
                        throw new errors_1.AuthenticationError('Invalid parameters: ' + error.message);
                    case 'InvalidEmailRoleAccessPolicyException':
                    case 'EmailSendingException':
                        console.error('Email sending configuration issue', {
                            error,
                            message: error.message,
                            email
                        });
                        if (error.message.includes('not verified') ||
                            error.message.includes('identity') ||
                            error.message.includes('verification')) {
                            throw new errors_1.AuthenticationError('Email delivery configuration error: The sender email is not verified in SES. Please verify the email in the AWS SES console.');
                        }
                        throw new errors_1.AuthenticationError('Email delivery configuration error: ' + error.message);
                    default:
                        throw new errors_1.AuthenticationError('Failed to send password recovery code: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Failed to send password recovery code: ' + (error.message || 'Unknown error'));
        }
    }
    async confirmForgotPassword(email, confirmationCode, newPassword) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');
            console.log('CognitoService.confirmForgotPassword called', {
                email: normalizedEmail,
                codeLength: normalizedCode.length,
                codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                timestamp: new Date().toISOString()
            });
            if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
                console.warn('Confirmation code format may be invalid', {
                    email: normalizedEmail,
                    codeLength: normalizedCode.length,
                    isNumeric: /^\d+$/.test(normalizedCode),
                    timestamp: new Date().toISOString()
                });
                if (normalizedCode.length !== 6) {
                    throw new errors_1.AuthenticationError(`Invalid confirmation code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`);
                }
                if (!/^\d+$/.test(normalizedCode)) {
                    throw new errors_1.AuthenticationError('Invalid confirmation code format: Code must contain only digits.');
                }
            }
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            const command = new client_cognito_identity_provider_1.ConfirmForgotPasswordCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                ConfirmationCode: normalizedCode,
                Password: newPassword,
                SecretHash: secretHash
            });
            console.log('Sending ConfirmForgotPasswordCommand to Cognito', {
                email: normalizedEmail,
                timestamp: new Date().toISOString()
            });
            const response = await this.client.send(command);
            console.log('ConfirmForgotPasswordCommand response received successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString(),
                response: response
            });
            this.logger.info('Password reset completed successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            this.logger.error('Error confirming password reset', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error)
            });
            console.error('Detailed error confirming password reset', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                email,
                timestamp: new Date().toISOString()
            });
            if (error instanceof Error) {
                switch (error.name) {
                    case 'CodeMismatchException':
                        throw new errors_1.AuthenticationError('The confirmation code is incorrect. Please check the code and try again.');
                    case 'ExpiredCodeException':
                        throw new errors_1.AuthenticationError('The confirmation code has expired. Please request a new code using the forgot password feature.');
                    case 'InvalidParameterException':
                        if (error.message.includes('password') || error.message.includes('Password')) {
                            throw new errors_1.AuthenticationError('The password does not meet the requirements: ' + error.message);
                        }
                        throw new errors_1.AuthenticationError('Invalid parameters: ' + error.message);
                    case 'LimitExceededException':
                        throw new errors_1.AuthenticationError('Too many attempts. Please wait a few minutes before trying again.');
                    case 'UserNotFoundException':
                        throw new errors_1.AuthenticationError('User not found. Please check your email address and try again.');
                    case 'NotAuthorizedException':
                        throw new errors_1.AuthenticationError('Not authorized: ' + error.message);
                    default:
                        throw new errors_1.AuthenticationError('Failed to reset password: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Failed to reset password: ' + (error.message || 'Unknown error'));
        }
    }
    async confirmSignUpWithCode(email, confirmationCode) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const normalizedCode = confirmationCode.trim().replace(/\s+/g, '');
            console.log('CognitoService.confirmSignUpWithCode called', {
                email: normalizedEmail,
                codeLength: normalizedCode.length,
                codeMasked: normalizedCode.substring(0, 2) + '****' + normalizedCode.substring(normalizedCode.length - 2),
                userPoolId: this.userPoolId,
                clientId: this.clientId,
                timestamp: new Date().toISOString()
            });
            if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
                console.warn('Confirmation code format may be invalid', {
                    email: normalizedEmail,
                    codeLength: normalizedCode.length,
                    isNumeric: /^\d+$/.test(normalizedCode),
                    code: normalizedCode
                });
                if (normalizedCode.length !== 6) {
                    throw new errors_1.AuthenticationError(`Invalid verification code format: Code must be 6 digits. Received code with ${normalizedCode.length} characters.`);
                }
                if (!/^\d+$/.test(normalizedCode)) {
                    throw new errors_1.AuthenticationError('Invalid verification code format: Code must contain only digits.');
                }
            }
            let userStatus = 'UNKNOWN';
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                userStatus = userInfo.UserStatus || 'UNKNOWN';
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
                if (userStatus === 'CONFIRMED') {
                    console.log('User is already confirmed', { email: normalizedEmail });
                    this.logger.info('User is already confirmed', { email: normalizedEmail });
                    return;
                }
            }
            catch (userError) {
                console.error('Error verifying user existence', {
                    error: userError,
                    errorName: userError instanceof Error ? userError.name : 'Unknown',
                    errorMessage: userError instanceof Error ? userError.message : String(userError),
                    email: normalizedEmail
                });
                if (userError.name === 'UserNotFoundException') {
                    throw new errors_1.AuthenticationError('User not found. Please register first.');
                }
            }
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully');
            console.log('Creating ConfirmSignUpCommand', {
                clientId: this.clientId,
                username: normalizedEmail,
                confirmationCodeLength: normalizedCode.length,
                hasSecretHash: !!secretHash,
                userStatus
            });
            const command = new client_cognito_identity_provider_1.ConfirmSignUpCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                ConfirmationCode: normalizedCode,
                SecretHash: secretHash
            });
            console.log('Sending ConfirmSignUpCommand to Cognito');
            await this.client.send(command);
            console.log('ConfirmSignUpCommand response received successfully');
            this.logger.info('Email verification completed successfully', { email: normalizedEmail });
        }
        catch (error) {
            console.error('Error confirming email verification', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            this.logger.error('Error confirming email verification', { error, email });
            if (error instanceof Error) {
                switch (error.name) {
                    case 'CodeMismatchException':
                        console.log('Code mismatch error details', {
                            email,
                            errorMessage: error.message,
                            timestamp: new Date().toISOString()
                        });
                        throw new errors_1.AuthenticationError('The verification code is incorrect. Please check the code and try again, or request a new code.');
                    case 'ExpiredCodeException':
                        console.log('Code expired error details', {
                            email,
                            errorMessage: error.message,
                            timestamp: new Date().toISOString()
                        });
                        throw new errors_1.AuthenticationError('The verification code has expired. Please request a new code using the /auth/resend-verification-code endpoint.');
                    case 'NotAuthorizedException':
                        if (error.message.includes('already been confirmed')) {
                            console.log('User already confirmed', {
                                email,
                                errorMessage: error.message,
                                timestamp: new Date().toISOString()
                            });
                            return;
                        }
                        throw new errors_1.AuthenticationError('Authorization error: ' + error.message);
                    case 'UserNotFoundException':
                        throw new errors_1.AuthenticationError('User not found. Please register first.');
                    case 'LimitExceededException':
                        throw new errors_1.AuthenticationError('Too many attempts. Please wait a few minutes before trying again.');
                    default:
                        throw new errors_1.AuthenticationError('Failed to verify email: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Failed to verify email: ' + (error.message || 'Unknown error'));
        }
    }
    async resendConfirmationCode(email) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            console.log('CognitoService.resendConfirmationCode called', {
                email: normalizedEmail,
                userPoolId: this.userPoolId,
                clientId: this.clientId,
                timestamp: new Date().toISOString()
            });
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully');
            let userStatus = 'UNKNOWN';
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                userStatus = userInfo.UserStatus || 'UNKNOWN';
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
                if (userStatus === 'CONFIRMED') {
                    console.log('User is already confirmed, no need to resend code', { email: normalizedEmail });
                    this.logger.info('User is already confirmed, no need to resend code', { email: normalizedEmail });
                    return {
                        destination: normalizedEmail,
                        deliveryMedium: 'EMAIL',
                        userStatus: 'CONFIRMED'
                    };
                }
            }
            catch (userError) {
                if (userError.name === 'UserNotFoundException') {
                    console.log('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });
                    this.logger.info('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });
                    throw new errors_1.AuthenticationError('User not found. Please register first.');
                }
                else {
                    console.error('Error verifying user existence', {
                        error: userError,
                        errorName: userError instanceof Error ? userError.name : 'Unknown',
                        errorMessage: userError instanceof Error ? userError.message : String(userError),
                        email: normalizedEmail
                    });
                }
            }
            console.log('Creating ResendConfirmationCodeCommand', {
                clientId: this.clientId,
                username: normalizedEmail,
                hasSecretHash: !!secretHash,
                userStatus
            });
            const command = new client_cognito_identity_provider_1.ResendConfirmationCodeCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                SecretHash: secretHash,
                ClientMetadata: {
                    'PreferredMfa': 'EMAIL'
                }
            });
            console.log('Sending ResendConfirmationCodeCommand to Cognito');
            const response = await this.client.send(command);
            const deliveryDetails = response && response.CodeDeliveryDetails ? {
                destination: response.CodeDeliveryDetails.Destination,
                deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                attributeName: response.CodeDeliveryDetails.AttributeName
            } : { destination: 'unknown', deliveryMedium: 'unknown' };
            console.log('ResendConfirmationCodeCommand response received', {
                success: true,
                responseType: typeof response,
                hasResponse: !!response,
                timestamp: new Date().toISOString(),
                deliveryDetails
            });
            this.logger.info('Confirmation code resent successfully', {
                email: normalizedEmail,
                deliveryDetails
            });
            console.log('IMPORTANT: A new verification code has been sent. This code:');
            console.log('1. Is valid for a limited time (usually 24 hours)');
            console.log('2. Must be entered exactly as received (6 digits)');
            console.log('3. Should be used with the /auth/verify-email endpoint');
            console.log('4. Will replace any previously sent codes');
            return {
                destination: deliveryDetails.destination,
                deliveryMedium: deliveryDetails.deliveryMedium
            };
        }
        catch (error) {
            console.error('Error resending confirmation code', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            this.logger.error('Error resending confirmation code', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            if (error instanceof Error) {
                switch (error.name) {
                    case 'UserNotFoundException':
                        throw new errors_1.AuthenticationError('User not found. Please register first.');
                    case 'LimitExceededException':
                        throw new errors_1.AuthenticationError('Too many attempts. Please wait a few minutes before requesting a new code.');
                    case 'InvalidParameterException':
                        throw new errors_1.AuthenticationError('Invalid parameters: ' + error.message);
                    case 'NotAuthorizedException':
                        if (error.message.includes('already been confirmed')) {
                            return {
                                destination: email,
                                deliveryMedium: 'EMAIL',
                                userStatus: 'CONFIRMED'
                            };
                        }
                        throw new errors_1.AuthenticationError('Authorization error: ' + error.message);
                    default:
                        throw new errors_1.AuthenticationError('Failed to resend confirmation code: ' + (error.message || 'Unknown error'));
                }
            }
            throw new errors_1.AuthenticationError('Failed to resend confirmation code: ' + (error.message || 'Unknown error'));
        }
    }
}
exports.CognitoService = CognitoService;
//# sourceMappingURL=cognito.service.js.map