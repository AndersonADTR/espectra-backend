// services/botpress/services/queue/message-queue-processor.ts

import { SQSHandler } from 'aws-lambda';
import { MessageQueueService } from './message-queue.service';
import { BotpressChatService } from '../chat/botpress-chat.service';
import { RetryHandlerService } from '../retry/retry-handler.service';
import { BaseService } from '../base/base.service';

export class MessageQueueProcessor extends BaseService {
  private readonly queueService: MessageQueueService;
  private readonly chatService: BotpressChatService;
  private readonly retryHandler: RetryHandlerService;

  constructor() {
    super('MessageQueueProcessor');
    this.queueService = new MessageQueueService();
    this.chatService = new BotpressChatService();
    this.retryHandler = new RetryHandlerService();
  }

/**
 * Processes incoming messages from the SQS queue.
 * 
 * @param event - The SQS event containing the records to be processed.
 * 
 * The function iterates over each record in the event, parses the message body,
 * and attempts to send the message using the chat service. It employs a retry
 * mechanism to handle transient failures. On successful message processing, the
 * message is deleted from the queue. If the message processing fails after all
 * retries, the message is moved to a dead-letter queue with error metadata.
 * 
 * Metrics are incremented for each successfully processed message.
 * 
 * @throws Will call `handleError` if there is an error processing the message.
 */
  public processMessage: SQSHandler = async (event) => {
    for (const record of event.Records) {
      try {
        const message = JSON.parse(record.body);
        
        await this.retryHandler.withRetry({
          execute: async () => {
            const response = await this.chatService.sendMessage({
              conversationId: message.conversationId,
              message: message.content,
              userId: message.userId,
              metadata: message.metadata
            });

            return response;
          },
          onSuccess: async () => {
            await this.queueService.deleteMessage(record.receiptHandle);
          },
          onFinalFailure: async (error) => {
            await this.queueService.moveToDeadLetter({
              id: message.id,
              type: message.type,
              payload: message,
              metadata: {
                  error: error.message,
                  timestamp: new Date().toISOString(),
                  userId: message.userId
              }
            }, error);
          }
        });

        this.metrics.incrementCounter('ProcessedMessages');
      } catch (error) {
        this.handleError(error, 'Failed to process message from queue', {
          messageId: record.messageId
        });
      }
    }
  };
}

// Handler para Lambda
export const handler: SQSHandler = async (event, context, callback) => {
  const processor = new MessageQueueProcessor();
  await processor.processMessage(event, context, callback);
};