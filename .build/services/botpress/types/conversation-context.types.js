"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationType = exports.ConversationStatus = void 0;
var ConversationStatus;
(function (ConversationStatus) {
    ConversationStatus["ACTIVE"] = "ACTIVE";
    ConversationStatus["INACTIVE"] = "INACTIVE";
    ConversationStatus["TERMINATED"] = "TERMINATED";
    ConversationStatus["PENDING_HANDOFF"] = "PENDING_HANDOFF";
    ConversationStatus["WITH_ADVISOR"] = "WITH_ADVISOR";
})(ConversationStatus || (exports.ConversationStatus = ConversationStatus = {}));
var ConversationType;
(function (ConversationType) {
    ConversationType["BOT"] = "BOT";
    ConversationType["ADVISOR"] = "ADVISOR";
    ConversationType["MIXED"] = "MIXED";
})(ConversationType || (exports.ConversationType = ConversationType = {}));
//# sourceMappingURL=conversation-context.types.js.map