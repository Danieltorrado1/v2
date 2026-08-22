import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool } from '../config/db';

const PERSONAL_FILE = 'data/Importacion_Personal_CONSORCIO_PAE_META_26.xlsx';
const V4_FILE = 'reports/personal-meta26-dry-run-v4.json';
const FINAL_FILE = 'reports/personal-meta26-final-real-dry-run.json';
const DECISIONS_FILE = 'reports/DECISIONES_REALES_PERSONAL_META26.xlsx';
const PLAN_FILE = 'reports/personal-meta26-import-plan-final.json';
const PLAN_CSV = 'reports/personal-meta26-import-plan-final.csv';
const CONSISTENCY_FILE = 'reports/personal-meta26-plan-consistency.json';
const SMOKE_FILE = 'reports/personal-meta26-smoke-plan-v2.json';
const SMOKE_CSV = 'reports/personal-meta26-smoke-plan-v2.csv';
const CONTRACT_ID = 24;
const COMPANY_ID = 15;
const RETIREMENT_DATE = '2026-08-02';

type Row = Record<string, unknown>;
type V4Row = Row & {
  fila_origen: number;
  cedula: string | null;
  nombre: string | null;
  categoria_final: string;
  persona_plan: string;
  persona_existente_id: number | null;
  cargo_origen: string | null;
  cargo_resuelto: string | null;
  tipo_vinculacion_resuelto: string | null;
  tipo_contrato_origen: string | null;
  metodo_pago_origen: string | null;
  fecha_inicio_xlsx: string | null;
  fecha_fin_xlsx: string | null;
  fecha_retiro_disponible: string | null;
  subtipo_retiro: string | null;
  municipio_origen: string | null;
  institucion_origen: string | null;
  sede_origen: string | null;
  modalidad_origen: string | null;
  municipio_propuesto: string | null;
  institucion_propuesta: string | null;
  sede_propuesta: string | null;
  modalidad_propuesta: string | null;
  sede_modalidad_id: number | null;
  ubicacion_resuelta: string | null;
  ubicacion_operativa_origen: string | null;
  licitacion_perfil_resuelto: string | null;
  tipo_documento_resuelto: string | null;
  vinculacion_plan: string;
  vinculacion_existente_id: number | null;
};

type FinalState = { fila_xlsx: number; category: string; cedula: string };

interface CatalogRow extends QueryResultRow { id: number; codigo: string | null; nombre: string | null; }
interface FocalRow extends QueryResultRow {
  focalizacion_final_id: number;
  sede_modalidad_id: number | null;
  sede_id: number | null;
  institucion_id: number | null;
  municipio_id: number | null;
  modalidad_id: number | null;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
}
interface ProfileRow extends QueryResultRow { id: number; codigo_perfil: string; nombre_perfil: string; contrato_cargo_equivalente_id: number | null; }
interface LocationRow extends QueryResultRow { id: number; nombre_ubicacion: string; }

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ÃƒÂ¡|ÃƒÂ©|ÃƒÂ­|ÃƒÂ³|ÃƒÂº|ÃƒÂ±/g, (x) => ({ 'ÃƒÂ¡': 'a', 'ÃƒÂ©': 'e', 'ÃƒÂ­': 'i', 'ÃƒÂ³': 'o', 'ÃƒÂº': 'u', 'ÃƒÂ±': 'n' }[x] ?? x))
  .replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase();

const dateFromExcel = (value: unknown): string | null => {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
};

const query = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await client.query<T>(sql, params)).rows;

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const buildCsv = (rows: Row[]): string => {
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n') + '\n';
};

const parseDecisionRows = (workbook: XLSX.WorkBook): Map<number, Row[]> => {
  const result = new Map<number, Row[]>();
  for (const sheet of ['FECHAS', 'IDENTIDADES', 'CASOS_ESPECIALES', 'UBICACIONES', 'CATALOGOS']) {
    for (const row of XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheet]!, { defval: '' })) {
      const fila = Number(row.FILA_XLSX);
      if (!fila) continue;
      const existing = result.get(fila) ?? [];
      existing.push({ ...row, __sheet: sheet });
      result.set(fila, existing);
    }
  }
  return result;
};

const decisionDate = (rows: Row[], problem: string): string | null => {
  const row = rows.find((item) => String(item.PROBLEMA) === problem);
  return row ? dateFromExcel(row.VALOR_USUARIO) : null;
};

const caseDecision = (rows: Row[]): { valor: number | null; motivo: string | null; desde: string | null; hasta: string | null } => {
  const row = rows.find((item) => item.__sheet === 'CASOS_ESPECIALES');
  if (!row) return { valor: null, motivo: null, desde: null, hasta: null };
  const valor = Number(row.VALOR_USUARIO);
  const motivo = String(row.OBSERVACION_USUARIO ?? '').trim() || null;
  const dates = [...(String(row.OBSERVACION_USUARIO ?? '').matchAll(/\b\d{4}-\d{2}-\d{2}\b/g))].map((m) => m[0]);
  return { valor: Number.isFinite(valor) && valor > 0 ? valor : null, motivo, desde: dates[0] ?? (new Set([20, 181, 324, 518]).has(Number(row.FILA_XLSX)) ? '2026-07-29' : null), hasta: dates[1] ?? null };
};

const main = async (): Promise<void> => {
  const personalBuffer = await readFile(path.resolve(PERSONAL_FILE));
  const sha = createHash('sha256').update(personalBuffer).digest('hex');
  const v4 = JSON.parse(await readFile(path.resolve(V4_FILE), 'utf8')) as { report_rows: V4Row[] };
  const final = JSON.parse(await readFile(path.resolve(FINAL_FILE), 'utf8')) as { row_states: FinalState[]; categories: Record<string, number>; total_filas: number };
  const decisionsWorkbook = XLSX.readFile(path.resolve(DECISIONS_FILE), { cellDates: false });
  const decisions = parseDecisionRows(decisionsWorkbook);
  const finalStates = new Map(final.row_states.map((row) => [row.fila_xlsx, row]));
  const sourceWorkbook = XLSX.read(personalBuffer, { type: 'buffer', cellDates: false });
  const sourceRows = XLSX.utils.sheet_to_json<Row>(sourceWorkbook.Sheets.IMPORTACION_META!, { defval: '' });
  const retirementAuditWorkbook = XLSX.readFile(path.resolve('reports/AUDITORIA_DECISIONES_PERSONAL_META26.xlsx'), { cellDates: false });
  const retiredDocuments = new Set(XLSX.utils.sheet_to_json<Row>(retirementAuditWorkbook.Sheets.RETIROS!, { defval: '' }).filter((item) => String(item.VALOR_USUARIO).trim() === '2026-08-02').map((item) => String(item.CEDULA).trim()));

  const client = await dbPool.connect();
  try {
    const cargos = await query<CatalogRow>(client, `SELECT id, NULL::text AS codigo, nombre_cargo AS nombre FROM contrato_cargos WHERE contrato_id = $1::bigint `, [CONTRACT_ID]);
    const tipos = await query<CatalogRow>(client, `SELECT id, codigo, nombre_vinculacion AS nombre FROM tipos_vinculacion`);
    const docs = await query<CatalogRow>(client, `SELECT id, codigo, nombre_documento AS nombre FROM tipos_documentos`);
    const locations = await query<LocationRow>(client, `SELECT id, nombre_ubicacion FROM contrato_ubicaciones_laborales WHERE contrato_id = $1::bigint AND activo = TRUE`, [CONTRACT_ID]);
    const profiles = await query<ProfileRow>(client, `SELECT id, codigo_perfil, nombre_perfil, contrato_cargo_equivalente_id FROM contrato_perfiles_licitacion WHERE contrato_id = $1::bigint AND activo = TRUE`, [CONTRACT_ID]);
    const focal = await query<FocalRow>(client, `
      SELECT ff.id AS focalizacion_final_id, ff.sede_modalidad_id, ff.sede_id, ff.institucion_id, ff.municipio_id, ff.modalidad_id,
        ff.municipio_texto AS municipio, COALESCE(ff.institucion_final, i.nombre_institucion) AS institucion,
        ff.sede_final AS sede, ff.modalidad_final AS modalidad
      FROM focalizacion_final ff
      LEFT JOIN instituciones i ON i.id = ff.institucion_id
      WHERE ff.contrato_id = $1::bigint AND COALESCE(ff.activo, TRUE) = TRUE`, [CONTRACT_ID]);

    const blockers: Array<{ fila_xlsx: number; cedula: string | null; code: string; detail: string }> = [];
    const plans: Row[] = [];
    for (const row of v4.report_rows) {
      const source = sourceRows[row.fila_origen - 2] ?? {};
      const decisionRows = decisions.get(row.fila_origen) ?? [];
      const state = finalStates.get(row.fila_origen);
      const retired = retiredDocuments.has(String(row.cedula).trim());
      const category = retired
        ? 'IMPORTAR_RETIRADA_HISTORICA'
        : state?.category ?? (row.categoria_final === 'LISTA_IMPORTAR_SIN_COBERTURA' ? 'IMPORTAR_ACTIVA_SIN_COBERTURA' : 'IMPORTAR_ACTIVA_CON_COBERTURA');
      const cargoName = row.cargo_resuelto ?? row.cargo_origen;
      const legalName = decisionRows.find((item) => item.__sheet === 'IDENTIDADES' && String(item.PROBLEMA) === 'NOMBRE_LEGAL_FALTANTE')?.VALOR_USUARIO;
      const resolvedName = String(legalName ?? row.nombre ?? '').trim() || null;
      const profileName = row.licitacion_perfil_resuelto ?? null;
      const profile = profileName ? profiles.find((item) => normalize(item.codigo_perfil) === normalize(profileName) || normalize(item.nombre_perfil).includes(normalize(profileName))) : undefined;
      const resolvedCargoName = cargoName || (profile?.contrato_cargo_equivalente_id ? cargos.find((item) => item.id === profile.contrato_cargo_equivalente_id)?.nombre : null);
      const cargo = cargos.find((item) => normalize(item.nombre) === normalize(resolvedCargoName));
      const tipoCode = String(decisionRows.find((item) => item.__sheet === 'CATALOGOS' && String(item.PROBLEMA) === 'TIPO_VINCULACION_REQUERIDO')?.DECISION_USUARIO ?? row.tipo_vinculacion_resuelto ?? '').replace('LABORAL_', '');
      const tipo = tipos.find((item) => normalize(item.codigo) === normalize(tipoCode) || normalize(item.nombre) === normalize(tipoCode));
      const docCode = decisionRows.some((item) => item.__sheet === 'CATALOGOS' && String(item.PROBLEMA) === 'TIPO_DOCUMENTO_PPT_NO_CATALOGADO') ? 'PPT' : row.tipo_documento_resuelto;
      const doc = docs.find((item) => normalize(item.codigo) === normalize(docCode) || normalize(item.nombre) === normalize(docCode));
      const locationName = decisionRows.find((item) => item.__sheet === 'UBICACIONES')?.VALOR_USUARIO || row.ubicacion_resuelta || row.ubicacion_operativa_origen;
      const location = locations.find((item) => normalize(item.nombre_ubicacion) === normalize(locationName));
      const acceptedFocalDecision = decisionRows.some((item) => item.__sheet === 'CATALOGOS' && String(item.DECISION_USUARIO).trim() === 'ACEPTAR_OPCION_FOCALIZACION');
      const target = acceptedFocalDecision
        ? { municipio: 'ACACIAS', institucion: 'INSTITUCION EDUCATIVA JUAN ROZO', sede: 'SEDE ENRIQUE DANIELS', modalidad: 'CAJM/JT-RI' }
        : row.fila_origen === 346
          ? { municipio: row.municipio_origen, institucion: row.institucion_origen, sede: 'SEDE PRINCIPAL LEJANIAS', modalidad: row.modalidad_origen }
          : { municipio: row.municipio_propuesto ?? row.municipio_origen, institucion: row.institucion_propuesta ?? row.institucion_origen, sede: row.sede_propuesta ?? row.sede_origen, modalidad: row.modalidad_propuesta ?? row.modalidad_origen };
      const focalRow = focal.filter((item) => normalize(item.municipio) === normalize(target.municipio) && normalize(item.institucion) === normalize(target.institucion) && normalize(item.sede) === normalize(target.sede) && normalize(item.modalidad) === normalize(target.modalidad));
      const focalResolved = focalRow.length === 1 ? focalRow[0] : null;
      const start = decisionDate(decisionRows, 'FECHA_INICIO_REQUERIDA') ?? row.fecha_inicio_xlsx ?? dateFromExcel(source.FECHA_INICIO_CONTRATO);
      const end = retired ? RETIREMENT_DATE : decisionDate(decisionRows, 'FECHA_FIN_TERMINO_FIJO_REQUERIDA') ?? row.fecha_fin_xlsx ?? dateFromExcel(source.FECHA_FIN_CONTRATO);
      const special = caseDecision(decisionRows);
      const appliesCoverage = category === 'IMPORTAR_ACTIVA_CON_COBERTURA';
      const appliesLabor = category === 'IMPORTAR_ACTIVA_SIN_COBERTURA' && Boolean(locationName);
      const presented = Boolean(profileName && profile);
      const identityReuse = decisionRows.some((item) => item.__sheet === 'IDENTIDADES' && String(item.PROBLEMA) === 'CONFLICTO_IDENTIDAD' && normalize(item.DECISION_USUARIO) === 'MISMA PERSONA');
      const plan: Row = {
        fila_xlsx: row.fila_origen, sha_archivo: sha, cedula: row.cedula, tipo_documento_resuelto: docCode,
        nombre_resuelto: resolvedName, accion_persona: identityReuse || row.persona_plan === 'PERSONA_REUTILIZAR' ? 'REUTILIZAR' : 'CREAR', persona_id_existente: row.persona_existente_id,
        accion_vinculacion: row.vinculacion_plan === 'VINCULACION_REUTILIZAR' ? 'REUTILIZAR' : 'CREAR', contrato_id: CONTRACT_ID, empresa_id: COMPANY_ID,
        contrato_cargo_id: cargo?.id ?? null, cargo_nombre: resolvedCargoName, tipo_vinculacion_id: tipo?.id ?? null, tipo_vinculacion_codigo: tipo?.codigo ?? tipoCode,
        tipo_contrato_codigo: row.tipo_contrato_origen, fecha_inicio: start, fecha_fin: end, estado_final: retired ? 'RETIRADA' : 'ACTIVA', metodo_pago: row.metodo_pago_origen,
        aplica_cobertura: appliesCoverage, focalizacion_final_id: appliesCoverage ? focalResolved?.focalizacion_final_id ?? null : null,
        sede_modalidad_id: appliesCoverage ? focalResolved?.sede_modalidad_id ?? null : null, sede_id: appliesCoverage ? focalResolved?.sede_id ?? null : null,
        institucion_id: appliesCoverage ? focalResolved?.institucion_id ?? null : null, municipio_id: appliesCoverage ? focalResolved?.municipio_id ?? null : null,
        modalidad_id: appliesCoverage ? focalResolved?.modalidad_id ?? null : null, municipio: target.municipio, institucion: target.institucion, sede: target.sede, modalidad: target.modalidad,
        fecha_inicio_asignacion: appliesCoverage ? start : null, fecha_fin_asignacion: appliesCoverage ? end : null,
        aplica_asignacion_laboral: appliesLabor, ubicacion_laboral_id: appliesLabor ? location?.id ?? null : null, ubicacion_laboral_nombre: appliesLabor ? String(locationName) : null,
        presentada_licitacion: presented, perfil_licitacion_id: presented ? profile?.id ?? null : null, perfil_licitacion_nombre: presented ? profile?.nombre_perfil ?? profileName : null,
        vigencia_licitacion_desde: presented ? start : null, vigencia_licitacion_hasta: presented ? end : null, estado_documental: presented ? row.licitacion_documental_estado ?? null : null,
        aplica_condicion_economica: row.metodo_pago_origen === 'CASO_ESPECIAL', tipo_condicion: row.metodo_pago_origen === 'CASO_ESPECIAL' ? 'VALOR_FIJO' : null,
        valor_condicion: row.metodo_pago_origen === 'CASO_ESPECIAL' ? special.valor : null, vigencia_condicion_desde: row.metodo_pago_origen === 'CASO_ESPECIAL' ? special.desde : null,
        vigencia_condicion_hasta: row.metodo_pago_origen === 'CASO_ESPECIAL' ? special.hasta : null, motivo_condicion: row.metodo_pago_origen === 'CASO_ESPECIAL' ? special.motivo : null,
        es_retirada_historica: retired, fecha_retiro: retired ? RETIREMENT_DATE : null, categoria_final: category,
      };
      const requireField = (condition: boolean, code: string, detail: string): void => { if (!condition) blockers.push({ fila_xlsx: row.fila_origen, cedula: row.cedula, code, detail }); };
      requireField(Boolean(plan.contrato_cargo_id), 'CARGO_ID_NULL', `No se resolviÃ³ contrato_cargo_id para ${resolvedCargoName ?? 'cargo vacÃ­o'}.`);
      requireField(Boolean(plan.tipo_vinculacion_id), 'TIPO_VINCULACION_ID_NULL', 'No se resolviÃ³ tipo_vinculacion_id.');
      requireField(Boolean(start), 'FECHA_INICIO_NULL', 'No se resolviÃ³ fecha_inicio.');
      if (appliesCoverage) {
        requireField(Boolean(plan.focalizacion_final_id), 'FOCALIZACION_FINAL_ID_NULL', `No existe focalizaciÃ³n exacta para ${target.municipio} | ${target.institucion} | ${target.sede} | ${target.modalidad}.`);
        requireField(Boolean(plan.sede_modalidad_id), 'SEDE_MODALIDAD_ID_NULL', 'No se resolviÃ³ sede_modalidad_id.');
      }
      if (appliesLabor) requireField(Boolean(plan.ubicacion_laboral_id), 'UBICACION_LABORAL_ID_NULL', `No se resolviÃ³ ubicaciÃ³n laboral ${locationName}.`);
      if (presented) requireField(Boolean(plan.perfil_licitacion_id), 'PERFIL_LICITACION_ID_NULL', `No se resolviÃ³ perfil ${profileName}.`);
      if (plan.aplica_condicion_economica) {
        requireField(Boolean(special.valor), 'CASO_ESPECIAL_VALOR_NULL', 'Falta valor de condiciÃ³n econÃ³mica.');
        requireField(Boolean(special.motivo), 'CASO_ESPECIAL_MOTIVO_NULL', 'Falta motivo de condiciÃ³n econÃ³mica.');
        requireField(Boolean(special.desde), 'CASO_ESPECIAL_VIGENCIA_NULL', 'Falta vigencia_desde de condiciÃ³n econÃ³mica.');
      }
      plans.push(plan);
    }
    const counts = plans.reduce<Record<string, number>>((acc, row) => { acc[String(row.categoria_final)] = (acc[String(row.categoria_final)] ?? 0) + 1; return acc; }, {});
    const expectedCounts = { total_rows: 772, active_with_coverage: 670, active_without_coverage: 85, retired_historical: 17, review: 0 };
    const duplicates = plans.length - new Set(plans.map((row) => row.fila_xlsx)).size;
    const omitted = expectedCounts.total_rows - plans.length;
    const countsMatch = plans.length === expectedCounts.total_rows && (counts.IMPORTAR_ACTIVA_CON_COBERTURA ?? 0) === expectedCounts.active_with_coverage && (counts.IMPORTAR_ACTIVA_SIN_COBERTURA ?? 0) === expectedCounts.active_without_coverage && (counts.IMPORTAR_RETIRADA_HISTORICA ?? 0) === expectedCounts.retired_historical && (counts.REVISAR ?? 0) === expectedCounts.review;
    const consistency = { generated_at: new Date().toISOString(), source_sha256: sha, total_rows: plans.length, counts, expected: expectedCounts, duplicates, omitted, blockers, ready: countsMatch && duplicates === 0 && omitted === 0 && blockers.length === 0 };
    await writeFile(path.resolve(PLAN_FILE), JSON.stringify({ ready: consistency.ready, blockers, records: plans }, null, 2), 'utf8');
    await writeFile(path.resolve(PLAN_CSV), buildCsv(plans), 'utf8');
    await writeFile(path.resolve(CONSISTENCY_FILE), JSON.stringify(consistency, null, 2), 'utf8');
    if (consistency.ready) {
      const predicates: Array<[string, (row: Row) => boolean]> = [
        ['PERSONA_NUEVA', (row) => row.accion_persona === 'CREAR'],
        ['PERSONA_REUTILIZADA', (row) => row.accion_persona === 'REUTILIZAR'],
        ['MANIPULADORA_COBERTURA', (row) => row.aplica_cobertura === true],
        ['LICITACION', (row) => row.presentada_licitacion === true],
        ['ADMINISTRATIVO', (row) => row.aplica_asignacion_laboral === true],
        ['CASO_ESPECIAL', (row) => row.aplica_condicion_economica === true],
        ['PPT', (row) => row.tipo_documento_resuelto === 'PPT'],
        ['RETIRADA_HISTORICA', (row) => row.es_retirada_historica === true],
      ];
      const selected = new Set<unknown>();
      const smoke = predicates.map(([criterio, predicate]) => {
        const row = plans.find((candidate) => !selected.has(candidate.fila_xlsx) && predicate(candidate));
        if (!row) return null;
        selected.add(row.fila_xlsx);
        return { ...row, criterio };
      }).filter((row): row is Row & { criterio: string } => row !== null);
      await writeFile(path.resolve(SMOKE_FILE), JSON.stringify(smoke, null, 2), 'utf8');
      await writeFile(path.resolve(SMOKE_CSV), buildCsv(smoke), 'utf8');
    }
    console.log(JSON.stringify({ source_sha256: sha, total_rows: plans.length, counts, blockers, consistency_ready: consistency.ready, smoke_generated: consistency.ready }, null, 2));
  } finally { client.release(); }
};

void main().catch((error) => { console.error(error); process.exitCode = 1; });












