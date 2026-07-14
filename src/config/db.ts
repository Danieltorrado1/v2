import { Pool, QueryResult, QueryResultRow } from 'pg';

import { env } from './env';

const shouldUseSsl = (() => {
  if (env.NODE_ENV === 'production') {
    return true;
  }

  try {
    const host = new URL(env.DATABASE_URL).hostname.toLowerCase();
    return host.includes('supabase.co') || host.includes('supabase.com') || host.includes('pooler.');
  } catch {
    const databaseUrl = env.DATABASE_URL.toLowerCase();
    return databaseUrl.includes('supabase.co') || databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.');
  }
})();

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

dbPool.on('error', (error: Error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export const dbQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  return dbPool.query<T>(text, params);
};
