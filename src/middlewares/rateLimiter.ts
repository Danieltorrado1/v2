import rateLimit from 'express-rate-limit';

import { env } from '../config/env';
import { errorResponse } from '../utils/apiResponse';

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return errorResponse(res, {
      statusCode: 429,
      message: 'Too many requests, please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED'
    });
  }
});
