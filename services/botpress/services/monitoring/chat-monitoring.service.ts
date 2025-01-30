// services/botpress/services/monitoring/chat-monitoring.service.ts

import { CloudWatch, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { BaseService } from '../base/base.service';
import { ChatMessage, ChatResponse } from '../../types/chat.types';

interface ChatMetrics {
  messageCount: number;
  avgResponseTime: number;
  handoffRate: number;
  successRate: number;
  activeUsers: number;
}

export class ChatMonitoringService extends BaseService {
  private readonly cloudWatch: CloudWatch;
  private readonly eventBridge: EventBridge;
  private readonly namespace: string;

  constructor() {
    super('ChatMonitoringService');
    this.cloudWatch = new CloudWatch({});
    this.eventBridge = new EventBridge({});
    this.namespace = 'Spectra/ChatAPI';
  }

  async trackMessage(message: ChatMessage, response: ChatResponse, duration: number): Promise<void> {
    try {
      await Promise.all([
        this.recordMetrics(message, response, duration),
        this.publishEvent(message, response, duration)
      ]);
    } catch (error) {
      this.logger.error('Failed to track message', {
        error,
        conversationId: message.conversationId
      });
    }
  }

  private async recordMetrics(
    message: ChatMessage,
    response: ChatResponse,
    duration: number
  ): Promise<void> {
    const timestamp = new Date();
    const dimensions = {
      UserId: message.userId,
      ConversationId: message.conversationId
    };

    const metrics = [
      {
        MetricName: 'MessageProcessingTime',
        Value: duration,
        Unit: StandardUnit.Milliseconds
      },
      {
        MetricName: 'MessagesProcessed',
        Value: 1,
        Unit: StandardUnit.Count
      }
    ];

    if (this.isHandoffResponse(response)) {
      metrics.push({
        MetricName: 'HandoffRequests',
        Value: 1,
        Unit: StandardUnit.Count
      });
    }

     this.cloudWatch.putMetricData({
      Namespace: this.namespace,
      MetricData: metrics.map(metric => ({
        ...metric,
        Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
          Name,
          Value
        })),
        Timestamp: timestamp
      }))
    });
  }

  private async publishEvent(
    message: ChatMessage,
    response: ChatResponse,
    duration: number
  ): Promise<void> {
    await this.eventBridge.putEvents({
      Entries: [{
        EventBusName: process.env.MONITORING_EVENT_BUS!,
        Source: 'spectra.chat.monitoring',
        DetailType: 'message_processed',
        Time: new Date(),
        Detail: JSON.stringify({
          messageId: message.conversationId,
          userId: message.userId,
          duration,
          handoffRequested: this.isHandoffResponse(response),
          timestamp: new Date().toISOString()
        })
      }]
    });
  }

  private isHandoffResponse(response: ChatResponse): boolean {
    return response.responses.some(r => 
      r.type === 'handoff' || 
      r.metadata?.handoff?.requested
    );
  }

  async getMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<ChatMetrics> {
    const response = await this.cloudWatch.getMetricData({
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      MetricDataQueries: [
        {
          Id: 'messages',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'MessagesProcessed'
            },
            Period: 3600,
            Stat: 'Sum'
          }
        },
        {
          Id: 'responseTime',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'MessageProcessingTime'
            },
            Period: 3600,
            Stat: 'Average'
          }
        },
        {
          Id: 'handoffs',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'HandoffRequests'
            },
            Period: 3600,
            Stat: 'Sum'
          }
        }
      ]
    });

    const results = response.MetricDataResults || [];
    const messageCount = this.getMetricValue(results, 'messages');
    const handoffs = this.getMetricValue(results, 'handoffs');

    return {
      messageCount,
      avgResponseTime: this.getMetricValue(results, 'responseTime'),
      handoffRate: messageCount > 0 ? (handoffs / messageCount) * 100 : 0,
      successRate: 100 - (handoffs / messageCount) * 100,
      activeUsers: await this.getActiveUsers(timeRange)
    };
  }

  private getMetricValue(results: any[], id: string): number {
    const result = results.find(r => r.Id === id);
    return result?.Values?.[0] || 0;
  }

  private async getActiveUsers(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<number> {
    const response = await this.cloudWatch.getMetricStatistics({
      Namespace: this.namespace,
      MetricName: 'MessagesProcessed',
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      Period: 3600,
      Statistics: ['SampleCount'],
      Dimensions: [{ Name: 'UserId', Value: '*' }]
    });

    return response.Datapoints?.[0]?.SampleCount || 0;
  }
}