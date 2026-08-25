import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { dbPool } from '../config/db';

async function main() {
  const sql = await readFile(path.resolve('sql/phase-34-1-planes-modulos-saas.sql'), 'utf8');
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('phase-34-1 applied');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
