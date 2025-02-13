// services/auth/handlers/session.handler.ts

import { APIGatewayProxyHandler } from 'aws-lambda';
import { SessionService } from '../services/session.service';
import { validateRequest } from '@shared/middleware/validation/validation.middleware';
import { withErrorHandling } from '@shared/middleware/error/error-handling.middleware';
import { SecurityMiddleware } from '@shared/middleware/security/security.middleware';
import * as Joi from 'joi';

const createSessionSchema = Joi.object({
  userId: Joi.string().required(),
  metadata: Joi.object().optional()
});

const sessionService = new SessionService();

export const createSession: APIGatewayProxyHandler = SecurityMiddleware.secure({
  requireAuth: true
})(
  validateRequest(createSessionSchema)(
    withErrorHandling(async (event) => {
      const data = JSON.parse(event.body!);
      const session = await sessionService.createSession(data.userId, data.metadata);
      
      return {
        statusCode: 201,
        body: JSON.stringify(session)
      };
    })
  )
);

export const extendSession: APIGatewayProxyHandler = SecurityMiddleware.secure({
  requireAuth: true
})(
  withErrorHandling(async (event) => {
    const sessionId = event.pathParameters?.sessionId;
    const session = await sessionService.extendSession(sessionId!);
    
    return {
      statusCode: 200,
      body: JSON.stringify(session)
    };
  })
);

export const terminateSession: APIGatewayProxyHandler = SecurityMiddleware.secure({
  requireAuth: true
})(
  withErrorHandling(async (event) => {
    const sessionId = event.pathParameters?.sessionId;
    await sessionService.terminateSession(sessionId!);
    
    return {
      statusCode: 204,
      body: ''
    };
  })
);