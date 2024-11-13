"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const handler = async (event) => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Spectra Backend!',
            input: event,
        }, null, 2),
    };
};
exports.handler = handler;
//# sourceMappingURL=hello.js.map