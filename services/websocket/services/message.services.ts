// services/websocket/services/message.service.ts
import { Logger } from '@shared/utils/logger';
import { InternalServerError } from '@shared/utils/errors';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface MessagePayload {
  connectionId: string;
  userId: string;
  message: any;
  timestamp: string;
}

export class MessageService {
  private readonly queueUrl: string;
  private readonly logger: Logger;
  private readonly sqs: SQSClient;

  constructor() {
    this.queueUrl = process.env.MESSAGE_QUEUE_URL!;
    this.logger = new Logger('MessageService');
    this.sqs = new SQSClient({});
  }

  async processMessage(payload: MessagePayload): Promise<void> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: payload.userId, // Asegura ordenamiento por usuario
        MessageDeduplicationId: `${payload.timestamp}-${payload.connectionId}` // Previene duplicados
      });

      await this.sqs.send(command);

      this.logger.info('Message queued successfully', {
        connectionId: payload.connectionId,
        userId: payload.userId
      });
    } catch (error) {
      this.logger.error('Failed to process message', { error, payload });
      throw new InternalServerError('Failed to process message');
    }
  }
}