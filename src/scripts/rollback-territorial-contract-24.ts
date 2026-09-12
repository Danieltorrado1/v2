import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { Client } from 'pg';

const CONTRACT_ID = 24;
const EMPRESA_ID = 15;
const CONFIRMATION = 'ROLLBACK_CORRECCION_TERRITORIAL_FOCALIZACION_24';
const SNAPSHOT_FILE = 'reports/territorial-contract-24-pre-migration.json';
const MUNICIPIO_ANTERIOR = 728;
const MUNICIPIO_NUEVO = 734;
type Row = Record<string, any>;

const stable = (value: unknown): unknown => value instanceof Date ? value.toISOString() : value;
const comparable = (row: Row, ignored: string[] = []): Row => Object.fromEntries(Object.keys(row).filter((key) => !ignored.includes(key)).sort().map((key) => [key, stable(row[key])]));
const expectedAfter = (table: string, row: Row): Row => {
  const copy = { ...row };
  if (['focalizacion_final', 'focalizacion_vigencias', 'instituciones', 'sedes', 'cobertura_asignaciones'].includes(table)) copy.municipio_id = MUNICIPIO_NUEVO;
  if (table === 'focalizacion_final') copy.municipio_texto = 'PUERTO RICO';
  return copy;
};
type Config = Record<string, string> & { host: string; database: string; schema: string };
const loadConfig = async (): Promise<Config> => {
  const values = dotenv.parse(await readFile('.env', 'utf8')) as Record<string, string>;
  if (!values.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const databaseUrl: string = values.DATABASE_URL;
  const url = new URL(databaseUrl);
  return { ...values, DATABASE_URL: databaseUrl, host: url.host, database: url.pathname.slice(1), schema: 'public' };
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (!apply) throw new Error('ROLLBACK_REQUIRES_EXPLICIT_APPLY');
  if (process.argv.find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length) !== CONFIRMATION) throw new Error(`REQUIERE --confirm=${CONFIRMATION}`);
  const config = await loadConfig();
  const snapshotPath = process.argv.find((value) => value.startsWith('--snapshot='))?.slice('--snapshot='.length) ?? SNAPSHOT_FILE;
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as { metadata: Row; focalizacion_final: Row[]; focalizacion_vigencias: Row[]; instituciones: Row[]; sedes: Row[]; cobertura_asignaciones: Row[] };
  if (config.APP_NAME !== 'Empiria V2 Backend' || config.NODE_ENV !== 'production') throw new Error('ROLLBACK_TARGET_NOT_PRODUCTION');
  if (config.host !== snapshot.metadata.host || config.database !== snapshot.metadata.database || snapshot.metadata.empresa_id !== EMPRESA_ID || snapshot.metadata.contrato_id !== CONTRACT_ID) throw new Error('ROLLBACK_SNAPSHOT_TARGET_MISMATCH');
  const databaseUrl = config.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL_MISSING');
  const client = new Client({ connectionString: databaseUrl, ssl: /supabase|pooler/.test(databaseUrl) ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout='120s'`);
    const contract = (await client.query(`SELECT id,empresa_id FROM contratos WHERE id=$1`, [CONTRACT_ID])).rows[0];
    if (!contract || String(contract.empresa_id) !== String(EMPRESA_ID)) throw new Error('ROLLBACK_CONTRACT_PRECONDITION_FAILED');
    const groups: Array<[string, Row[]]> = [['instituciones', snapshot.instituciones], ['sedes', snapshot.sedes], ['focalizacion_vigencias', snapshot.focalizacion_vigencias], ['focalizacion_final', snapshot.focalizacion_final], ['cobertura_asignaciones', snapshot.cobertura_asignaciones]];
    for (const [table, rows] of groups) for (const row of rows) {
      const current = (await client.query(`SELECT * FROM ${table} WHERE id=$1`, [row.id])).rows[0] as Row | undefined;
      if (!current || String(current.municipio_id) !== String(MUNICIPIO_NUEVO) || JSON.stringify(comparable(current, ['updated_at', 'municipio_id', 'municipio_texto'])) !== JSON.stringify(comparable(expectedAfter(table, row), ['updated_at', 'municipio_id', 'municipio_texto']))) throw new Error(`ROLLBACK_PRECONDITION_FAILED:${table}:${row.id}`);
    }
    const updates = { instituciones: 0, sedes: 0, focalizacion_vigencias: 0, focalizacion_final: 0, cobertura_asignaciones: 0 };
    for (const row of snapshot.instituciones) updates.instituciones += (await client.query(`UPDATE instituciones SET municipio_id=$2 WHERE id=$1 AND municipio_id=$3`, [row.id, row.municipio_id, MUNICIPIO_NUEVO])).rowCount ?? 0;
    for (const row of snapshot.sedes) updates.sedes += (await client.query(`UPDATE sedes SET municipio_id=$2 WHERE id=$1 AND municipio_id=$3`, [row.id, row.municipio_id, MUNICIPIO_NUEVO])).rowCount ?? 0;
    for (const row of snapshot.focalizacion_vigencias) updates.focalizacion_vigencias += (await client.query(`UPDATE focalizacion_vigencias SET municipio_id=$2 WHERE id=$1 AND municipio_id=$3`, [row.id, row.municipio_id, MUNICIPIO_NUEVO])).rowCount ?? 0;
    for (const row of snapshot.focalizacion_final) updates.focalizacion_final += (await client.query(`UPDATE focalizacion_final SET municipio_id=$2, municipio_texto=$3 WHERE id=$1 AND contrato_id=$4 AND municipio_id=$5`, [row.id, row.municipio_id, row.municipio_texto, CONTRACT_ID, MUNICIPIO_NUEVO])).rowCount ?? 0;
    for (const row of snapshot.cobertura_asignaciones) updates.cobertura_asignaciones += (await client.query(`UPDATE cobertura_asignaciones SET municipio_id=$2 WHERE id=$1 AND contrato_id=$4 AND municipio_id=$3`, [row.id, row.municipio_id, MUNICIPIO_NUEVO, CONTRACT_ID])).rowCount ?? 0;
    if (updates.instituciones !== snapshot.instituciones.length || updates.sedes !== snapshot.sedes.length || updates.focalizacion_vigencias !== snapshot.focalizacion_vigencias.length || updates.focalizacion_final !== snapshot.focalizacion_final.length || updates.cobertura_asignaciones !== snapshot.cobertura_asignaciones.length) throw new Error(`ROLLBACK_UPDATE_COUNT_MISMATCH:${JSON.stringify(updates)}`);
    await client.query('COMMIT');
    console.log(JSON.stringify({ modo: 'ROLLBACK_COMMIT', updates, contrato_id: CONTRACT_ID, municipio_restaurado: MUNICIPIO_ANTERIOR }, null, 2));
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
