import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

dotenv.config();

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not defined');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('supabase.com') || process.env.DATABASE_URL.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
  try {
    await pool.query(await readFile(path.resolve(process.cwd(), 'sql/phase-38-vinculacion-cotiza-pension.sql'), 'utf8'));
    console.log('Vinculacion cotiza_pension migration applied successfully.');
  } finally {
    await pool.end();
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
