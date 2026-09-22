import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { dbPool } from '../config/db';

const main = async () => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(resolve(process.cwd(), 'sql/phase-41-nomina-dco-dia-compensatorio.sql'), 'utf8'));
    await client.query(await readFile(resolve(process.cwd(), 'sql/phase-42-nomina-ta-turno-adicional.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('NOMINA DCO + TA migrations applied idempotently.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

void main();
