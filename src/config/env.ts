import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnvSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  APP_NAME: z.string().min(1, 'APP_NAME is required'),
  API_PREFIX: z
    .string()
    .trim()
    .min(1, 'API_PREFIX is required')
    .refine((value) => value.startsWith('/'), 'API_PREFIX must start with "/"'),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().min(1, 'JWT_EXPIRES_IN is required'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  TRUST_PROXY: booleanFromEnvSchema,
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  ENABLE_JOBS: booleanFromEnvSchema,
  SUPABASE_URL: z.url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_STORAGE_BUCKET: z.string().min(1, 'SUPABASE_STORAGE_BUCKET is required')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    'Invalid environment variables:',
    parsedEnv.error.flatten().fieldErrors
  );
  throw new Error('Environment validation failed');
}

export const env = parsedEnv.data;

export type Env = typeof env;
