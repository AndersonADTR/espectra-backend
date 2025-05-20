"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connection = void 0;
class Connection {
    connectionId;
    userId;
    timestamp;
    status;
    metadata;
    ttl;
    constructor(data) {
        this.connectionId = data.connectionId;
        this.userId = data.userId;
        this.timestamp = data.timestamp;
        this.status = data.status;
        this.metadata = data.metadata;
        this.ttl = this.calculateTTL();
    }
    static create(data) {
        return new Connection(data);
    }
    static createFromRequest(connectionId, userId, metadata) {
        const now = new Date().toISOString();
        return new Connection({
            connectionId,
            userId,
            timestamp: now,
            status: 'CONNECTED',
            metadata: {
                userAgent: metadata?.['User-Agent'] || 'Unknown',
                platform: metadata?.platform || 'Unknown',
                createdAt: now,
                lastActivity: now
            }
        });
    }
    updateStatus(status) {
        this.status = status;
        this.timestamp = new Date().toISOString();
        this.updateLastActivity();
    }
    updateLastActivity() {
        if (this.metadata) {
            this.metadata.lastActivity = new Date().toISOString();
        }
    }
    isActive() {
        return this.status === 'CONNECTED' || this.status === 'IN_PROGRESS';
    }
    calculateTTL() {
        return Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    }
}
exports.Connection = Connection;
//# sourceMappingURL=connection.js.map