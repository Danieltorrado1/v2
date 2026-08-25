import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { dbPool } from '../config/db';

async function main(): Promise<void> {
  const sql = await readFile(
    resolve(process.cwd(), 'sql/phase-33-1-organizaciones-contexto-empresarial.sql'),
    'utf8'
  );
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('ADMIN-2A migration applied: organizaciones + contexto empresarial.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error('ADMIN-2A migration failed.');
  console.error(error);
  process.exitCode = 1;
});
