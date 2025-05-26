"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
function extractToken(event) {
    if (event.authorizationToken) {
        return event.authorizationToken;
    }
    if (event.headers) {
        for (const key of Object.keys(event.headers)) {
            if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-authorization') {
                return event.headers[key];
            }
        }
    }
    if (event.multiValueHeaders) {
        for (const key of Object.keys(event.multiValueHeaders)) {
            if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-authorization') {
                if (event.multiValueHeaders[key] && event.multiValueHeaders[key].length > 0) {
                    return event.multiValueHeaders[key][0];
                }
            }
        }
    }
    if (event.queryStringParameters && event.queryStringParameters.auth) {
        return event.queryStringParameters.auth;
    }
    return null;
}
const logger = new logger_1.Logger('RestApiAuthorizer');
const metrics = new metrics_1.MetricsService('RestAPI');
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;
console.log(JSON.stringify({
    message: 'CLOUDWATCH TEST: Authorizer initialization',
    userPoolId,
    clientId,
    timestamp: new Date().toISOString()
}));
if (!userPoolId || !clientId) {
    console.error(JSON.stringify({
        message: 'CLOUDWATCH TEST: Missing required environment variables',
        userPoolId: !!userPoolId,
        clientId: !!clientId,
        timestamp: new Date().toISOString()
    }));
    throw new Error('Missing required environment variables');
}
const verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId,
});
const handler = async (event) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    try {
        console.log(JSON.stringify({
            message: `CLOUDWATCH DEBUG [${requestId}]: Full authorization event`,
            eventKeys: Object.keys(event),
            methodArn: event.methodArn,
            type: event.type,
            hasHeaders: !!event.headers,
            hasMultiValueHeaders: !!event.multiValueHeaders,
            hasAuthorizationToken: !!event.authorizationToken,
            hasQueryStringParameters: !!event.queryStringParameters,
            timestamp: new Date().toISOString()
        }));
        logger.info('Processing authorization request', {
            requestId,
            methodArn: event.methodArn,
            eventType: typeof event,
            hasHeaders: !!event.headers,
            hasMultiValueHeaders: !!event.multiValueHeaders,
            hasAuthorizationToken: !!event.authorizationToken,
            hasQueryStringParameters: !!event.queryStringParameters
        });
        const authToken = extractToken(event);
        if (!authToken) {
            console.log(JSON.stringify({
                message: `CLOUDWATCH DEBUG [${requestId}]: No authorization token found in any location`,
                timestamp: new Date().toISOString()
            }));
            logger.error('No authorization token provided');
            return generatePolicy('user', 'Deny', event.methodArn);
        }
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization token received',
            tokenLength: authToken.length,
            tokenStartsWith: authToken.substring(0, 20) + '...',
            hasBearerPrefix: authToken.startsWith('Bearer '),
            timestamp: new Date().toISOString()
        }));
        let token = authToken;
        if (token.startsWith('Bearer ')) {
            token = token.substring(7);
        }
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Token extracted',
            tokenLength: token.length,
            source: token === authToken ? 'original' : 'processed',
            timestamp: new Date().toISOString()
        }));
        logger.debug('Token extracted', {
            tokenLength: token.length,
            source: token === authToken ? 'original' : 'processed'
        });
        const payload = await verifier.verify(token);
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Token verification successful',
            userId: payload.sub,
            methodArn: event.methodArn,
            timestamp: new Date().toISOString()
        }));
        logger.info('Token verification successful', {
            userId: payload.sub,
            methodArn: event.methodArn
        });
        metrics.incrementCounter('AuthorizationSuccess');
        const duration = Date.now() - startTime;
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization process completed',
            duration,
            timestamp: new Date().toISOString()
        }));
        logger.debug('Authorization process completed', {
            duration
        });
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
                email: payload['email'] || 'unknown',
                userType: payload['custom:userType'] || 'guest',
                userPlan: payload['custom:userPlan'] || 'basic'
            },
        };
    }
    catch (error) {
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization failed',
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorMessage: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace',
            methodArn: event.methodArn,
            timestamp: new Date().toISOString()
        }));
        logger.error('Authorization failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorName: error instanceof Error ? error.name : 'Unknown',
            methodArn: event.methodArn
        });
        metrics.incrementCounter('AuthorizationFailure');
        const duration = Date.now() - startTime;
        console.log(JSON.stringify({
            message: 'CLOUDWATCH TEST: Authorization process completed with error',
            duration,
            timestamp: new Date().toISOString()
        }));
        logger.debug('Authorization process completed with error', {
            duration
        });
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};
exports.handler = handler;
const generatePolicy = (principalId, effect, resource) => {
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                },
            ],
        },
    };
};
//# sourceMappingURL=authorizer.js.map