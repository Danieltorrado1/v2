import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dbPool } from '../config/db';

async function main() {
  const sql = await readFile(resolve(process.cwd(), 'sql/phase-33-nomina-4a-cobertura.sql'), 'utf8');
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('NOMINA-4A COBERTURA schema applied (existing tables reused, no operational rows mutated).');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
