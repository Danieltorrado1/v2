import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { env } from './env';
import { AppError } from '../utils/AppError';

let supabaseAdminClient: SupabaseClient | null = null;

const assertSupabaseAdminConfig = (): void => {
  if (!env.SUPABASE_URL?.trim()) {
    throw new AppError('SUPABASE_URL is required', 500, 'CONFIGURATION_ERROR');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new AppError(
      'SUPABASE_SERVICE_ROLE_KEY is required to upload generated documents',
      500,
      'CONFIGURATION_ERROR'
    );
  }

  const keyParts = env.SUPABASE_SERVICE_ROLE_KEY.trim().split('.');

  if (keyParts.length !== 3) {
    throw new AppError(
      'SUPABASE_SERVICE_ROLE_KEY must be a valid JWT with service_role claims',
      500,
      'CONFIGURATION_ERROR'
    );
  }

  try {
    const payloadPart = keyParts[1];

    if (!payloadPart) {
      throw new AppError(
        'SUPABASE_SERVICE_ROLE_KEY could not be validated as a service_role JWT',
        500,
        'CONFIGURATION_ERROR'
      );
    }

    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8')
    ) as { role?: string };

    if (payload.role !== 'service_role') {
      throw new AppError(
        'SUPABASE_SERVICE_ROLE_KEY must belong to the service_role',
        500,
        'CONFIGURATION_ERROR'
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      'SUPABASE_SERVICE_ROLE_KEY could not be validated as a service_role JWT',
      500,
      'CONFIGURATION_ERROR'
    );
  }
};

export const getSupabaseAdminClient = (): SupabaseClient => {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  assertSupabaseAdminConfig();

  supabaseAdminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseAdminClient;
};
