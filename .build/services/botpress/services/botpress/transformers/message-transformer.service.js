"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotpressMessageTransformer = void 0;
const logger_1 = require("@shared/utils/logger");
class BotpressMessageTransformer {
    logger;
    constructor() {
        this.logger = new logger_1.Logger('BotpressMessageTransformer');
    }
    toBotpressFormat(message) {
        try {
            if (typeof message === 'string') {
                return {
                    type: 'text',
                    payload: {
                        text: message
                    }
                };
            }
            if (message.type) {
                switch (message.type) {
                    case 'text':
                        return {
                            type: 'text',
                            payload: {
                                text: message.content
                            },
                            metadata: message.metadata
                        };
                    case 'image':
                        return {
                            type: 'image',
                            payload: {
                                url: message.content
                            },
                            metadata: message.metadata
                        };
                    case 'card':
                        try {
                            const cardData = JSON.parse(message.content);
                            return {
                                type: 'card',
                                payload: cardData,
                                metadata: message.metadata
                            };
                        }
                        catch (e) {
                            this.logger.error('Invalid card format', { error: e, content: message.content });
                            return {
                                type: 'text',
                                payload: {
                                    text: message.content
                                }
                            };
                        }
                    default:
                        return {
                            type: message.type,
                            payload: {
                                content: message.content
                            },
                            metadata: message.metadata
                        };
                }
            }
            return {
                type: 'text',
                payload: {
                    text: JSON.stringify(message)
                }
            };
        }
        catch (error) {
            this.logger.error('Error transforming message to Botpress format', { error, message });
            return {
                type: 'text',
                payload: {
                    text: typeof message === 'string' ? message : 'Error processing message'
                }
            };
        }
    }
    fromBotpressFormat(message) {
        try {
            switch (message.type) {
                case 'text':
                    return {
                        type: 'text',
                        content: message.payload.text || '',
                        metadata: message.metadata
                    };
                case 'image':
                    return {
                        type: 'image',
                        content: message.payload.url || message.payload.image || '',
                        metadata: message.metadata
                    };
                case 'card':
                    return {
                        type: 'card',
                        content: JSON.stringify(message.payload),
                        metadata: message.metadata
                    };
                case 'carousel':
                    return {
                        type: 'carousel',
                        content: JSON.stringify(message.payload),
                        metadata: message.metadata
                    };
                default:
                    return {
                        type: message.type,
                        content: JSON.stringify(message.payload),
                        metadata: message.metadata
                    };
            }
        }
        catch (error) {
            this.logger.error('Error transforming message from Botpress format', { error, message });
            return {
                type: 'text',
                content: 'Error processing message from bot'
            };
        }
    }
    estimateTokenCount(message) {
        try {
            let text = '';
            if (typeof message === 'string') {
                text = message;
            }
            else if ('content' in message) {
                text = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
            }
            else if ('payload' in message && message.payload.text) {
                text = message.payload.text;
            }
            else {
                text = JSON.stringify(message);
            }
            return Math.ceil(text.length / 4);
        }
        catch (error) {
            this.logger.error('Error estimating token count', { error, message });
            return 10;
        }
    }
}
exports.BotpressMessageTransformer = BotpressMessageTransformer;
//# sourceMappingURL=message-transformer.service.js.map