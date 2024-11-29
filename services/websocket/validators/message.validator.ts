// services/websocket/validators/message.validator.ts
import Joi from 'joi';
import { ValidationError } from '@shared/utils/errors';

const messageSchema = Joi.object({
  type: Joi.string().required(),
  content: Joi.string().required(),
  metadata: Joi.object().optional()
}).required();

export const validateMessage = (message: unknown): any => {
  const { error, value } = messageSchema.validate(message, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    throw new ValidationError('Invalid message format', {
      details: error.details
    });
  }

  return value;
};