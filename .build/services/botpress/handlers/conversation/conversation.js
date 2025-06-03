"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const botpress_service_1 = require("@services/botpress/services/botpress/botpress.service");
const user_service_1 = require("@services/botpress/services/user/user.service");
const handler = async (event) => {
    console.info('Processing concierge conversation request', {
        path: event.path,
        method: event.httpMethod
    });
    const userSub = event.requestContext.authorizer?.userId;
    if (!userSub) {
        console.error('No userSub found in request');
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }
    const botpressService = botpress_service_1.BotpressService.getInstance();
    const userService = user_service_1.UserService.getInstance();
    console.info('Searching user by userSub', { userSub });
    const user = await userService.getUserByUserSub(userSub);
    if (!user) {
        console.error('User not found in database', { userSub });
        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'User not found',
                error: 'USER_NOT_FOUND'
            })
        };
    }
    const userBotpressKey = user.botpressUserKeyId;
    try {
        const path = event.path;
        const method = event.httpMethod;
        const pathParts = path.split('/');
        const conversationIdIndex = pathParts.findIndex(part => part === 'conversations') + 1;
        const conversationId = conversationIdIndex < pathParts.length ? pathParts[conversationIdIndex] : null;
        const action = conversationId && conversationIdIndex + 1 < pathParts.length ? pathParts[conversationIdIndex + 1] : null;
        if (method === 'GET' && !conversationId) {
            const activeConversation = await botpressService.getActiveConciergeConversation(userBotpressKey);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hasActiveConversation: !!activeConversation,
                    conversation: activeConversation
                })
            };
        }
        else if (method === 'POST' && !conversationId) {
            console.info('Verifying user exists and has Botpress key', { userBotpressKey });
            if (!user) {
                console.error('User not found in database', { userSub });
                return {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: 'User not found',
                        error: 'USER_NOT_FOUND'
                    })
                };
            }
            if (!userBotpressKey) {
                console.error('User does not have Botpress key', { userBotpressKey });
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: 'User is not configured for Botpress integration',
                        error: 'BOTPRESS_KEY_MISSING'
                    })
                };
            }
            console.info('User verified with Botpress key', {
                userBotpressKey,
                hasKey: !!userBotpressKey
            });
            const existingConversation = await botpressService.getActiveConciergeConversation(userBotpressKey);
            if (existingConversation) {
                console.info('Active conversation already exists', {
                    userBotpressKey,
                    conversationId: existingConversation.conversationId
                });
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: 'Active conversation already exists',
                        conversation: existingConversation
                    })
                };
            }
            console.info('Creating new concierge conversation', { userBotpressKey });
            const newConversation = await botpressService.createConciergeConversation(userBotpressKey);
            console.info('New concierge conversation created successfully', {
                userBotpressKey,
                conversationId: newConversation.conversationId
            });
            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'New concierge conversation created',
                    conversation: newConversation
                })
            };
        }
        else if (method === 'GET' && conversationId && !action) {
            const conversation = await botpressService.getConversationHistory(userBotpressKey, conversationId);
            if (!conversation) {
                return {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Conversation not found' })
                };
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conversation)
            };
        }
        else if (method === 'GET' && conversationId && action === 'messages') {
            const messages = await botpressService.getConversationMessages(userBotpressKey, conversationId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(messages)
            };
        }
        else if (method === 'POST' && conversationId && action === 'messages') {
            if (!event.body) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Request body is required' })
                };
            }
            const requestData = JSON.parse(event.body);
            if (!requestData.message) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: 'Message is required' })
                };
            }
            const response = await botpressService.sendMessage(userBotpressKey, requestData.message, conversationId, true);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response)
            };
        }
        else if (method === 'POST' && conversationId && action === 'session') {
            await botpressService.openSession(userBotpressKey, conversationId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Session opened successfully' })
            };
        }
        else if (method === 'DELETE' && conversationId && action === 'session') {
            await botpressService.closeSession(userBotpressKey, conversationId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Session closed successfully' })
            };
        }
        else {
            return {
                statusCode: 405,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Method not allowed' })
            };
        }
    }
    catch (error) {
        console.error('Error processing conversation request', { error });
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=conversation.js.map