import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

dotenv.config();

const SQL_FILE = path.resolve(process.cwd(), 'sql', 'phase-16-cuentas-cobro-ops.sql');

const maskDatabaseUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const username = url.username ? '***' : '';
    const password = url.password ? ':***' : '';
    const auth = username || password ? `${username}${password}@` : '';
    return `${url.protocol}//${auth}${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '[invalid DATABASE_URL]';
  }
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const sql = await readFile(SQL_FILE, 'utf8');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });

  try {
    console.log(`Running OPS billing migration on ${maskDatabaseUrl(databaseUrl)}`);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('OPS billing migration applied successfully.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error('OPS billing migration failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
