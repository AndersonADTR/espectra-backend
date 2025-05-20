export declare const WebSocketConfig: {
    PATH: string;
    PING_INTERVAL: number;
    PING_TIMEOUT: number;
    RECONNECT_INTERVAL: number;
    MAX_RECONNECT_ATTEMPTS: number;
    CONNECTION_TIMEOUT: number;
    ERROR_CODES: {
        readonly INVALID_MESSAGE: 4000;
        readonly AUTH_FAILED: 4001;
        readonly RATE_LIMIT: 4002;
        readonly INVALID_STATE: 4003;
        readonly SERVER_ERROR: 4500;
    };
    MESSAGE_TYPES: {
        readonly PING: "PING";
        readonly PONG: "PONG";
        readonly ERROR: "ERROR";
        readonly RECONNECT: "RECONNECT";
    };
};
export type WebSocketErrorCode = typeof WebSocketConfig.ERROR_CODES[keyof typeof WebSocketConfig.ERROR_CODES];
export type WebSocketSystemMessageType = typeof WebSocketConfig.MESSAGE_TYPES[keyof typeof WebSocketConfig.MESSAGE_TYPES];
//# sourceMappingURL=websocket.d.ts.map