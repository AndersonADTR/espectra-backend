"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const botpress_service_1 = require("@services/botpress/services/botpress/botpress.service");
const handler = async (event) => {
    console.info('Processing conversation request', {
        path: event.path,
        method: event.httpMethod
    });
    const userId = event.requestContext.authorizer?.userId;
    if (!userId) {
        console.error('No user ID found in request');
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Unauthorized' })
        };
    }
    const botpressService = botpress_service_1.BotpressService.getInstance();
    try {
        const path = event.path;
        const method = event.httpMethod;
        const pathParts = path.split('/');
        const conversationIdIndex = pathParts.findIndex(part => part === 'conversations') + 1;
        const conversationId = conversationIdIndex < pathParts.length ? pathParts[conversationIdIndex] : null;
        if (method === 'GET' && !conversationId) {
            const conversations = await botpressService.listUserConversations(userId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conversations)
            };
        }
        else if (method === 'GET' && conversationId) {
            const conversation = await botpressService.getConversationHistory(userId, conversationId);
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
        else if (method === 'POST' && !conversationId) {
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
                    body: JSON.stringify({ message: 'Initial message is required' })
                };
            }
            const response = await botpressService.sendMessage(userId, requestData.message);
            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: response.conversationId,
                    messages: response.messages
                })
            };
        }
        else if (method === 'POST' && conversationId) {
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
            const response = await botpressService.sendMessage(userId, requestData.message, conversationId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: response.conversationId,
                    messages: response.messages
                })
            };
        }
        else if (method === 'DELETE' && conversationId) {
            return {
                statusCode: 501,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Not implemented' })
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
//# sourceMappingURL=conversation.handler.js.map