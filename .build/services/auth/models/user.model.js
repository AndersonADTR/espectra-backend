"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatus = exports.UserModel = void 0;
class UserModel {
    userId;
    userSub;
    email;
    name;
    botpressUserKeyId;
    phoneNumber;
    userType;
    language;
    createdAt;
    lastLogin;
    updatedAt;
    status;
    preferences;
    metadata;
    constructor(data) {
        this.userId = data.userId || '';
        this.userSub = data.userSub || '';
        this.email = data.email || '';
        this.name = data.name || '';
        this.botpressUserKeyId = data.botpressUserKeyId || '';
        this.phoneNumber = data.phoneNumber || '';
        this.userType = data.userType || 'basic';
        this.language = data.language || 'es';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.lastLogin = data.lastLogin;
        this.updatedAt = data.updatedAt;
        this.status = data.status || UserStatus.ACTIVE;
        this.preferences = data.preferences || {};
        this.metadata = data.metadata || {};
    }
    toJSON() {
        return {
            userId: this.userId,
            userSub: this.userSub,
            email: this.email,
            name: this.name,
            botpressUserKeyId: this.botpressUserKeyId,
            phoneNumber: this.phoneNumber,
            userType: this.userType,
            language: this.language,
            createdAt: this.createdAt,
            lastLogin: this.lastLogin,
            updatedAt: this.updatedAt,
            status: this.status,
            preferences: this.preferences,
            metadata: this.metadata
        };
    }
    static fromDynamoDB(item) {
        return new UserModel({
            userId: item.userId,
            userSub: item.userSub,
            email: item.email,
            name: item.name,
            botpressUserKeyId: item.botpressUserKeyId,
            phoneNumber: item.phoneNumber,
            userType: item.userType,
            language: item.language,
            createdAt: item.createdAt,
            lastLogin: item.lastLogin,
            updatedAt: item.updatedAt,
            status: item.status,
            preferences: item.preferences,
            metadata: item.metadata
        });
    }
    toDynamoDB() {
        return {
            ...this.toJSON(),
            pk: `USER#${this.userId}`,
            sk: `PROFILE#${this.email}`,
            gsi1pk: `EMAIL#${this.email}`,
            gsi1sk: `USER#${this.userId}`,
            entityType: 'USER'
        };
    }
}
exports.UserModel = UserModel;
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "ACTIVE";
    UserStatus["INACTIVE"] = "INACTIVE";
    UserStatus["SUSPENDED"] = "SUSPENDED";
    UserStatus["PENDING_VERIFICATION"] = "PENDING_VERIFICATION";
    UserStatus["PENDING_PASSWORD_RESET"] = "PENDING_PASSWORD_RESET";
    UserStatus["DELETED"] = "DELETED";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
//# sourceMappingURL=user.model.js.map