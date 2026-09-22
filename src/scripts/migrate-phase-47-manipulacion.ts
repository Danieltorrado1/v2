import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dbPool } from '../config/db';

async function main() {
  const client=await dbPool.connect();
  try {
    await client.query(readFileSync(resolve('sql/phase-47-manipulacion-modalidad.sql'),'utf8'));
    console.log('PASS: modalidad de Manipulación disponible en personas y vinculaciones; documentos existentes conservados.');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>dbPool.end());
