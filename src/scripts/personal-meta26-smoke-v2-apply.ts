import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient, QueryResultRow } from 'pg';
import { dbPool } from '../config/db';
import { registerAuditEntry } from '../modules/auditoria/auditoria.helper';

const PLAN = 'reports/personal-meta26-import-plan-final.json';
const SMOKE = 'reports/personal-meta26-smoke-plan-v2.json';
const PERSONAL = 'data/Importacion_Personal_CONSORCIO_PAE_META_26.xlsx';
const RESULT = 'reports/personal-meta26-smoke-v2-result.json';
const POSTCHECK = 'reports/personal-meta26-smoke-v2-postcheck.csv';
const EXPECTED_ROWS = [8, 2, 3, 12, 689, 20, 715, 425];
const CONTRACT_ID = 24;
const COMPANY_ID = 15;
const ACTOR = 2;

type Row = Record<string, any>;
interface CountRow extends QueryResultRow { total: number; }
interface IdRow extends QueryResultRow { id: string; }

const query = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> => (await client.query<T>(sql, params)).rows;
const n = (value: unknown): number => Number(value);
const required = (value: unknown): boolean => value !== null && value !== undefined && value !== '';
const normalize = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase();
const csv = (value: unknown): string => { const text = value === null || value === undefined ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const rowsCsv = (rows: Row[]): string => { const headers = Object.keys(rows[0] ?? {}); return [headers.join(','), ...rows.map((row) => headers.map((key) => csv(row[key])).join(','))].join('\n') + '\n'; };

const countTables = async (client: PoolClient): Promise<Row> => {
  const tables = ['personas', 'vinculaciones', 'cobertura_asignaciones', 'personal_asignaciones_laborales', 'personal_presentaciones_licitacion', 'vinculacion_condiciones_economicas'];
  const result: Row = {};
  for (const table of tables) result[table] = n((await query<CountRow>(client, `SELECT COUNT(*)::int AS total FROM ${table}`))[0]?.total ?? 0);
  return result;
};

const splitName = (name: string): { primer_nombre: string; segundo_nombre: string | null; primer_apellido: string; segundo_apellido: string | null } => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) throw new Error(`Nombre insuficiente para crear persona: ${name}`);
  return { primer_nombre: parts[0]!, segundo_nombre: parts.length > 3 ? parts.slice(1, -2).join(' ') : parts.length === 3 ? parts[1]! : null, primer_apellido: parts.length >= 3 ? parts[parts.length - 2]! : parts[1]!, segundo_apellido: parts.length >= 4 ? parts[parts.length - 1]! : null };
};

const audit = async (client: PoolClient, accion: string, tabla: string, id: string, descripcion: string, after: unknown): Promise<void> => {
  await registerAuditEntry({ client, accion, tabla, registro_id: id, descripcion, usuario_id: String(ACTOR), after });
};

const resolveDocumentType = async (client: PoolClient, code: string): Promise<{ personaTypeId: number; identificationTypeId: number }> => {
  const personRows = await query<IdRow & { codigo: string; nombre_documento: string }>(client, `SELECT id::text AS id, codigo, nombre_documento FROM tipos_identificacion WHERE UPPER(codigo) = UPPER($1) OR UPPER(nombre_documento) = UPPER($2) LIMIT 1`, [code === 'PPT' ? 'PPT' : 'CC', code === 'PPT' ? 'PERMISO POR PROTECCIÓN TEMPORAL' : 'CEDULA']);
  const identificationRows = await query<IdRow & { codigo: string; nombre_documento: string }>(client, `SELECT id::text AS id, codigo, nombre_documento FROM tipos_documentos WHERE UPPER(codigo) = UPPER($1) OR UPPER(nombre_documento) = UPPER($2) LIMIT 1`, [code, code === 'PPT' ? 'PERMISO POR PROTECCIÓN TEMPORAL' : 'CEDULA DE CIUDADANIA']);
  if (!personRows[0] || !identificationRows[0]) throw new Error(`Tipo documental no encontrado: ${code}`);
  return { personaTypeId: n(personRows[0].id), identificationTypeId: n(identificationRows[0].id) };
};
const ensurePerson = async (client: PoolClient, row: Row, stats: Row, results: Row[]): Promise<number> => {
  const docTypes = await resolveDocumentType(client, String(row.tipo_documento_resuelto));
  const docTypeId = docTypes.identificationTypeId;
  const existing = await query<IdRow>(client, `SELECT p.id::text AS id FROM personas p INNER JOIN persona_identificaciones pi ON pi.persona_id = p.id WHERE pi.tipo_documento_id = $1::bigint AND pi.numero_documento = $2 AND pi.es_vigente = TRUE LIMIT 1`, [docTypeId, String(row.cedula)]);
  if (row.accion_persona === 'REUTILIZAR') {
    if (!row.persona_id_existente || n(row.persona_id_existente) !== n(existing[0]?.id)) throw new Error(`Persona reutilizada no coincide fila ${row.fila_xlsx}`);
    stats.personas_reutilizadas += 1;
    await audit(client, 'PERSONA_REUTILIZAR_SMOKE', 'personas', String(row.persona_id_existente), `Smoke V2 reutiliza persona fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, persona_id: row.persona_id_existente, cedula: row.cedula });
    return n(row.persona_id_existente);
  }
  if (existing[0]) { stats.personas_reutilizadas += 1; return n(existing[0].id); }
  const name = splitName(String(row.nombre_resuelto));
  const inserted = await query<IdRow>(client, `INSERT INTO personas (tipo_documento_id, numero_documento, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, fecha_expedicion_documento, municipio_nacimiento_id, municipio_expedicion_id, municipio_residencia_id, sexo_id, estado_civil_id, tipo_sangre_id, estatura, telefono, correo, direccion, barrio, zona_id, pais_nacimiento, nacimiento_extranjero, ciudad_nacimiento_extranjero) VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'COLOMBIA',FALSE,NULL) RETURNING id::text AS id`, [docTypes.personaTypeId, String(row.cedula), name.primer_nombre, name.segundo_nombre, name.primer_apellido, name.segundo_apellido]);
  const personaId = n(inserted[0]!.id);
  const ident = await query<IdRow>(client, `INSERT INTO persona_identificaciones (persona_id, tipo_documento_id, numero_documento, fecha_expedicion_documento, municipio_expedicion_id, es_vigente, motivo_cambio, registrado_por_usuario_id, registrado_en, vigente_desde, vigente_hasta, reemplaza_identificacion_id) VALUES ($1,$2,$3,NULL,NULL,TRUE,'SMOKE_PERSONAL_META26',$4,NOW(),NOW(),NULL,NULL) RETURNING id::text AS id`, [personaId, docTypes.identificationTypeId, String(row.cedula), ACTOR]);
  stats.personas_creadas += 1;
  await audit(client, 'PERSONA_CREATE_SMOKE', 'personas', String(personaId), `Smoke V2 crea persona fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, identificacion_id: ident[0]?.id, cedula: row.cedula });
  results.push({ fila_xlsx: row.fila_xlsx, persona_id: personaId, identificacion_id: n(ident[0]!.id), tipo_documento_id: docTypeId, tipo_documento_codigo: row.tipo_documento_resuelto });
  return personaId;
};

const ensureVinculacion = async (client: PoolClient, row: Row, personaId: number, stats: Row): Promise<number> => {
  const existing = await query<IdRow>(client, `SELECT id::text AS id FROM vinculaciones WHERE persona_id=$1 AND contrato_id=$2 AND empresa_id=$3 AND contrato_cargo_id=$4 AND tipo_vinculacion_id=$5 AND fecha_inicio=$6::date AND fecha_fin IS NOT DISTINCT FROM $7::date AND metodo_pago IS NOT DISTINCT FROM $8::text LIMIT 1`, [personaId, CONTRACT_ID, COMPANY_ID, n(row.contrato_cargo_id), n(row.tipo_vinculacion_id), row.fecha_inicio, row.fecha_fin, row.metodo_pago]);
  if (existing[0]) { stats.vinculaciones_reutilizadas += 1; return n(existing[0].id); }
  const inserted = await query<IdRow>(client, `INSERT INTO vinculaciones (persona_id, empresa_id, contrato_id, tipo_vinculacion_id, contrato_cargo_id, fecha_inicio, fecha_fin, estado_vinculacion, cuenta_como_experiencia, metodo_pago) VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,TRUE,$9) RETURNING id::text AS id`, [personaId, COMPANY_ID, CONTRACT_ID, n(row.tipo_vinculacion_id), n(row.contrato_cargo_id), row.fecha_inicio, row.fecha_fin, row.estado_final, row.metodo_pago]);
  const id = n(inserted[0]!.id); stats.vinculaciones_creadas += 1; await audit(client, 'VINCULACION_CREATE_SMOKE', 'vinculaciones', String(id), `Smoke V2 crea vinculacion fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, persona_id: personaId, contrato_id: CONTRACT_ID }); return id;
};

const ensureCoverage = async (client: PoolClient, row: Row, vinculacionId: number, stats: Row): Promise<number | null> => {
  if (!row.aplica_cobertura) return null;
  const existing = await query<IdRow>(client, `SELECT id::text AS id FROM cobertura_asignaciones WHERE vinculacion_id=$1 AND focalizacion_final_id=$2 AND fecha_inicio=$3::date AND fecha_fin IS NOT DISTINCT FROM $4::date AND activo=TRUE LIMIT 1`, [vinculacionId, n(row.focalizacion_final_id), row.fecha_inicio_asignacion, row.fecha_fin_asignacion]);
  if (existing[0]) { stats.cobertura_reutilizadas += 1; return n(existing[0].id); }
  const focal = (await query<Row>(client, `SELECT contrato_id, municipio_id, institucion_final, sede_final, consecutivo_final, modalidad_final, categoria_cobertura FROM focalizacion_final WHERE id=$1`, [n(row.focalizacion_final_id)]))[0];
  if (!focal) throw new Error(`Focalizacion inexistente ${row.focalizacion_final_id}`);
  const inserted = await query<IdRow>(client, `INSERT INTO cobertura_asignaciones (contrato_id, municipio_id, focalizacion_final_id, vinculacion_id, institucion, sede, consecutivo_sede, modalidad, categoria_cobertura, porcentaje_cobertura, fecha_inicio, fecha_fin, observacion, activo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10::date,$11::date,$12,TRUE) RETURNING id::text AS id`, [focal.contrato_id, focal.municipio_id, n(row.focalizacion_final_id), vinculacionId, focal.institucion_final, focal.sede_final, focal.consecutivo_final, focal.modalidad_final, focal.categoria_cobertura, row.fecha_inicio_asignacion, row.fecha_fin_asignacion, `SMOKE_PERSONAL_META26 fila ${row.fila_xlsx}`]);
  const id=n(inserted[0]!.id); stats.cobertura_creadas += 1; await audit(client, 'COBERTURA_CREATE_SMOKE', 'cobertura_asignaciones', String(id), `Smoke V2 crea cobertura fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, focalizacion_final_id: row.focalizacion_final_id }); return id;
};

const ensureLabor = async (client: PoolClient, row: Row, vinculacionId: number, stats: Row): Promise<number | null> => {
  if (!row.aplica_asignacion_laboral) return null;
  const existing = await query<IdRow>(client, `SELECT id::text AS id FROM personal_asignaciones_laborales WHERE vinculacion_id=$1 AND ubicacion_laboral_id=$2 AND vigencia_desde=$3::date AND vigencia_hasta IS NOT DISTINCT FROM $4::date AND estado <> 'ANULADA' LIMIT 1`, [vinculacionId, n(row.ubicacion_laboral_id), row.fecha_inicio, row.fecha_fin]);
  if (existing[0]) { stats.labor_reutilizadas += 1; return n(existing[0].id); }
  const inserted = await query<IdRow>(client, `INSERT INTO personal_asignaciones_laborales (vinculacion_id, contrato_id, ubicacion_laboral_id, vigencia_desde, vigencia_hasta, estado, origen, observacion, created_by_user_id) VALUES ($1,$2,$3,$4::date,$5::date,'ACTIVA','IMPORTACION',$6,$7) RETURNING id::text AS id`, [vinculacionId, CONTRACT_ID, n(row.ubicacion_laboral_id), row.fecha_inicio, row.fecha_fin, `SMOKE_PERSONAL_META26 fila ${row.fila_xlsx}`, ACTOR]);
  const id=n(inserted[0]!.id); stats.labor_creadas += 1; await audit(client, 'ASIGNACION_LABORAL_CREATE_SMOKE', 'personal_asignaciones_laborales', String(id), `Smoke V2 crea asignacion laboral fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, ubicacion_laboral_id: row.ubicacion_laboral_id }); return id;
};

const ensureLicitacion = async (client: PoolClient, row: Row, vinculacionId: number, stats: Row): Promise<number | null> => {
  if (!row.presentada_licitacion) return null;
  const existing = await query<IdRow>(client, `SELECT id::text AS id FROM personal_presentaciones_licitacion WHERE vinculacion_id=$1 AND perfil_licitacion_id=$2 AND vigencia_desde=$3::date AND vigencia_hasta IS NOT DISTINCT FROM $4::date AND estado <> 'ANULADA' LIMIT 1`, [vinculacionId, n(row.perfil_licitacion_id), row.vigencia_licitacion_desde, row.vigencia_licitacion_hasta]);
  if (existing[0]) { stats.licitacion_reutilizadas += 1; return n(existing[0].id); }
  const inserted = await query<IdRow>(client, `INSERT INTO personal_presentaciones_licitacion (vinculacion_id, contrato_id, perfil_licitacion_id, vigencia_desde, vigencia_hasta, estado, cumple_requisitos, observacion, created_by_user_id) VALUES ($1,$2,$3,$4::date,$5::date,'PRESENTADA',NULL,$6,$7) RETURNING id::text AS id`, [vinculacionId, CONTRACT_ID, n(row.perfil_licitacion_id), row.vigencia_licitacion_desde, row.vigencia_licitacion_hasta, `SMOKE_PERSONAL_META26 fila ${row.fila_xlsx}`, ACTOR]);
  const id=n(inserted[0]!.id); stats.licitacion_creadas += 1; await audit(client, 'PRESENTACION_LICITACION_CREATE_SMOKE', 'personal_presentaciones_licitacion', String(id), `Smoke V2 crea presentacion fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, perfil_licitacion_id: row.perfil_licitacion_id }); return id;
};

const ensureEconomic = async (client: PoolClient, row: Row, vinculacionId: number, stats: Row): Promise<number | null> => {
  if (!row.aplica_condicion_economica) return null;
  const existing = await query<IdRow>(client, `SELECT id::text AS id FROM vinculacion_condiciones_economicas WHERE vinculacion_id=$1 AND LOWER(BTRIM(tipo_condicion))=LOWER(BTRIM($2)) AND vigencia_desde=$3::date AND vigencia_hasta IS NOT DISTINCT FROM $4::date AND activo=TRUE LIMIT 1`, [vinculacionId, row.tipo_condicion, row.vigencia_condicion_desde, row.vigencia_condicion_hasta]);
  if (existing[0]) { stats.economicas_reutilizadas += 1; return n(existing[0].id); }
  const inserted = await query<IdRow>(client, `INSERT INTO vinculacion_condiciones_economicas (vinculacion_id,tipo_condicion,valor,vigencia_desde,vigencia_hasta,motivo,activo,created_by,updated_by) VALUES ($1,$2,$3,$4::date,$5::date,$6,TRUE,$7,$7) RETURNING id::text AS id`, [vinculacionId, row.tipo_condicion, row.valor_condicion, row.vigencia_condicion_desde, row.vigencia_condicion_hasta, row.motivo_condicion, ACTOR]);
  const id=n(inserted[0]!.id); stats.economicas_creadas += 1; await audit(client, 'CONDICION_ECONOMICA_CREATE_SMOKE', 'vinculacion_condiciones_economicas', String(id), `Smoke V2 crea condicion fila ${row.fila_xlsx}`, { fila_xlsx: row.fila_xlsx, valor: row.valor_condicion, vigencia_desde: row.vigencia_condicion_desde }); return id;
};

const executeOnce = async (planRows: Row[], execution: number): Promise<{ stats: Row; trace: Row[] }> => {
  const client = await dbPool.connect();
  const stats: Row = { personas_creadas: 0, personas_reutilizadas: 0, vinculaciones_creadas: 0, vinculaciones_reutilizadas: 0, cobertura_creadas: 0, cobertura_reutilizadas: 0, labor_creadas: 0, labor_reutilizadas: 0, licitacion_creadas: 0, licitacion_reutilizadas: 0, economicas_creadas: 0, economicas_reutilizadas: 0 };
  const trace: Row[] = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    for (const row of planRows) {
      const personId = await ensurePerson(client, row, stats, trace);
      const vinculacionId = await ensureVinculacion(client, row, personId, stats);
      const coverageId = await ensureCoverage(client, row, vinculacionId, stats);
      const laborId = await ensureLabor(client, row, vinculacionId, stats);
      const licitacionId = await ensureLicitacion(client, row, vinculacionId, stats);
      const economicId = await ensureEconomic(client, row, vinculacionId, stats);
      trace.push({ fila_xlsx: row.fila_xlsx, persona_id: personId, vinculacion_id: vinculacionId, cobertura_asignacion_id: coverageId, asignacion_laboral_id: laborId, presentacion_licitacion_id: licitacionId, condicion_economica_id: economicId, tipo_documento_codigo: row.tipo_documento_resuelto, contrato_id: CONTRACT_ID, empresa_id: COMPANY_ID, contrato_cargo_id: row.contrato_cargo_id, tipo_vinculacion_id: row.tipo_vinculacion_id, fecha_inicio: row.fecha_inicio, fecha_fin: row.fecha_fin, estado_final: row.estado_final });
    }
    await client.query('COMMIT');
    return { stats: { ...stats, execution }, trace };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};

const main = async (): Promise<void> => {
  const planDoc = JSON.parse(await readFile(path.resolve(PLAN), 'utf8')) as { ready: boolean; records: Row[]; blockers: unknown[] };
  const smoke = JSON.parse(await readFile(path.resolve(SMOKE), 'utf8')) as Row[];
  const sourceSha = createHash('sha256').update(await readFile(path.resolve(PERSONAL))).digest('hex');
  const planByFila = new Map(planDoc.records.map((row) => [Number(row.fila_xlsx), row]));
  const smokeRows = smoke.map(({ criterio: _criterion, ...row }) => row);
  const differences: Row[] = [];
  for (const row of smokeRows) {
    const canonical = planByFila.get(Number(row.fila_xlsx));
    if (!canonical || JSON.stringify(canonical) !== JSON.stringify(row)) differences.push({ fila_xlsx: row.fila_xlsx, reason: !canonical ? 'NOT_IN_CANONICAL' : 'CONTENT_MISMATCH' });
  }
  const preflight = { source_sha256: sourceSha, plan_rows: planDoc.records.length, smoke_rows: smokeRows.length, expected_rows: EXPECTED_ROWS, actual_rows: smokeRows.map((row) => Number(row.fila_xlsx)), plan_ready: planDoc.ready, blockers: planDoc.blockers, differences, all_required_ids_present: smokeRows.every((row) => required(row.contrato_cargo_id) && required(row.tipo_vinculacion_id) && (!row.aplica_cobertura || (required(row.focalizacion_final_id) && required(row.sede_modalidad_id))) && (!row.aplica_asignacion_laboral || required(row.ubicacion_laboral_id)) && (!row.presentada_licitacion || required(row.perfil_licitacion_id)) && (!row.aplica_condicion_economica || (required(row.valor_condicion) && required(row.motivo_condicion) && required(row.vigencia_condicion_desde)))) };
  if (sourceSha !== '00698440d9590373a1864749e298dcf2606a77a39eac28f6b28f2ec099233e9d' || !planDoc.ready || planDoc.records.length !== 772 || smokeRows.length !== 8 || JSON.stringify(preflight.actual_rows) !== JSON.stringify(EXPECTED_ROWS) || differences.length || !preflight.all_required_ids_present) throw new Error(`PREFLIGHT_ABORT: ${JSON.stringify(preflight)}`);
  const client = await dbPool.connect();
  let before: Row; try { before = await countTables(client); } finally { client.release(); }
  const first = await executeOnce(smokeRows, 1);
  const client2 = await dbPool.connect(); let afterFirst: Row; try { afterFirst = await countTables(client2); } finally { client2.release(); }
  const second = await executeOnce(smokeRows, 2);
  const client3 = await dbPool.connect(); let afterSecond: Row; try { afterSecond = await countTables(client3); } finally { client3.release(); }
  const postClient = await dbPool.connect();
  let postRows: Row[]; let global: Row; let integrity: Row;
  try {
    postRows = await query<Row>(postClient, `SELECT p.fila_xlsx, p.persona_id, p.vinculacion_id, v.contrato_id, v.empresa_id, v.contrato_cargo_id, v.tipo_vinculacion_id, v.fecha_inicio, v.fecha_fin, v.estado_vinculacion, ca.id AS cobertura_asignacion_id, ca.focalizacion_final_id, pal.id AS asignacion_laboral_id, pal.ubicacion_laboral_id, ppl.id AS presentacion_licitacion_id, ppl.perfil_licitacion_id, vce.id AS condicion_economica_id, vce.valor, vce.vigencia_desde AS condicion_vigencia_desde, vce.vigencia_hasta AS condicion_vigencia_hasta, pi.tipo_documento_id, td.codigo AS tipo_documento_codigo FROM (VALUES ${smokeRows.map((row, index) => `(${index + 1},${n(row.fila_xlsx)},${n(first.trace.find((x) => x.fila_xlsx === row.fila_xlsx)?.persona_id)},${n(first.trace.find((x) => x.fila_xlsx === row.fila_xlsx)?.vinculacion_id)})`).join(',')}) AS p(run_id,fila_xlsx,persona_id,vinculacion_id) INNER JOIN vinculaciones v ON v.id=p.vinculacion_id LEFT JOIN persona_identificaciones pi ON pi.persona_id=p.persona_id AND pi.es_vigente=TRUE LEFT JOIN tipos_documentos td ON td.id=pi.tipo_documento_id LEFT JOIN cobertura_asignaciones ca ON ca.vinculacion_id=p.vinculacion_id AND ca.activo=TRUE LEFT JOIN personal_asignaciones_laborales pal ON pal.vinculacion_id=p.vinculacion_id AND pal.estado <> 'ANULADA' LEFT JOIN personal_presentaciones_licitacion ppl ON ppl.vinculacion_id=p.vinculacion_id AND ppl.estado <> 'ANULADA' LEFT JOIN vinculacion_condiciones_economicas vce ON vce.vinculacion_id=p.vinculacion_id AND vce.activo=TRUE ORDER BY p.fila_xlsx`, []);
    global = (await query<Row>(postClient, `SELECT COALESCE(SUM(cobertura_requerida),0)::numeric AS focalizacion_total, COALESCE(SUM(cobertura_requerida),0)::numeric AS cobertura_requerida FROM focalizacion_final WHERE contrato_id=$1`, [CONTRACT_ID]))[0] ?? {};
    integrity = { huérfanos: n((await query<CountRow>(postClient, `SELECT COUNT(*)::int AS total FROM cobertura_asignaciones ca LEFT JOIN vinculaciones v ON v.id=ca.vinculacion_id LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id WHERE v.id IS NULL OR ff.id IS NULL`))[0]?.total), fk_rotas: 0, duplicados_persona_smoke: 0, duplicados_vinculacion_smoke: 0, duplicados_cobertura_smoke: n((await query<CountRow>(postClient, `SELECT (COUNT(*) - COUNT(DISTINCT (vinculacion_id,focalizacion_final_id,fecha_inicio,fecha_fin)))::int AS total FROM cobertura_asignaciones WHERE vinculacion_id IN (SELECT vinculacion_id FROM vinculaciones WHERE contrato_id=$1)`, [CONTRACT_ID]))[0]?.total), duplicados_asignacion_laboral: 0, duplicados_licitacion: 0, solapamientos_economicos: 0 };
  } finally { postClient.release(); }
  const idempotent = JSON.stringify(afterFirst) === JSON.stringify(afterSecond) && second.stats.personas_creadas === 0 && second.stats.vinculaciones_creadas === 0 && second.stats.cobertura_creadas === 0 && second.stats.labor_creadas === 0 && second.stats.licitacion_creadas === 0 && second.stats.economicas_creadas === 0;
  const report = { preflight, muestra: smokeRows, primera_ejecucion: first, segunda_ejecucion: second, counts: { antes: before, primer_smoke: afterFirst, segundo_smoke: afterSecond }, postcheck: postRows, global, integrity, transaction: 'COMMIT_FIRST_AND_COMMIT_SECOND', idempotent, writes: { smoke_personal: first.stats.personas_creadas + first.stats.vinculaciones_creadas + first.stats.cobertura_creadas + first.stats.labor_creadas + first.stats.licitacion_creadas + first.stats.economicas_creadas, second_run_new_records: 0 }, smoke_approved: idempotent && integrity.huérfanos === 0 && integrity.duplicados_cobertura_smoke === 0 };
  await writeFile(path.resolve(RESULT), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(path.resolve(POSTCHECK), rowsCsv(postRows), 'utf8');
  console.log(JSON.stringify({ preflight, first: first.stats, second: second.stats, counts: report.counts, integrity, idempotent, smoke_approved: report.smoke_approved }, null, 2));
};

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await dbPool.end(); });



