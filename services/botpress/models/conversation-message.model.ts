// services/botpress/models/conversation-message.model.ts

import { v4 as uuidv4 } from 'uuid';

export enum MessageRole {
  USER = 'user',
  BOT = 'bot',
  SYSTEM = 'system'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  AUDIO = 'audio',
  VIDEO = 'video',
  LOCATION = 'location',
  QUICK_REPLY = 'quick_reply',
  CARD = 'card',
  CAROUSEL = 'carousel'
}

export interface ConversationMessageData {
  messageId?: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  botpressMessageId?: string; // ID del mensaje en Botpress si aplica
  isRead?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export class ConversationMessageModel {
  messageId: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  timestamp: number;
  metadata: Record<string, any>;
  botpressMessageId?: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;

  constructor(data: ConversationMessageData) {
    this.messageId = data.messageId || uuidv4();
    this.conversationId = data.conversationId;
    this.userId = data.userId;
    this.role = data.role;
    this.type = data.type || MessageType.TEXT;
    this.content = data.content;
    this.timestamp = data.timestamp || Date.now();
    this.metadata = data.metadata || {};
    this.botpressMessageId = data.botpressMessageId;
    this.isRead = data.isRead || false;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Convierte el modelo a formato JSON
   */
  toJSON(): Record<string, any> {
    return {
      messageId: this.messageId,
      conversationId: this.conversationId,
      userId: this.userId,
      role: this.role,
      type: this.type,
      content: this.content,
      timestamp: this.timestamp,
      metadata: this.metadata,
      botpressMessageId: this.botpressMessageId,
      isRead: this.isRead,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Convierte el modelo a formato DynamoDB
   */
  toDynamoDB(): Record<string, any> {
    return {
      ...this.toJSON(),
      pk: `MESSAGE#${this.messageId}`,
      sk: `CONV#${this.conversationId}#${this.timestamp}`,
      gsi1pk: `CONV#${this.conversationId}`,
      gsi1sk: `TIME#${this.timestamp}`,
      gsi2pk: `USER#${this.userId}`,
      gsi2sk: `TIME#${this.timestamp}`,
      entityType: 'CONVERSATION_MESSAGE'
    };
  }

  /**
   * Crea una instancia desde datos de DynamoDB
   */
  static fromDynamoDB(item: Record<string, any>): ConversationMessageModel {
    return new ConversationMessageModel({
      messageId: item.messageId,
      conversationId: item.conversationId,
      userId: item.userId,
      role: item.role,
      type: item.type,
      content: item.content,
      timestamp: item.timestamp,
      metadata: item.metadata,
      botpressMessageId: item.botpressMessageId,
      isRead: item.isRead,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    });
  }

  /**
   * Actualiza el timestamp de modificación
   */
  touch(): void {
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Marca el mensaje como leído
   */
  markAsRead(): void {
    this.isRead = true;
    this.touch();
  }
}

export interface PaginatedMessages {
  messages: ConversationMessageModel[];
  pagination: {
    nextToken?: string;
    hasMore: boolean;
    total?: number;
    pageSize: number;
  };
}
