import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

const envFileArgument = process.argv.find((argument) => argument.startsWith('--env-file='));
dotenv.config(envFileArgument ? { path: envFileArgument.slice('--env-file='.length) } : undefined);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not defined');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.') ? { rejectUnauthorized: false } : false,
});

async function main() {
  const sql = await readFile(path.resolve('sql/phase-39-tenant-operation-logistica.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('phase-39 tenant operation/logistica applied');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('phase-39 failed');
  console.error(error);
  process.exitCode = 1;
});