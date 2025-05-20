"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const logger_1 = require("@shared/utils/logger");
const metrics_1 = require("@shared/utils/metrics");
const logger = new logger_1.Logger('RestApiAuthorizer');
const metrics = new metrics_1.MetricsService('RestAPI');
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;
if (!userPoolId || !clientId) {
    throw new Error('Missing required environment variables');
}
const verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId,
});
const handler = async (event) => {
    try {
        logger.info('Processing authorization request', { methodArn: event.methodArn });
        if (!event.authorizationToken) {
            logger.error('No authorization token provided');
            return generatePolicy('user', 'Deny', event.methodArn);
        }
        const token = event.authorizationToken.replace('Bearer ', '');
        const payload = await verifier.verify(token);
        logger.info('Token verification successful', {
            userId: payload.sub,
            methodArn: event.methodArn
        });
        metrics.incrementCounter('AuthorizationSuccess');
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
        logger.error('Authorization failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            methodArn: event.methodArn
        });
        metrics.incrementCounter('AuthorizationFailure');
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