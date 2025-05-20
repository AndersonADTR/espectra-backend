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
            const secretHash = this.calculateSecretHash(credentials.email, this.clientId);
            console.log('Calculated secret hash', { secret: secretHash });
            const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
                AuthFlow: client_cognito_identity_provider_1.AuthFlowType.USER_PASSWORD_AUTH,
                ClientId: this.clientId,
                AuthParameters: {
                    USERNAME: credentials.email,
                    PASSWORD: credentials.password,
                    SECRET_HASH: secretHash
                }
            });
            const response = await this.client.send(command);
            if (!response.AuthenticationResult) {
                throw new errors_1.AuthenticationError('Authentication failed: No tokens received');
            }
            const tokens = {
                accessToken: response.AuthenticationResult.AccessToken,
                refreshToken: response.AuthenticationResult.RefreshToken,
                idToken: response.AuthenticationResult.IdToken,
                expiresIn: response.AuthenticationResult.ExpiresIn || 3600
            };
            console.log('User authenticated successfully', {
                email: credentials.email
            });
            return tokens;
        }
        catch (error) {
            console.log('Error authenticating user', {
                error,
                email: credentials.email
            });
            if (error.name === 'NotAuthorizedException') {
                throw new errors_1.AuthenticationError('Invalid credentials');
            }
            if (error.name === 'UserNotFoundException') {
                throw new errors_1.AuthenticationError('User not found');
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
            const command = new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: this.userPoolId,
                Username: email
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
            return attributes;
        }
        catch (error) {
            console.log('Error getting user from Cognito', { error, email });
            if (error.name === 'UserNotFoundException') {
                throw new errors_1.AuthenticationError('User not found');
            }
            throw new errors_1.AuthenticationError('Failed to get user: ' + (error.message || 'Unknown error'));
        }
    }
    async signOut(accessToken) {
        try {
            const command = new client_cognito_identity_provider_1.GlobalSignOutCommand({
                AccessToken: accessToken
            });
            await this.client.send(command);
            this.logger.info('User signed out successfully');
        }
        catch (error) {
            this.logger.error('Error signing out user', { error });
            throw new errors_1.AuthenticationError('Failed to sign out: ' + (error.message || 'Unknown error'));
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
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
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
            console.log('Sending ForgotPasswordCommand to Cognito');
            const response = await this.client.send(command);
            console.log('ForgotPasswordCommand response received', {
                success: true,
                responseType: typeof response,
                hasResponse: !!response,
                timestamp: new Date().toISOString(),
                deliveryDetails: response.CodeDeliveryDetails ? {
                    destination: response.CodeDeliveryDetails.Destination,
                    deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                    attributeName: response.CodeDeliveryDetails.AttributeName
                } : 'No delivery details'
            });
            this.logger.info('Password recovery code sent successfully', {
                email: normalizedEmail,
                timestamp: new Date().toISOString(),
                deliveryDetails: response.CodeDeliveryDetails ? {
                    destination: response.CodeDeliveryDetails.Destination,
                    deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                    attributeName: response.CodeDeliveryDetails.AttributeName
                } : 'No delivery details'
            });
            console.log('Password recovery code sent successfully', { email: normalizedEmail, timestamp: new Date().toISOString() });
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
            if (error instanceof Error && error.name === 'UserNotFoundException') {
                this.logger.info('Password recovery requested for non-existent user', { email });
                console.log('Password recovery requested for non-existent user (handled silently)', { email });
                return;
            }
            if (error instanceof Error &&
                (error.name === 'InvalidParameterException' ||
                    error.name === 'InvalidEmailRoleAccessPolicyException' ||
                    error.message.includes('email'))) {
                console.error('Possible SES configuration issue', {
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
                userPoolId: this.userPoolId,
                clientId: this.clientId
            });
            if (normalizedCode.length !== 6 || !/^\d+$/.test(normalizedCode)) {
                console.warn('Confirmation code format may be invalid', {
                    email: normalizedEmail,
                    codeLength: normalizedCode.length,
                    isNumeric: /^\d+$/.test(normalizedCode)
                });
            }
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully');
            const command = new client_cognito_identity_provider_1.ConfirmForgotPasswordCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                ConfirmationCode: normalizedCode,
                Password: newPassword,
                SecretHash: secretHash
            });
            console.log('Sending ConfirmForgotPasswordCommand to Cognito');
            await this.client.send(command);
            console.log('ConfirmForgotPasswordCommand response received successfully');
            this.logger.info('Password reset completed successfully', { email: normalizedEmail });
        }
        catch (error) {
            this.logger.error('Error confirming password reset', {
                error,
                email,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            console.error('Detailed error confirming password reset', {
                error,
                errorName: error instanceof Error ? error.name : 'Unknown',
                errorMessage: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace',
                email
            });
            if (error instanceof Error &&
                (error.name === 'ExpiredCodeException' ||
                    error.message.includes('Invalid code provided'))) {
                try {
                    const userInfo = await this.getUserByEmail(email);
                    console.log('User info retrieved for debugging expired code issue', {
                        email,
                        userStatus: userInfo.UserStatus,
                        userCreatedAt: userInfo.UserCreateDate,
                        userLastModified: userInfo.UserLastModifiedDate
                    });
                }
                catch (userError) {
                    console.error('Failed to retrieve user info for debugging', {
                        email,
                        error: userError
                    });
                }
            }
            throw error;
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
            }
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
            }
            catch (userError) {
                console.error('Error verifying user existence', {
                    error: userError,
                    errorName: userError instanceof Error ? userError.name : 'Unknown',
                    errorMessage: userError instanceof Error ? userError.message : String(userError),
                    email: normalizedEmail
                });
            }
            const secretHash = this.calculateSecretHash(normalizedEmail, this.clientId);
            console.log('SECRET_HASH generated successfully');
            console.log('Creating ConfirmSignUpCommand', {
                clientId: this.clientId,
                username: normalizedEmail,
                confirmationCodeLength: normalizedCode.length,
                hasSecretHash: !!secretHash
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
            if (error instanceof Error && error.name === 'CodeMismatchException') {
                console.log('Code mismatch error details', {
                    email,
                    errorMessage: error.message,
                    timestamp: new Date().toISOString()
                });
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
            try {
                console.log('Verifying if user exists in Cognito', { email: normalizedEmail });
                const userInfo = await this.getUserByEmail(normalizedEmail);
                console.log('User exists in Cognito', {
                    email: normalizedEmail,
                    userStatus: userInfo.UserStatus,
                    userCreatedAt: userInfo.UserCreateDate,
                    userLastModified: userInfo.UserLastModifiedDate
                });
            }
            catch (userError) {
                if (userError.name === 'UserNotFoundException') {
                    console.log('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });
                    this.logger.info('User not found in Cognito, cannot resend verification code', { email: normalizedEmail });
                    return;
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
                hasSecretHash: !!secretHash
            });
            const command = new client_cognito_identity_provider_1.ResendConfirmationCodeCommand({
                ClientId: this.clientId,
                Username: normalizedEmail,
                SecretHash: secretHash
            });
            console.log('Sending ResendConfirmationCodeCommand to Cognito');
            const response = await this.client.send(command);
            console.log('ResendConfirmationCodeCommand response received', {
                success: true,
                responseType: typeof response,
                hasResponse: !!response,
                timestamp: new Date().toISOString(),
                deliveryDetails: response && response.CodeDeliveryDetails ? {
                    destination: response.CodeDeliveryDetails.Destination,
                    deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                    attributeName: response.CodeDeliveryDetails.AttributeName
                } : 'No delivery details'
            });
            this.logger.info('Confirmation code resent successfully', {
                email: normalizedEmail,
                deliveryDetails: response && response.CodeDeliveryDetails ? {
                    destination: response.CodeDeliveryDetails.Destination,
                    deliveryMedium: response.CodeDeliveryDetails.DeliveryMedium,
                    attributeName: response.CodeDeliveryDetails.AttributeName
                } : 'No delivery details'
            });
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
            if (error.name === 'UserNotFoundException') {
                this.logger.info('Confirmation code requested for non-existent user', { email });
                return;
            }
            throw new errors_1.AuthenticationError('Failed to resend confirmation code: ' + (error.message || 'Unknown error'));
        }
    }
}
exports.CognitoService = CognitoService;
//# sourceMappingURL=cognito.service.js.map