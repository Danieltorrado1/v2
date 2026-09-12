import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { Client } from 'pg';

const readFileAsync = promisify(readFile);
const CONTRACT_ID = 24;
const MUNICIPIO_NUEVO = 734;
const MUNICIPIO_ANTERIOR = 728;
const SNAPSHOT = 'reports/territorial-contract-24-pre-migration.json';
type Row = Record<string, any>;

const stable = (value: unknown): unknown => value instanceof Date ? value.toISOString() : value;
const comparable = (row: Row, ignored: string[] = []): Row => Object.fromEntries(Object.keys(row).filter((key) => !ignored.includes(key)).sort().map((key) => [key, stable(row[key])]));
const normalize = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
const institutionKey = (value: unknown): string => normalize(value).replace(/^CENTRO EDUCATIVO /, '').replace(/^CE /, '').replace(/^INSTITUCION EDUCATIVA /, '').replace(/^IE /, '');
const expectedAfter = (table: string, row: Row): Row => { const copy = { ...row }; if (['focalizacion_final', 'focalizacion_vigencias', 'instituciones', 'sedes', 'cobertura_asignaciones'].includes(table)) copy.municipio_id = MUNICIPIO_NUEVO; if (table === 'focalizacion_final') copy.municipio_texto = 'PUERTO RICO'; return copy; };

async function main(): Promise<void> {
  const values = dotenv.parse(readFileSync('.env', 'utf8')) as Record<string, string>;
  if (!values.DATABASE_URL) throw new Error('DATABASE_URL_MISSING');
  const snapshot = JSON.parse((await readFileAsync(SNAPSHOT, 'utf8')).toString()) as { metadata: Row; focalizacion_final: Row[]; focalizacion_vigencias: Row[]; instituciones: Row[]; sedes: Row[]; cobertura_asignaciones: Row[] };
  const client = new Client({ connectionString: values.DATABASE_URL, ssl: /supabase|pooler/.test(values.DATABASE_URL) ? { rejectUnauthorized: false } : false });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const finalIds = snapshot.focalizacion_final.map((row) => row.id);
    const institutionIds = snapshot.instituciones.map((row) => row.id);
    const sedeIds = snapshot.sedes.map((row) => row.id);
    const vigenciaIds = snapshot.focalizacion_vigencias.map((row) => row.id);
    const assignmentIds = snapshot.cobertura_asignaciones.map((row) => row.id);
    const finals = (await client.query(`SELECT * FROM focalizacion_final WHERE id=ANY($1::bigint[]) AND contrato_id=$2`, [finalIds, CONTRACT_ID])).rows as Row[];
    const vigencias = (await client.query(`SELECT * FROM focalizacion_vigencias WHERE id=ANY($1::bigint[]) AND contrato_id=$2`, [vigenciaIds, CONTRACT_ID])).rows as Row[];
    const institutions = (await client.query(`SELECT * FROM instituciones WHERE id=ANY($1::bigint[]) AND contrato_id=$2`, [institutionIds, CONTRACT_ID])).rows as Row[];
    const sedes = (await client.query(`SELECT * FROM sedes WHERE id=ANY($1::bigint[])`, [sedeIds])).rows as Row[];
    const assignments = (await client.query(`SELECT * FROM cobertura_asignaciones WHERE id=ANY($1::bigint[]) AND contrato_id=$2`, [assignmentIds, CONTRACT_ID])).rows as Row[];
    const preserved: Record<string, boolean> = {};
    for (const [table, before, after] of [['focalizacion_final', snapshot.focalizacion_final, finals], ['focalizacion_vigencias', snapshot.focalizacion_vigencias, vigencias], ['instituciones', snapshot.instituciones, institutions], ['sedes', snapshot.sedes, sedes], ['cobertura_asignaciones', snapshot.cobertura_asignaciones, assignments] ] as Array<[string, Row[], Row[]]>) {
      const current = new Map(after.map((row) => [String(row.id), row]));
      preserved[table] = before.length === after.length && before.every((row) => { const actual = current.get(String(row.id)); return actual && JSON.stringify(comparable(actual, ['updated_at', 'municipio_id', 'municipio_texto'])) === JSON.stringify(comparable(expectedAfter(table, row), ['updated_at', 'municipio_id', 'municipio_texto'])); });
    }
    const people = (await client.query(`SELECT p.numero_documento,concat_ws(' ',p.primer_nombre,p.segundo_nombre,p.primer_apellido,p.segundo_apellido) AS nombre,v.id AS vinculacion_id,ca.id AS asignacion_id,ca.focalizacion_final_id,f.municipio_id,f.institucion_final,f.sede_final,f.modalidad_final,v.fecha_inicio,v.fecha_fin FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id=ca.vinculacion_id JOIN personas p ON p.id=v.persona_id JOIN focalizacion_final f ON f.id=ca.focalizacion_final_id WHERE ca.id=ANY($1::bigint[]) ORDER BY p.numero_documento`, [assignmentIds])).rows as Row[];
    const legitimate = (await client.query(`SELECT nombre_institucion,municipio_id FROM instituciones WHERE contrato_id=$1 AND (upper(nombre_institucion) LIKE '%TIERRA GRATA%' OR upper(nombre_institucion) LIKE '%HECTOR JARAMILLO%' OR upper(nombre_institucion) LIKE '%CHARCO TRECE%' OR upper(nombre_institucion) LIKE '%MAJESTUOSO ARIARI%')`, [CONTRACT_ID])).rows as Row[];
    const audit = (await client.query(`SELECT count(*)::int AS count FROM auditoria WHERE accion='CORRECCION_TERRITORIAL_FOCALIZACION' AND registro_id='24'`)).rows[0];
    const totals = (await client.query(`SELECT count(*)::int AS total,coalesce(sum(cupos_aprobados),0)::int AS cupos,coalesce(sum(cobertura_requerida),0)::int AS cobertura FROM focalizacion_final WHERE contrato_id=$1`, [CONTRACT_ID])).rows[0];
    const municipalityCounts = (await client.query(`SELECT municipio_id,count(*)::int AS count FROM focalizacion_final WHERE id=ANY($1::bigint[]) GROUP BY municipio_id`, [finalIds])).rows;
    const distribution = (await client.query(`SELECT institucion_final,count(*)::int AS combinaciones,count(DISTINCT sede_id)::int AS sedes FROM focalizacion_final WHERE id=ANY($1::bigint[]) GROUP BY institucion_final ORDER BY institucion_final`, [finalIds])).rows;
    await client.query('COMMIT');
    const result = { estado: 'POSTCHECK', focalizacion_final: finals.length === 25 && municipalityCounts.length === 1 && String(municipalityCounts[0].municipio_id) === String(MUNICIPIO_NUEVO), distribution, vigencias: vigencias.length === 25 && vigencias.every((row) => String(row.municipio_id) === String(MUNICIPIO_NUEVO)), sedes: sedes.length === 24 && sedes.every((row) => String(row.municipio_id) === String(MUNICIPIO_NUEVO)), instituciones: institutions.length === 2 && institutions.every((row) => String(row.municipio_id) === String(MUNICIPIO_NUEVO)), assignments: assignments.length === 7 && assignments.every((row) => String(row.municipio_id) === String(MUNICIPIO_NUEVO)), preserved, people_count: people.length, people_all_puerto_rico: people.length === 7 && people.every((row) => String(row.municipio_id) === String(MUNICIPIO_NUEVO)), people, legitimate_puerto_lleras: legitimate.length === 4 && legitimate.every((row) => String(row.municipio_id) === String(MUNICIPIO_ANTERIOR)), audit_rows: Number(audit.count), totals, economic_sql_touched: false };
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
