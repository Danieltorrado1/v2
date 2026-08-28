import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';

import { env } from './env';
import { AppError } from '../utils/AppError';

export const JSON_BODY_LIMIT = '10mb';

const configuredOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const localDevelopmentOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const allowedOrigins = new Set([
  ...configuredOrigins,
  ...(env.NODE_ENV === 'development' ? localDevelopmentOrigins : [])
]);

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

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origin not allowed by CORS', 403, 'CORS_NOT_ALLOWED'));
  },
  credentials: true
});

export const compressionMiddleware = compression();
