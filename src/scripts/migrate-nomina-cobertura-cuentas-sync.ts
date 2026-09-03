import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { dbPool } from '../config/db';

const main = async () => {
  const sql = await readFile(
    resolve(process.cwd(), 'sql/phase-36-3-nomina-cobertura-cuentas-sync.sql'),
    'utf8'
  );
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('NOMINA-36.3 external coverage account sync schema applied.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
