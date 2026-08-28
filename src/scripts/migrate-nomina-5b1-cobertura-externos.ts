import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dbPool } from '../config/db';

const main = async () => {
  const sql = await readFile(resolve(process.cwd(), 'sql/phase-35-nomina-5b1-cobertura-externos.sql'), 'utf8');
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('NOMINA-5B.1 schema applied without operational backfill.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
