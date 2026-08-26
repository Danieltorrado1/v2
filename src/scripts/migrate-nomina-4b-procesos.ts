import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dbPool } from '../config/db';

const main = async () => {
  const client = await dbPool.connect();
  try { await client.query('BEGIN'); await client.query(await readFile(resolve(process.cwd(), 'sql/phase-36-nomina-4b-procesos.sql'), 'utf8')); await client.query('COMMIT'); console.log('NÓMINA-4B schema applied idempotently.'); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await dbPool.end(); }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
