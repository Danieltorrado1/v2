import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './env';
import { AppError } from '../utils/AppError';

export const JSON_BODY_LIMIT = '10mb';

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const helmetMiddleware = helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: {
    policy: 'cross-origin'
  },
  referrerPolicy: {
    policy: 'no-referrer'
  }
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origin not allowed by CORS', 403, 'CORS_NOT_ALLOWED'));
  },
  credentials: true
});

export const compressionMiddleware = compression();
