"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactRequestModel = void 0;
const uuid_1 = require("uuid");
class ContactRequestModel {
    requestId;
    name;
    email;
    phoneNumber;
    status;
    createdAt;
    metadata;
    constructor(data) {
        this.requestId = (0, uuid_1.v4)();
        this.name = data.name;
        this.email = data.email;
        this.phoneNumber = data.phoneNumber;
        this.status = 'PENDING';
        this.createdAt = new Date().toISOString();
        this.metadata = data.metadata || {};
    }
    toGoogleSheetsRow() {
        return [
            this.requestId,
            this.name,
            this.email,
            this.phoneNumber,
            this.status,
            this.createdAt,
            JSON.stringify(this.metadata)
        ];
    }
    toJSON() {
        return {
            requestId: this.requestId,
            name: this.name,
            email: this.email,
            phoneNumber: this.phoneNumber,
            status: this.status,
            createdAt: this.createdAt,
            metadata: this.metadata
        };
    }
}
exports.ContactRequestModel = ContactRequestModel;
//# sourceMappingURL=contactRequest.model.js.map