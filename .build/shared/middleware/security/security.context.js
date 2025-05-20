"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityContextManager = void 0;
const async_hooks_1 = require("async_hooks");
class SecurityContextManager {
    static instance;
    storage;
    constructor() {
        this.storage = new async_hooks_1.AsyncLocalStorage();
    }
    static getInstance() {
        if (!SecurityContextManager.instance) {
            SecurityContextManager.instance = new SecurityContextManager();
        }
        return SecurityContextManager.instance;
    }
    getContext() {
        return this.storage.getStore();
    }
    run(context, callback) {
        return this.storage.run(context, callback);
    }
    updateContext(partialContext) {
        const currentContext = this.getContext();
        if (currentContext) {
            Object.assign(currentContext, partialContext);
        }
    }
}
exports.SecurityContextManager = SecurityContextManager;
//# sourceMappingURL=security.context.js.map