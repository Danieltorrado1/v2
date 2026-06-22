import { Pool, QueryResult, QueryResultRow } from 'pg';

import { env } from './env';

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
