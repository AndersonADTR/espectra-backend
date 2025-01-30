// services/botpress/services/metrics/performance-metrics.service.ts

import { CloudWatch, MetricDataQuery } from '@aws-sdk/client-cloudwatch';
import { BaseService } from '../base/base.service';

interface PerformanceMetrics {
  messageLatency: {
    p50: number;
    p90: number;
    p99: number;
  };
  throughput: {
    messagesPerMinute: number;
    peakMessagesPerMinute: number;
  };
  errors: {
    rate: number;
    count: number;
    topErrors: Array<{ type: string; count: number }>;
  };
  handoff: {
    avgResponseTime: number;
    successRate: number;
  };
}

export class PerformanceMetricsService extends BaseService {
  private readonly cloudWatch: CloudWatch;
  private readonly namespace: string;

  constructor() {
    super('PerformanceMetricsService');
    this.cloudWatch = new CloudWatch({});
    this.namespace = 'Spectra/ChatAPI/Performance';
  }

  async recordLatency(operationType: string, duration: number): Promise<void> {
    try {
      await this.cloudWatch.putMetricData({
        Namespace: this.namespace,
        MetricData: [{
          MetricName: `${operationType}Latency`,
          Value: duration,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        }]
      });
    } catch (error) {
      this.logger.error('Failed to record latency metric', {
        error,
        operationType,
        duration
      });
    }
  }

  async getPerformanceMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<PerformanceMetrics> {
    try {
      const [latencyMetrics, throughputMetrics, errorMetrics, handoffMetrics] = 
        await Promise.all([
          this.getLatencyMetrics(timeRange),
          this.getThroughputMetrics(timeRange),
          this.getErrorMetrics(timeRange),
          this.getHandoffMetrics(timeRange)
        ]);

      return {
        messageLatency: latencyMetrics,
        throughput: throughputMetrics,
        errors: errorMetrics,
        handoff: handoffMetrics
      };
    } catch (error) {
      this.handleError(error, 'Failed to get performance metrics', {
        operationName: 'getPerformanceMetrics',
        timeRange
      });
    }
  }

  private async getLatencyMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<{ p50: number; p90: number; p99: number }> {
    const response = await this.cloudWatch.getMetricData({
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      MetricDataQueries: [
        this.createPercentileQuery('p50', 50),
        this.createPercentileQuery('p90', 90),
        this.createPercentileQuery('p99', 99)
      ]
    });

    return {
      p50: this.extractMetricValue(response, 'p50'),
      p90: this.extractMetricValue(response, 'p90'),
      p99: this.extractMetricValue(response, 'p99')
    };
  }

  private async getThroughputMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<{ messagesPerMinute: number; peakMessagesPerMinute: number }> {
    const response = await this.cloudWatch.getMetricData({
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      MetricDataQueries: [
        {
          Id: 'avgThroughput',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'MessagesProcessed'
            },
            Period: 60,
            Stat: 'Average'
          }
        },
        {
          Id: 'peakThroughput',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'MessagesProcessed'
            },
            Period: 60,
            Stat: 'Maximum'
          }
        }
      ]
    });

    return {
      messagesPerMinute: this.extractMetricValue(response, 'avgThroughput'),
      peakMessagesPerMinute: this.extractMetricValue(response, 'peakThroughput')
    };
  }

  private async getErrorMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<{ rate: number; count: number; topErrors: Array<{ type: string; count: number }> }> {
    const response = await this.cloudWatch.getMetricData({
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      MetricDataQueries: [
        {
          Id: 'errorRate',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'ErrorRate'
            },
            Period: 3600,
            Stat: 'Average'
          }
        },
        {
          Id: 'errorCount',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'Errors'
            },
            Period: 3600,
            Stat: 'Sum'
          }
        }
      ]
    });

    // Obtener top errores desde DynamoDB o CloudWatch Logs Insights
    const topErrors = await this.getTopErrors(timeRange);

    return {
      rate: this.extractMetricValue(response, 'errorRate'),
      count: this.extractMetricValue(response, 'errorCount'),
      topErrors
    };
  }

  private async getHandoffMetrics(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<{ avgResponseTime: number; successRate: number }> {
    const response = await this.cloudWatch.getMetricData({
      StartTime: timeRange.startTime,
      EndTime: timeRange.endTime,
      MetricDataQueries: [
        {
          Id: 'handoffResponseTime',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'HandoffResponseTime'
            },
            Period: 3600,
            Stat: 'Average'
          }
        },
        {
          Id: 'handoffSuccessRate',
          MetricStat: {
            Metric: {
              Namespace: this.namespace,
              MetricName: 'HandoffSuccessRate'
            },
            Period: 3600,
            Stat: 'Average'
          }
        }
      ]
    });

    return {
      avgResponseTime: this.extractMetricValue(response, 'handoffResponseTime'),
      successRate: this.extractMetricValue(response, 'handoffSuccessRate')
    };
  }

  private createPercentileQuery(id: string, percentile: number): MetricDataQuery {
    return {
      Id: id,
      MetricStat: {
        Metric: {
          Namespace: this.namespace,
          MetricName: 'MessageLatency'
        },
        Period: 300,
        Stat: `p${percentile}`
      }
    };
  }

  private extractMetricValue(response: any, id: string): number {
    const result = response.MetricDataResults?.find((r: { Id: string; }) => r.Id === id);
    return result?.Values?.[0] || 0;
  }

  private async getTopErrors(timeRange: {
    startTime: Date;
    endTime: Date;
  }): Promise<Array<{ type: string; count: number }>> {
    
    try {
        const params = {
          MetricDataQueries: [
            {
              Id: 'errors',
              MetricStat: {
                Metric: {
                  Namespace: this.namespace,
                  MetricName: 'Errors',
                  Dimensions: [
                    {
                      Name: 'ErrorType',
                      Value: '*'
                    }
                  ]
                },
                Period: 3600, // 1 hour aggregation
                Stat: 'Sum'
              }
            }
          ],
          StartTime: timeRange.startTime,
          EndTime: timeRange.endTime
        };
    
        const response = await this.cloudWatch.getMetricData(params);
    
        // Transform and aggregate error data
        const errorCounts = new Map<string, {
          count: number,
          lastOccurrence: Date
        }>();
    
        response.MetricDataResults?.[0].Timestamps?.forEach((timestamp, index) => {
          const value = response.MetricDataResults?.[0].Values?.[index] || 0;
          const errorType = response.MetricDataResults?.[0].Label?.[index] || 'Unknown';
    
          const current = errorCounts.get(errorType) || {
            count: 0,
            lastOccurrence: new Date(0)
          };
    
          errorCounts.set(errorType, {
            count: current.count + value,
            lastOccurrence: new Date(Math.max(
              timestamp.getTime(),
              current.lastOccurrence.getTime()
            ))
          });
        });
    
        // Sort and limit results
        return Array.from(errorCounts.entries())
          .map(([errorType, data]) => ({
            type: errorType,
            count: data.count,
            lastOccurrence: data.lastOccurrence
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
    } catch (error) {
        this.handleError(error, 'Failed to get top errors', {
            operationName: 'getTopErrors',
            timeRange
        });
        return [];
    }
  }
}