import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { Client } from 'pg';

const readFileAsync = promisify(readFile);
const CONTRACT_ID = 24;
const EMPRESA_ID = 15;
const FINAL_IDS = [...Array.from({ length: 9 }, (_, i) => 643 + i), ...Array.from({ length: 16 }, (_, i) => 666 + i)];
const SNAPSHOT = 'reports/territorial-contract-24-pre-migration.json';
const normalize = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
const institutionKey = (value: unknown): string => normalize(value).replace(/^CENTRO EDUCATIVO /, '').replace(/^CE /, '').replace(/^INSTITUCION EDUCATIVA /, '').replace(/^IE /, '');

async function main(): Promise<void> {
  const values = dotenv.parse(readFileSync('.env', 'utf8')) as Record<string, string>;
  if (!values.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(values.DATABASE_URL);
  const snapshot = JSON.parse((await readFileAsync(SNAPSHOT, 'utf8')).toString()) as { metadata: Record<string, any>; focalizacion_final: Array<Record<string, any>>; instituciones: Array<Record<string, any>>; sedes: Array<Record<string, any>>; cobertura_asignaciones: Array<Record<string, any>> };
  if (snapshot.metadata.host !== url.host || snapshot.metadata.database !== url.pathname.slice(1) || snapshot.metadata.final_count !== 25 || snapshot.metadata.institution_count !== 2 || snapshot.metadata.sede_count !== 24 || snapshot.metadata.combination_count !== 25 || snapshot.metadata.assignment_count !== 7) throw new Error('SNAPSHOT_NO_COINCIDE_PRECONDICIONES');
  if (snapshot.focalizacion_final.length !== 25 || snapshot.instituciones.length !== 2 || snapshot.sedes.length !== 24 || snapshot.cobertura_asignaciones.length !== 7) throw new Error('SNAPSHOT_INCOMPLETO');
  const client = new Client({ connectionString: values.DATABASE_URL, ssl: /supabase|pooler/.test(values.DATABASE_URL) ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`SELECT current_database() AS database,current_schema() AS schema,current_user AS user_name`)).rows[0];
    if (values.APP_NAME !== 'Empiria V2 Backend') throw new Error('APP_NAME_NO_COINCIDE');
    const contract = (await client.query(`SELECT id,empresa_id FROM contratos WHERE id=$1`, [CONTRACT_ID])).rows[0];
    const finals = (await client.query(`SELECT id,municipio_id,institucion_id,sede_id FROM focalizacion_final WHERE contrato_id=$1 AND id=ANY($2::bigint[])`, [CONTRACT_ID, FINAL_IDS])).rows;
    const municipalities = (await client.query(`SELECT id,nombre_municipio,codigo_dane FROM municipios WHERE id IN (728,734) ORDER BY id`)).rows;
    const institutions = (await client.query(`SELECT id,nombre_institucion FROM instituciones WHERE contrato_id=$1 AND id=ANY($2::bigint[])`, [CONTRACT_ID, [...new Set(finals.map((r) => r.institucion_id))]])).rows;
    const sedes = (await client.query(`SELECT id FROM sedes WHERE id=ANY($1::bigint[])`, [[...new Set(finals.map((r) => r.sede_id))]])).rows;
    const assignments = (await client.query(`SELECT id FROM cobertura_asignaciones WHERE contrato_id=$1 AND focalizacion_final_id=ANY($2::bigint[])`, [CONTRACT_ID, FINAL_IDS])).rows;
    if (!contract || String(contract.empresa_id) !== String(EMPRESA_ID)) throw new Error('CONTRATO_EMPRESA_INVALIDO');
    if (finals.length !== 25 || new Set(finals.map((r) => Number(r.id))).size !== 25 || FINAL_IDS.some((id) => !finals.some((r) => Number(r.id) === id))) throw new Error('FINAL_IDS_INVALIDOS');
    if (finals.some((r) => String(r.municipio_id) !== '728')) throw new Error('ESTADO_PREVIO_NO_ES_PUERTO_LLERAS');
    if (municipalities.length !== 2 || municipalities[0].nombre_municipio !== 'PUERTO LLERAS' || municipalities[0].codigo_dane !== '50577' || municipalities[1].nombre_municipio !== 'PUERTO RICO' || municipalities[1].codigo_dane !== '50590') throw new Error('MUNICIPIOS_INVALIDOS');
    const allowed = new Set(['LA SABANA', 'LA PRIMAVERA']);
    if (institutions.length !== 2 || institutions.some((r) => !allowed.has(institutionKey(r.nombre_institucion))) || sedes.length !== 24 || assignments.length !== 7) throw new Error('ALCANCE_INVALIDO');
    await client.query('COMMIT');
    console.log(JSON.stringify({ estado: 'PREFLIGHT_PASS', app_name: values.APP_NAME, host: url.host, database: url.pathname.slice(1), schema: 'public', identity, empresa_id: EMPRESA_ID, contrato_id: CONTRACT_ID, focalizacion_final: 687, target_final_ids: 25, institutions: 2, sedes: 24, combinations: 25, assignments: 7, writes: 0 }, null, 2));
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
