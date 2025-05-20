"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const business_metrics_service_1 = require("../business-metrics.service");
const logger_1 = require("@shared/utils/logger");
const error_handling_middleware_1 = require("@shared/middleware/error/error-handling.middleware");
const logger = new logger_1.Logger('DashboardMetricsHandler');
const dashboardHandler = async (event) => {
    try {
        const startTime = event.queryStringParameters?.startTime ||
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const endTime = event.queryStringParameters?.endTime ||
            new Date().toISOString();
        const metrics = event.queryStringParameters?.metrics?.split(',') || [
            'TokensUsed',
            'HandoffsInitiated',
            'HandoffsCompleted',
            'MessageCount',
            'APILatency'
        ];
        const metricsService = business_metrics_service_1.BusinessMetricsService.getInstance();
        const results = await Promise.all(metrics.map(async (metricName) => {
            const metricData = await metricsService.getMetricsHistory(metricName, startTime, endTime);
            return {
                metricName,
                data: metricData
            };
        }));
        const dashboardData = results.map(result => {
            const hourlyData = result.data.reduce((acc, item) => {
                const hour = new Date(item.timestamp).setMinutes(0, 0, 0);
                const hourKey = new Date(hour).toISOString();
                if (!acc[hourKey]) {
                    acc[hourKey] = {
                        timestamp: hourKey,
                        count: 0,
                        sum: 0
                    };
                }
                acc[hourKey].count++;
                acc[hourKey].sum += item.value;
                return acc;
            }, {});
            const dataPoints = Object.values(hourlyData).map(hourData => ({
                timestamp: hourData.timestamp,
                value: hourData.sum / hourData.count,
                count: hourData.count
            }));
            dataPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return {
                metricName: result.metricName,
                dataPoints
            };
        });
        logger.info('Dashboard metrics retrieved', {
            startTime,
            endTime,
            metrics
        });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dashboardData,
                timeRange: {
                    startTime,
                    endTime
                }
            })
        };
    }
    catch (error) {
        logger.error('Error retrieving dashboard metrics', { error });
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Error retrieving dashboard metrics',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};
exports.handler = error_handling_middleware_1.ErrorHandlingMiddleware.withErrorHandling(dashboardHandler);
//# sourceMappingURL=dashboard.handler.js.map