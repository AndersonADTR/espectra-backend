// services/botpress/services/queue/message-queue.service.ts

import { GetQueueAttributesCommandOutput, SQS } from '@aws-sdk/client-sqs';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressError } from '../../utils/errors';

interface QueueMessage {
  id: string;
  type: 'message' | 'handoff' | 'system';
  payload: any;
  metadata: {
    userId: string;
    timestamp: string;
    retryCount?: number;
    priority?: 'high' | 'normal' | 'low';
    [key: string]: any;
  };
}

export class MessageQueueService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly sqs: SQS;
  private readonly queueUrl: string;
  private readonly dlqUrl: string;

  constructor() {
    this.logger = new Logger('MessageQueueService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.sqs = new SQS({});
    this.queueUrl = process.env.BOTPRESS_QUEUE_URL || '';
    this.dlqUrl = process.env.BOTPRESS_DLQ_URL || '';

    if (!this.queueUrl || !this.dlqUrl) {
      throw new Error('Required queue URLs are not set');
    }
  }

  async enqueueMessage(message: QueueMessage): Promise<string> {
    try {
      const startTime = Date.now();

      const result = await this.sqs.sendMessage({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: message.metadata.userId, // Para garantizar orden FIFO
        MessageDeduplicationId: `${message.id}_${Date.now()}`,
        MessageAttributes: {
          MessageType: {
            DataType: 'String',
            StringValue: message.type
          },
          Priority: {
            DataType: 'String',
            StringValue: message.metadata.priority || 'normal'
          }
        }
      });

      const enqueueDuration = Date.now() - startTime;
      this.metrics.recordLatency('MessageEnqueueTime', enqueueDuration);
      this.metrics.incrementCounter('EnqueuedMessages');

      this.logger.info('Message enqueued successfully', {
        messageId: message.id,
        type: message.type,
        sqsMessageId: result.MessageId
      });

      return result.MessageId!;
    } catch (error) {
      this.logger.error('Failed to enqueue message', {
        error,
        messageId: message.id,
        type: message.type
      });
      throw new BotpressError('Failed to enqueue message');
    }
  }

  async dequeueMessages(maxMessages: number = 10): Promise<QueueMessage[]> {
    try {
      const result = await this.sqs.receiveMessage({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: 20, // Long polling
        MessageAttributeNames: ['All'],
        AttributeNames: ['All']
      });

      if (!result.Messages || result.Messages.length === 0) {
        return [];
      }

      this.metrics.recordMetric('DequeuedMessages', result.Messages.length);

      return result.Messages.map(message => ({
        ...JSON.parse(message.Body!),
        receiptHandle: message.ReceiptHandle
      }));
    } catch (error) {
      this.logger.error('Failed to dequeue messages', { error });
      throw new BotpressError('Failed to dequeue messages');
    }
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      await this.sqs.deleteMessage({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle
      });

      this.metrics.incrementCounter('DeletedMessages');
    } catch (error) {
      this.logger.error('Failed to delete message', {
        error,
        receiptHandle
      });
      throw new BotpressError('Failed to delete message');
    }
  }

  async moveToDeadLetter(message: QueueMessage, error: Error): Promise<void> {
    try {
      await this.sqs.sendMessage({
        QueueUrl: this.dlqUrl,
        MessageBody: JSON.stringify({
          ...message,
          error: {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          }
        }),
        MessageGroupId: message.metadata.userId,
        MessageDeduplicationId: `${message.id}_dlq_${Date.now()}`
      });

      this.metrics.incrementCounter('MessagesMovedToDLQ');
      
      this.logger.warn('Message moved to DLQ', {
        messageId: message.id,
        error: error.message
      });
    } catch (dlqError) {
      this.logger.error('Failed to move message to DLQ', {
        error: dlqError,
        originalError: error,
        messageId: message.id
      });
      throw new BotpressError('Failed to move message to DLQ');
    }
  }

/**
 * Retrieves the metrics for the SQS queue, including the approximate number of messages
 * and the approximate number of messages that are not visible.
 *
 * @returns {Promise<{ approximateNumberOfMessages: number; approximateNumberOfMessagesNotVisible: number }>} 
 *          A promise that resolves to an object containing the queue metrics.
 * @throws {BotpressError} If the metrics retrieval fails.
 */
  async getQueueMetrics(): Promise<{
    approximateNumberOfMessages: number;
    approximateNumberOfMessagesNotVisible: number
  }> {
    try {
      const result: Promise<GetQueueAttributesCommandOutput> = this.sqs.getQueueAttributes({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible'
        ]
      });

      return {
        approximateNumberOfMessages: parseInt((await result).Attributes?.ApproximateNumberOfMessages || '0'),
        approximateNumberOfMessagesNotVisible: parseInt((await result).Attributes?.ApproximateNumberOfMessagesNotVisible || '0')
      };
    } catch (error) {
      this.logger.error('Failed to get queue metrics', { error });
      throw new BotpressError('Failed to get queue metrics');
    }
  }
}