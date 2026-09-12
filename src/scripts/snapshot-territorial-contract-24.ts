import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { Client } from 'pg';

const CONTRACT_ID = 24;
const EMPRESA_ID = 15;
const EXPECTED_FINAL_IDS = [...Array.from({ length: 9 }, (_, i) => 643 + i), ...Array.from({ length: 16 }, (_, i) => 666 + i)];
const OUT_FILE = 'reports/territorial-contract-24-pre-migration.json';

type Row = Record<string, unknown>;

const normalize = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
const loadConfig = (): { appName: string; databaseUrl: string; host: string; database: string; schema: string } => {
  const values = dotenv.parse(readFileSync('.env', 'utf8')) as Record<string, string>;
  if (!values.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const url = new URL(values.DATABASE_URL);
  return { appName: values.APP_NAME ?? '', databaseUrl: values.DATABASE_URL, host: url.host, database: url.pathname.slice(1), schema: 'public' };
};

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new Client({ connectionString: config.databaseUrl, ssl: /supabase|pooler/.test(config.databaseUrl) ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`SELECT current_database() AS database,current_schema() AS schema,current_user AS user_name,inet_server_addr()::text AS server_addr,inet_server_port() AS server_port`)).rows[0] as Row;
    const contract = (await client.query(`SELECT id,empresa_id,numero_contrato FROM contratos WHERE id=$1 AND empresa_id=$2`, [CONTRACT_ID, EMPRESA_ID])).rows[0] as Row | undefined;
    if (!contract) throw new Error('CONTRACT_24_EMPRESA_15_NOT_FOUND');
    const finals = (await client.query(`SELECT * FROM focalizacion_final WHERE id = ANY($1::bigint[]) AND contrato_id=$2 ORDER BY id`, [EXPECTED_FINAL_IDS, CONTRACT_ID])).rows as Row[];
    if (finals.length !== 25 || new Set(finals.map((row) => Number(row.id))).size !== 25) throw new Error(`FINAL_IDS_NOT_EXACT:${finals.length}`);
    const finalIds = finals.map((row) => Number(row.id));
    const institutionIds = [...new Set(finals.map((row) => Number(row.institucion_id)))];
    const sedeIds = [...new Set(finals.map((row) => Number(row.sede_id)))];
    const preliminarIds = [...new Set(finals.map((row) => Number(row.preliminar_id)))];
    const institutions = (await client.query(`SELECT * FROM instituciones WHERE id = ANY($1::bigint[]) AND contrato_id=$2 ORDER BY id`, [institutionIds, CONTRACT_ID])).rows as Row[];
    const sedes = (await client.query(`SELECT * FROM sedes WHERE id = ANY($1::bigint[]) ORDER BY id`, [sedeIds])).rows as Row[];
    const vigencias = (await client.query(`SELECT * FROM focalizacion_vigencias WHERE contrato_id=$1 AND preliminar_id = ANY($2::bigint[]) ORDER BY id`, [CONTRACT_ID, preliminarIds])).rows as Row[];
    const assignments = (await client.query(`SELECT * FROM cobertura_asignaciones WHERE contrato_id=$1 AND focalizacion_final_id = ANY($2::bigint[]) ORDER BY id`, [CONTRACT_ID, finalIds])).rows as Row[];
    const municipalities = (await client.query(`SELECT id,nombre_municipio,codigo_dane,departamento_id FROM municipios WHERE id IN (728,734) ORDER BY id`)).rows as Row[];
    const people = (await client.query(`SELECT p.id AS persona_id,p.numero_documento,concat_ws(' ',p.primer_nombre,p.segundo_nombre,p.primer_apellido,p.segundo_apellido) AS nombre,v.id AS vinculacion_id,ca.id AS cobertura_asignacion_id,ca.focalizacion_final_id,f.municipio_id,f.institucion_final,f.sede_final,f.modalidad_final,v.fecha_inicio,v.fecha_fin FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id=ca.vinculacion_id JOIN personas p ON p.id=v.persona_id JOIN focalizacion_final f ON f.id=ca.focalizacion_final_id WHERE ca.contrato_id=$1 AND ca.focalizacion_final_id = ANY($2::bigint[]) ORDER BY p.numero_documento`, [CONTRACT_ID, finalIds])).rows as Row[];
    if (institutions.length !== 2 || new Set(institutions.map((row) => normalize(row.nombre_institucion))).size !== 2) throw new Error(`INSTITUTIONS_NOT_EXACT:${institutions.length}`);
    if (sedes.length !== 24 || new Set(sedes.map((row) => Number(row.id))).size !== 24) throw new Error(`SEDES_NOT_EXACT:${sedes.length}`);
    if (new Set(finals.map((row) => `${row.sede_id}|${normalize(row.modalidad_final)}`)).size !== 25) throw new Error('COMBINATIONS_NOT_EXACT');
    const snapshot = { metadata: { captured_at: new Date().toISOString(), app_name: config.appName, host: config.host, database: config.database, schema: config.schema, identity, empresa_id: EMPRESA_ID, contrato_id: CONTRACT_ID, expected_final_ids: EXPECTED_FINAL_IDS, final_count: finals.length, institution_count: institutions.length, sede_count: sedes.length, combination_count: 25, assignment_count: assignments.length, source_read_only: true }, municipalities, contract, focalizacion_final: finals, focalizacion_vigencias: vigencias, instituciones: institutions, sedes, cobertura_asignaciones: assignments, personas_relacionadas: people };
    await client.query('COMMIT');
    await mkdir('reports', { recursive: true });
    await writeFile(OUT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log(JSON.stringify({ estado: 'SNAPSHOT_OK', archivo: OUT_FILE, app_name: config.appName, host: config.host, database: config.database, final_count: finals.length, institution_count: institutions.length, sede_count: sedes.length, combination_count: 25, assignment_count: assignments.length, persona_rows: people.length, source_read_only: true }, null, 2));
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
