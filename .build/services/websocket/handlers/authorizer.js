"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const config_1 = require("../../botpress/config/config");
const logger = new logger_1.Logger('WebSocketAuthorizer');
const metrics = new metrics_1.MetricsService(config_1.MONITORING_CONFIG.METRICS.NAMESPACE);
if (!process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_CLIENT_ID) {
    throw new Error('Missing required environment variables');
}
const jwtVerifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'id',
    clientId: process.env.COGNITO_CLIENT_ID,
});
const handler = async (event) => {
    logger.info('Open Event', event);
    const startTime = Date.now();
    try {
        const token = event.queryStringParameters?.Auth;
        logger.debug('WebSocket authorization request received', {
            methodArn: event.methodArn
        });
        if (!token) {
            throw new Error('No authentication token provided');
        }
        const payload = await jwtVerifier.verify(token);
        logger.info('WebSocket authorization successful', {
            userId: payload.sub,
            latency: Date.now() - startTime
        });
        metrics.incrementCounter('WebSocketAuthorizationSuccess');
        metrics.recordMetric('WebSocketAuthorizationLatency', Date.now() - startTime);
        return {
            principalId: payload.sub,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: 'execute-api:Invoke',
                        Effect: 'Allow',
                        Resource: event.methodArn,
                    },
                ],
            },
            context: {
                userId: payload.sub,
                email: typeof payload.email === 'string' ? payload.email : '',
                scope: typeof payload.scope === 'string' ? payload.scope : JSON.stringify(payload.scope),
                userPlan: payload['custom:userPlan'] || 'basic'
            }
        };
    }
    catch (error) {
        logger.error('WebSocket authorization failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            latency: Date.now() - startTime
        });
        metrics.incrementCounter('WebSocketAuthorizationFailure');
        metrics.recordMetric('WebSocketAuthorizationLatency', Date.now() - startTime);
        return {
            principalId: 'unauthorized',
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: 'execute-api:Invoke',
                        Effect: 'Deny',
                        Resource: event.methodArn,
                    },
                ],
            },
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=authorizer.js.map