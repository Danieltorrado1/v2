import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool } from '../config/db';
import { buildCsv, validateRetirementDate } from '../modules/importaciones/personalMeta26DryRun.helpers';
import { looksLikeManipuladoraCargo } from '../modules/vinculaciones/vinculaciones.personal.domain';

const PERSONAL_XLSX = 'data/Importacion_Personal_CONSORCIO_PAE_META_26.xlsx';
const DECISIONES_REALES_XLSX = 'reports/DECISIONES_REALES_PERSONAL_META26.xlsx';
const BASELINE_JSON = 'reports/personal-meta26-final-pre-smoke.json';
const V4_JSON = 'reports/personal-meta26-dry-run-v4.json';
const SUMMARY_JSON = 'reports/personal-meta26-final-real-dry-run.json';
const SMOKE_PLAN_JSON = 'reports/personal-meta26-smoke-plan.json';
const SMOKE_PLAN_CSV = 'reports/personal-meta26-smoke-plan.csv';
const IMPORT_CONTEXT_DATE = '2026-08-22';
const BASELINE_PREVIOUSLY_ACCEPTED_COVERAGE_FILA = 74;
const AUTO_RESOLVED_COVERAGE_FILA = 346;
const CASE_SPECIAL_VIGENCIA_OVERRIDES = new Map<number, string>([
  [20, '2026-07-29'],
  [181, '2026-07-29'],
  [324, '2026-07-29'],
  [518, '2026-07-29'],
]);

type SheetName = 'FECHAS' | 'IDENTIDADES' | 'CASOS_ESPECIALES' | 'UBICACIONES' | 'CATALOGOS';
type FinalCategory = 'IMPORTAR_ACTIVA_CON_COBERTURA' | 'IMPORTAR_ACTIVA_SIN_COBERTURA' | 'IMPORTAR_RETIRADA_HISTORICA' | 'REVISAR';
type BlockerKind = 'DECISION_HUMANA_PENDIENTE' | 'PARAMETRIZACION_TECNICA_REQUERIDA' | 'ERROR_REAL_DATOS';
type SmokeSampleKind =
  | 'MANIPULADORA_COBERTURA'
  | 'PERSONA_REUTILIZADA'
  | 'PERSONA_NUEVA'
  | 'ADMINISTRATIVO'
  | 'LABORAL'
  | 'OPS'
  | 'LICITACION'
  | 'CASO_ESPECIAL'
  | 'RETIRADA_HISTORICA';

interface DecisionWorkbookRow {
  CEDULA?: string | number;
  CONTEXTO?: string;
  DECISION_USUARIO?: string | number;
  FILA_XLSX?: string | number;
  NOMBRE?: string;
  OBSERVACION_USUARIO?: string | number;
  PROBLEMA?: string;
  PROPUESTA_EMPIRIA?: string;
  VALOR_ACTUAL?: string;
  VALOR_USUARIO?: string | number;
}

interface ParsedDecisionRow {
  cedula: string;
  context: string;
  decision: string;
  fila: number;
  name: string;
  observation: string;
  problem: string;
  proposal: string;
  rawValue: unknown;
  sheet: SheetName;
  value: string;
}

interface WorkbookMeta {
  path: string;
  read_at: string;
  sha256: string;
  sheets: Array<{ name: string; rows: number }>;
}

interface V4CoveragePreviewRow {
  asignadas_propuestas: number;
  diferencia: number;
  estado: string;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  requeridas: number;
  sede: string | null;
}

interface V4Row {
  cargo_origen?: string | null;
  categoria_final?: string;
  cedula?: string | null;
  cobertura_estado?: string;
  fecha_fin_xlsx?: string | null;
  fecha_inicio_xlsx?: string | null;
  fila_origen: number;
  identidad_estado?: string;
  institucion_origen?: string | null;
  institucion_propuesta?: string | null;
  licitacion_perfil_resuelto?: string | null;
  metodo_pago_origen?: string | null;
  modalidad_origen?: string | null;
  modalidad_propuesta?: string | null;
  municipio_origen?: string | null;
  municipio_propuesto?: string | null;
  nombre?: string | null;
  persona_existente_id?: number | null;
  persona_plan?: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | 'REVISAR';
  sede_origen?: string | null;
  sede_propuesta?: string | null;
  subtipo_retiro?: string | null;
  tipo_vinculacion_origen?: string | null;
  ubicacion_estado?: string;
  ubicacion_resuelta?: string | null;
  vinculacion_existente_id?: number | null;
  vinculacion_plan?: 'VINCULACION_CREAR' | 'VINCULACION_REUTILIZAR' | 'REVISAR';
}

interface V4Summary {
  licitacion: {
    perfiles: Array<{
      diferencia: number;
      estado: string;
      perfil: string;
      presentados: number;
      requeridos: number;
    }>;
  };
  manipuladoras_xlsx: number;
}

interface V4Report {
  coverage_preview: V4CoveragePreviewRow[];
  report_rows: V4Row[];
  v4_summary: V4Summary;
}

interface BaselineSummary {
  categories: {
    active_with_coverage: number;
    active_without_coverage: number;
    retired_historical: number;
    review: number;
  };
  coverage_summary: {
    asignadas_total: number;
    completas: number;
    deficit_total: number;
    deficitarias: number;
    exceso_total: number;
    excesos: number;
    requeridas_total: number;
    sin_personal: number;
  };
  importable_counts: {
    personas_crear: number;
    personas_reutilizar: number;
    vinculaciones_crear: number;
    vinculaciones_reutilizar: number;
  };
  licitacion_perfiles: Array<{
    diferencia: number;
    estado: string;
    perfil: string;
    presentados: number;
    requeridos: number;
  }>;
  manipuladoras: {
    activas: number;
    asignables: number;
    pendientes: number;
    retiradas: number;
    total: number;
  };
}

interface CountRow extends QueryResultRow {
  total: number;
}

interface DocTypeRow extends QueryResultRow {
  codigo: string | null;
  id: number;
  nombre_documento: string;
}

interface TipoVincRow extends QueryResultRow {
  codigo: string | null;
  id: number;
  nombre_vinculacion: string;
}

interface UbicacionRow extends QueryResultRow {
  id: number;
  nombre_ubicacion: string;
}

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface DbCounts {
  cobertura_asignaciones: number;
  personal_asignaciones_laborales: number;
  personal_presentaciones_licitacion: number;
  personas: number;
  vinculacion_condiciones_economicas: number | null;
  vinculaciones: number;
}

interface SupportData {
  counts_after: DbCounts;
  counts_before: DbCounts;
  doc_type_rows: DocTypeRow[];
  has_vinculacion_condiciones_economicas: boolean;
  tipo_vinc_rows: TipoVincRow[];
  ubicacion_rows: UbicacionRow[];
}

interface RowBlocker {
  code: string;
  detail: string;
  kind: BlockerKind;
  sheet: SheetName;
}

interface DecisionAssessment {
  code: string;
  consumed: boolean;
  detail: string;
  fila: number;
  kind: 'RESUELTA' | BlockerKind;
  normalized_value: string | null;
  row_decision: string;
  sheet: SheetName;
}

interface RowResolutionState {
  assessments: DecisionAssessment[];
  category: FinalCategory;
  cedula: string;
  context: string;
  data_errors: RowBlocker[];
  decision_rows: ParsedDecisionRow[];
  human_pending: RowBlocker[];
  import_person_plan: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | null;
  import_vinc_plan: 'VINCULACION_CREAR' | 'VINCULACION_REUTILIZAR' | null;
  is_case_special: boolean;
  is_manipuladora: boolean;
  is_ops: boolean;
  licitacion_perfil: string | null;
  method_payment: string | null;
  name: string;
  row: V4Row | undefined;
  technical_pending: RowBlocker[];
}

interface SmokePlanRow {
  cargo: string | null;
  categoria_final: FinalCategory;
  cedula: string;
  criterio: SmokeSampleKind;
  fila_xlsx: number;
  metodo_pago: string | null;
  nombre: string;
  observacion: string;
}

const orderedSheets: SheetName[] = ['FECHAS', 'IDENTIDADES', 'CASOS_ESPECIALES', 'UBICACIONES', 'CATALOGOS'];
const tipoVincPermitidos = new Set(['LABORAL_OL', 'LABORAL_TF', 'LABORAL_TI', 'OPS']);

const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeDoc = (value: unknown): string => String(value ?? '').replace(/[^0-9A-Za-z]+/g, '').toUpperCase();

const toIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(?:\.0+)?$/.test(text)) {
    return toIsoDate(Number(text));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/');
    if (!day || !month || !year) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
};

const toPositiveNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }
  const text = String(value ?? '').replace(/[^0-9.,-]+/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sha256OfFile = async (relativePath: string): Promise<string> => {
  const buffer = await readFile(path.resolve(relativePath));
  return createHash('sha256').update(buffer).digest('hex');
};

const readWorkbookMeta = async (relativePath: string): Promise<WorkbookMeta> => {
  const workbook = XLSX.readFile(path.resolve(relativePath), { cellDates: false });
  return {
    path: path.resolve(relativePath),
    sha256: await sha256OfFile(relativePath),
    read_at: new Date().toISOString(),
    sheets: workbook.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name]!, { defval: '' }).length,
    })),
  };
};

const readDecisionSheet = (workbook: XLSX.WorkBook, sheetName: SheetName): ParsedDecisionRow[] => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`HOJA_FALTANTE:${sheetName}`);
  }

  return XLSX.utils.sheet_to_json<DecisionWorkbookRow>(sheet, { defval: '' }).map((row) => ({
    fila: Number(row.FILA_XLSX),
    cedula: normalizeDoc(row.CEDULA),
    context: String(row.CONTEXTO ?? '').trim(),
    decision: String(row.DECISION_USUARIO ?? '').trim(),
    name: String(row.NOMBRE ?? '').trim(),
    observation: String(row.OBSERVACION_USUARIO ?? '').trim(),
    problem: String(row.PROBLEMA ?? '').trim(),
    proposal: String(row.PROPUESTA_EMPIRIA ?? '').trim(),
    rawValue: row.VALOR_USUARIO ?? '',
    sheet: sheetName,
    value: String(row.VALOR_USUARIO ?? '').trim(),
  }));
};

const hasUserInput = (row: ParsedDecisionRow): boolean => Boolean(row.decision || row.value || row.observation);

const buildDecisionLabel = (row: ParsedDecisionRow): string => {
  const parts: string[] = [];
  if (row.decision) parts.push(`DECISION=${row.decision}`);
  if (row.value) parts.push(`VALOR=${row.value}`);
  if (row.observation) parts.push(`OBS=${row.observation}`);
  return parts.join(' | ');
};

const contextValue = (context: string, label: string): string | null => {
  const match = context.match(new RegExp(`${label}:\\s*([^|]+)`));
  return match?.[1]?.trim() ?? null;
};

const coveragePartsFromContext = (context: string): { institucion: string | null; modalidad: string | null; municipio: string | null; sede: string | null } => {
  const match = context.match(/Cobertura:\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)/i);
  if (!match) {
    return { municipio: null, institucion: null, sede: null, modalidad: null };
  }

  return {
    municipio: match[1]?.trim() ?? null,
    institucion: match[2]?.trim() ?? null,
    sede: match[3]?.trim() ?? null,
    modalidad: match[4]?.trim() ?? null,
  };
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];

const queryRows = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await client.query<T>(sql, params)).rows;

const tableExists = async (client: PoolClient, tableName: string): Promise<boolean> => {
  const rows = await queryRows<ExistsRow>(
    client,
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );

  return rows[0]?.exists ?? false;
};

const loadCounts = async (client: PoolClient, hasEconomicTable: boolean): Promise<DbCounts> => {
  const personas = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personas');
  const vinculaciones = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM vinculaciones');
  const cobertura = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM cobertura_asignaciones');
  const laborales = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personal_asignaciones_laborales');
  const licitacion = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personal_presentaciones_licitacion');

  const economicas = hasEconomicTable
    ? await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM vinculacion_condiciones_economicas')
    : [];

  return {
    personas: personas[0]?.total ?? 0,
    vinculaciones: vinculaciones[0]?.total ?? 0,
    cobertura_asignaciones: cobertura[0]?.total ?? 0,
    personal_asignaciones_laborales: laborales[0]?.total ?? 0,
    personal_presentaciones_licitacion: licitacion[0]?.total ?? 0,
    vinculacion_condiciones_economicas: hasEconomicTable ? (economicas[0]?.total ?? 0) : null,
  };
};

const loadSupportData = async (): Promise<SupportData> => {
  const client = await dbPool.connect();
  try {
    const hasEconomicTable = await tableExists(client, 'vinculacion_condiciones_economicas');
    const counts_before = await loadCounts(client, hasEconomicTable);
    const doc_type_rows = await queryRows<DocTypeRow>(
      client,
      `
        SELECT id, codigo, nombre_documento
        FROM tipos_documentos
        WHERE COALESCE(es_identificacion_personal, FALSE) = TRUE
        ORDER BY id ASC
      `,
    );
    const tipo_vinc_rows = await queryRows<TipoVincRow>(
      client,
      `
        SELECT id, codigo, nombre_vinculacion
        FROM tipos_vinculacion
        ORDER BY id ASC
      `,
    );
    const ubicacion_rows = await queryRows<UbicacionRow>(
      client,
      `
        SELECT id, nombre_ubicacion
        FROM contrato_ubicaciones_laborales
        WHERE contrato_id = 24
          AND COALESCE(activo, TRUE) = TRUE
        ORDER BY id ASC
      `,
    );
    const counts_after = await loadCounts(client, hasEconomicTable);

    return {
      counts_before,
      counts_after,
      doc_type_rows,
      has_vinculacion_condiciones_economicas: hasEconomicTable,
      tipo_vinc_rows,
      ubicacion_rows,
    };
  } finally {
    client.release();
  }
};

const normalizeUbicacionName = (value: string | null | undefined): string => normalizeText(value);

const buildCoverageKey = (parts: Array<string | null | undefined>): string => parts.map((part) => String(part ?? '')).join(' | ');

const cloneCoveragePreview = (rows: V4CoveragePreviewRow[]): V4CoveragePreviewRow[] => rows.map((row) => ({ ...row }));

const recalcCoverageSummary = (rows: V4CoveragePreviewRow[]) => {
  let asignadas_total = 0;
  let requeridas_total = 0;
  let deficit_total = 0;
  let exceso_total = 0;
  let completas = 0;
  let deficitarias = 0;
  let excesos = 0;
  let sin_personal = 0;

  for (const row of rows) {
    const diferencia = row.asignadas_propuestas - row.requeridas;
    row.diferencia = diferencia;
    row.estado = diferencia === 0 ? 'COMPLETA' : diferencia < 0 ? 'DEFICIT' : 'EXCESO';
    asignadas_total += row.asignadas_propuestas;
    requeridas_total += row.requeridas;
    if (diferencia === 0) completas += 1;
    if (diferencia < 0) {
      deficitarias += 1;
      deficit_total += Math.abs(diferencia);
    }
    if (diferencia > 0) {
      excesos += 1;
      exceso_total += diferencia;
    }
    if (row.asignadas_propuestas === 0) sin_personal += 1;
  }

  return {
    asignadas_total,
    completas,
    deficit_total,
    deficitarias,
    exceso_total,
    excesos,
    requeridas_total,
    sin_personal,
  };
};

const parseCaseSpecialObservation = (observation: string): { missing: string[]; motivo: string | null; vigencia_desde: string | null; vigencia_hasta: string | null } => {
  const isoMatches = [...observation.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  const slashMatches = [...observation.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].map((match) => match[0]);
  const parsedDates = uniqueStrings([
    ...isoMatches,
    ...slashMatches.map((value) => toIsoDate(value)),
  ]);

  const vigencia_desde = parsedDates[0] ?? null;
  const vigencia_hasta = parsedDates[1] ?? null;
  const motivo = observation
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;

  const missing: string[] = [];
  if (!motivo) missing.push('MOTIVO');
  if (!vigencia_desde) missing.push('VIGENCIA_DESDE');

  return { missing, motivo, vigencia_desde, vigencia_hasta };
};

const buildResolvedAssessment = (row: ParsedDecisionRow, code: string, normalizedValue: string | null = null, detail = ''): DecisionAssessment => ({
  code,
  consumed: true,
  detail,
  fila: row.fila,
  kind: 'RESUELTA',
  normalized_value: normalizedValue,
  row_decision: buildDecisionLabel(row),
  sheet: row.sheet,
});

const buildBlockedAssessment = (
  row: ParsedDecisionRow,
  kind: BlockerKind,
  code: string,
  detail: string,
  consumed = false,
  normalizedValue: string | null = null,
): DecisionAssessment => ({
  code,
  consumed,
  detail,
  fila: row.fila,
  kind,
  normalized_value: normalizedValue,
  row_decision: buildDecisionLabel(row),
  sheet: row.sheet,
});

const deriveFallbackPersonPlan = (row: V4Row | undefined): 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' => {
  if (row?.persona_plan === 'PERSONA_REUTILIZAR' || row?.persona_existente_id) {
    return 'PERSONA_REUTILIZAR';
  }
  return 'PERSONA_CREAR';
};

const deriveFallbackVincPlan = (row: V4Row | undefined): 'VINCULACION_CREAR' | 'VINCULACION_REUTILIZAR' => {
  if (row?.vinculacion_plan === 'VINCULACION_REUTILIZAR' || row?.vinculacion_existente_id) {
    return 'VINCULACION_REUTILIZAR';
  }
  return 'VINCULACION_CREAR';
};

const resolveCoverageTarget = (decisionRow: ParsedDecisionRow, row: V4Row | undefined) => {
  const fromContext = coveragePartsFromContext(decisionRow.context);
  const normalizedSede = normalizeText(fromContext.sede);
  const normalizedInstitucion = normalizeText(fromContext.institucion);

  if (!row?.sede_propuesta && !row?.modalidad_propuesta && normalizedInstitucion === 'INSTITUCION EDUCATIVA JUAN ROZO' && (normalizedSede === 'ENRRIQUE DANIES' || normalizedSede === 'ENRIQUE DANIELS')) {
    return {
      municipio: 'ACACÍAS',
      institucion: 'INSTITUCIÓN EDUCATIVA JUAN ROZO',
      sede: 'SEDE ENRIQUE DANIELS',
      modalidad: 'CAJM/JT-RI',
    };
  }

  return {
    municipio: row?.municipio_propuesto ?? row?.municipio_origen ?? fromContext.municipio,
    institucion: row?.institucion_propuesta ?? row?.institucion_origen ?? fromContext.institucion,
    sede: row?.sede_propuesta ?? row?.sede_origen ?? fromContext.sede,
    modalidad: row?.modalidad_propuesta ?? row?.modalidad_origen ?? fromContext.modalidad,
  };
};

const main = async (): Promise<void> => {
  const [personalMeta, decisionesMeta, supportData] = await Promise.all([
    readWorkbookMeta(PERSONAL_XLSX),
    readWorkbookMeta(DECISIONES_REALES_XLSX),
    loadSupportData(),
  ]);

  const [baseline, v4] = await Promise.all([
    readFile(path.resolve(BASELINE_JSON), 'utf8').then((content) => JSON.parse(content) as BaselineSummary),
    readFile(path.resolve(V4_JSON), 'utf8').then((content) => JSON.parse(content) as V4Report),
  ]);

  const workbook = XLSX.readFile(path.resolve(DECISIONES_REALES_XLSX), { cellDates: false });
  const decisionRows = orderedSheets.flatMap((sheet) => readDecisionSheet(workbook, sheet)).filter(hasUserInput);
  const decisionsByFila = new Map<number, ParsedDecisionRow[]>();
  for (const row of decisionRows) {
    const current = decisionsByFila.get(row.fila) ?? [];
    current.push(row);
    decisionsByFila.set(row.fila, current);
  }

  const rowsByFila = new Map<number, V4Row>(v4.report_rows.map((row) => [row.fila_origen, row]));
  const ubicacionesByName = new Map(supportData.ubicacion_rows.map((row) => [normalizeUbicacionName(row.nombre_ubicacion), row]));
  const tipoVincByCode = new Map(supportData.tipo_vinc_rows.map((row) => [normalizeText(row.codigo ?? row.nombre_vinculacion), row]));
  const hasPptDocType = supportData.doc_type_rows.some((row) => {
    const normalizedCode = normalizeText(row.codigo);
    const normalizedName = normalizeText(row.nombre_documento);
    return normalizedCode === 'PPT' || normalizedName === 'PERMISO POR PROTECCION TEMPORAL';
  });

  const rowStates = new Map<number, RowResolutionState>();
  for (const [fila, sheetRows] of decisionsByFila.entries()) {
    const first = sheetRows[0]!;
    const row = rowsByFila.get(fila);
    const cargo = row?.cargo_origen ?? contextValue(first.context, 'Cargo');
    const metodoPago = row?.metodo_pago_origen ?? contextValue(first.context, 'MÃ©todo pago');
    const perfilLicitacion = row?.licitacion_perfil_resuelto ?? (() => {
      const parsed = contextValue(first.context, 'Perfil licitaciÃ³n');
      return parsed && normalizeText(parsed) !== 'NO' ? normalizeText(parsed) : null;
    })();
    rowStates.set(fila, {
      assessments: [],
      category: 'REVISAR',
      cedula: first.cedula,
      context: first.context,
      data_errors: [],
      decision_rows: sheetRows,
      human_pending: [],
      import_person_plan: null,
      import_vinc_plan: null,
      is_case_special: normalizeText(metodoPago) === 'CASO_ESPECIAL',
      is_manipuladora: looksLikeManipuladoraCargo(cargo),
      is_ops: normalizeText(contextValue(first.context, 'VinculaciÃ³n')) === 'PRESTACION DE SERVICIOS',
      licitacion_perfil: perfilLicitacion,
      method_payment: metodoPago,
      name: first.name,
      row,
      technical_pending: [],
    });
  }

  for (const decisionRow of decisionRows) {
    const state = rowStates.get(decisionRow.fila);
    if (!state) continue;
    const normalizedDecision = normalizeText(decisionRow.decision);
    const v4Row = state.row;

    if (decisionRow.sheet === 'FECHAS') {
      const isoDate = toIsoDate(decisionRow.rawValue);
      const rowLabel = buildDecisionLabel(decisionRow);
      if (normalizedDecision !== 'PROPORCIONAR_FECHA' || !isoDate) {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'FECHA_INVALIDA_O_INCOMPLETA',
          'La decisiÃ³n no entrega una fecha vÃ¡lida consumible.',
          false,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        continue;
      }

      if (decisionRow.problem === 'FECHA_RETIRO_REQUERIDA') {
        const validation = validateRetirementDate({
          allowSameDayStart: true,
          contextDate: IMPORT_CONTEXT_DATE,
          retirementDate: isoDate,
          startDate: v4Row?.fecha_inicio_xlsx ?? null,
        });
        if (!validation.valid) {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'DECISION_HUMANA_PENDIENTE',
            validation.issues.join('|') || 'FECHA_RETIRO_INVALIDA',
            `La fecha ${isoDate} no es compatible con la vigencia de la vinculaciÃ³n.`,
            false,
            isoDate,
          );
          state.assessments.push(assessment);
          state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
          continue;
        }
      } else {
        const startDate = v4Row?.fecha_inicio_xlsx ?? null;
        const endDate = v4Row?.fecha_fin_xlsx ?? null;
        if (decisionRow.problem.includes('FECHA_FIN') && startDate && isoDate < startDate) {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'DECISION_HUMANA_PENDIENTE',
            'FECHA_FIN_ANTERIOR_A_INICIO',
            `La fecha fin ${isoDate} es anterior a la fecha inicio ${startDate}.`,
            false,
            isoDate,
          );
          state.assessments.push(assessment);
          state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
          continue;
        }
        if (decisionRow.problem.includes('FECHA_INICIO') && endDate && isoDate > endDate) {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'DECISION_HUMANA_PENDIENTE',
            'FECHA_INICIO_POSTERIOR_A_FIN',
            `La fecha inicio ${isoDate} es posterior a la fecha fin ${endDate}.`,
            false,
            isoDate,
          );
          state.assessments.push(assessment);
          state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
          continue;
        }
      }

      state.assessments.push(buildResolvedAssessment(decisionRow, 'FECHA_VALIDA', isoDate, rowLabel));
      continue;
    }

    if (decisionRow.sheet === 'IDENTIDADES') {
      if (decisionRow.problem === 'CONFLICTO_IDENTIDAD') {
        if (normalizedDecision === 'MISMA_PERSONA') {
          state.import_person_plan = 'PERSONA_REUTILIZAR';
          state.import_vinc_plan = v4Row?.vinculacion_existente_id ? 'VINCULACION_REUTILIZAR' : deriveFallbackVincPlan(v4Row);
          state.assessments.push(buildResolvedAssessment(decisionRow, 'IDENTIDAD_REUTILIZADA', 'MISMA_PERSONA'));
        } else if (normalizedDecision === 'PERSONA_DISTINTA') {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'ERROR_REAL_DATOS',
            'DUPLICIDAD_DOCUMENTAL_PROHIBIDA',
            'La decisiÃ³n PERSONA_DISTINTA colisiona con la regla de documento Ãºnico del modelo.',
            false,
            normalizedDecision,
          );
          state.assessments.push(assessment);
          state.data_errors.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        } else {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'DECISION_HUMANA_PENDIENTE',
            'DECISION_IDENTIDAD_INVALIDA',
            'Se esperaba MISMA_PERSONA o PERSONA_DISTINTA.',
            false,
            normalizedDecision,
          );
          state.assessments.push(assessment);
          state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        }
        continue;
      }

      if (normalizedDecision === 'NOMBRE_LEGAL_COMPLETO' && decisionRow.value) {
        state.import_person_plan = deriveFallbackPersonPlan(v4Row);
        state.import_vinc_plan = deriveFallbackVincPlan(v4Row);
        state.assessments.push(buildResolvedAssessment(decisionRow, 'NOMBRE_LEGAL_CONFIRMADO', decisionRow.value));
      } else {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'NOMBRE_LEGAL_INCOMPLETO',
          'Hace falta el nombre legal completo exacto.',
          false,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
      }
      continue;
    }

    if (decisionRow.sheet === 'CASOS_ESPECIALES') {
      const valor = toPositiveNumber(decisionRow.rawValue);
      const parsedBase = parseCaseSpecialObservation(decisionRow.observation);
      const overrideVigenciaDesde = CASE_SPECIAL_VIGENCIA_OVERRIDES.get(decisionRow.fila) ?? null;
      const parsed = {
        ...parsedBase,
        vigencia_desde: parsedBase.vigencia_desde ?? overrideVigenciaDesde,
        missing: parsedBase.missing.filter((item) => item !== 'VIGENCIA_DESDE' || (!parsedBase.vigencia_desde && !overrideVigenciaDesde)),
      };
      if (normalizedDecision !== 'COMPLETAR_CASO_ESPECIAL' || !valor) {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'CASO_ESPECIAL_VALOR_INVALIDO',
          'Hace falta un valor numÃ©rico positivo del caso especial.',
          false,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        continue;
      }
      if (parsed.missing.length > 0) {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          `CASO_ESPECIAL_FALTA_${parsed.missing.join('_Y_')}`,
          `Faltan campos reales del caso especial: ${parsed.missing.join(', ')}.`,
          false,
          String(valor),
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        continue;
      }
      if (!supportData.has_vinculacion_condiciones_economicas) {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'PARAMETRIZACION_TECNICA_REQUERIDA',
          'MIGRACION_CONDICIONES_ECONOMICAS_PENDIENTE',
          'La decisiÃ³n es completa, pero la tabla vinculacion_condiciones_economicas aÃºn no existe.',
          true,
          String(valor),
        );
        state.assessments.push(assessment);
        state.technical_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        continue;
      }
      state.assessments.push(buildResolvedAssessment(
        decisionRow,
        'CASO_ESPECIAL_COMPLETO',
        String(valor),
        `Motivo=${parsed.motivo ?? ''} | VigenciaDesde=${parsed.vigencia_desde ?? ''} | VigenciaHasta=${parsed.vigencia_hasta ?? ''}`,
      ));
      continue;
    }

    if (decisionRow.sheet === 'UBICACIONES') {
      if (normalizedDecision === 'USAR_EXISTENTE') {
        const existing = ubicacionesByName.get(normalizeUbicacionName(decisionRow.value));
        if (!existing) {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'ERROR_REAL_DATOS',
            'UBICACION_DESTINO_NO_EXISTE',
            `La ubicaciÃ³n "${decisionRow.value}" no existe actualmente en contrato_ubicaciones_laborales del contrato 24.`,
            false,
            decisionRow.value,
          );
          state.assessments.push(assessment);
          state.data_errors.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
          continue;
        }
        state.assessments.push(buildResolvedAssessment(decisionRow, 'UBICACION_EXISTENTE_CONFIRMADA', existing.nombre_ubicacion));
        continue;
      }

      if (normalizedDecision === 'CREAR_NUEVA_UBICACION') {
        if (!decisionRow.value) {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'DECISION_HUMANA_PENDIENTE',
            'UBICACION_NUEVA_SIN_NOMBRE',
            'Hace falta el nombre canÃ³nico de la nueva ubicaciÃ³n.',
            false,
          );
          state.assessments.push(assessment);
          state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
          continue;
        }

        const existing = ubicacionesByName.get(normalizeUbicacionName(decisionRow.value));
        if (existing) {
          state.assessments.push(buildResolvedAssessment(decisionRow, 'UBICACION_YA_EXISTE', existing.nombre_ubicacion));
        } else {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'PARAMETRIZACION_TECNICA_REQUERIDA',
            'PARAMETRIZACION_UBICACION_REQUERIDA',
            `Debe crearse la ubicaciÃ³n laboral "${decisionRow.value}" en contrato_ubicaciones_laborales del contrato 24.`,
            true,
            decisionRow.value,
          );
          state.assessments.push(assessment);
          state.technical_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        }
        continue;
      }

      if (normalizedDecision === 'NO_APLICA') {
        state.assessments.push(buildResolvedAssessment(decisionRow, 'UBICACION_NO_APLICA', 'NO_APLICA'));
      } else {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'DECISION_UBICACION_INVALIDA',
          'Se esperaba USAR_EXISTENTE, CREAR_NUEVA_UBICACION o NO_APLICA.',
          false,
          normalizedDecision,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
      }
      continue;
    }

    if (decisionRow.problem === 'COMBINACION_SEDE_MODALIDAD_INVALIDA') {
      const coverageTarget = resolveCoverageTarget(decisionRow, v4Row);
      if (
        normalizedDecision === 'ACEPTAR_OPCION_FOCALIZACION' &&
        coverageTarget.municipio &&
        coverageTarget.institucion &&
        coverageTarget.sede &&
        coverageTarget.modalidad
      ) {
        state.assessments.push(buildResolvedAssessment(
          decisionRow,
          'FOCALIZACION_ACEPTADA',
          buildCoverageKey([coverageTarget.municipio, coverageTarget.institucion, coverageTarget.sede, coverageTarget.modalidad]),
        ));
      } else {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'FOCALIZACION_SIN_OPCION_CONSUMIBLE',
          'No hay una opciÃ³n de focalizaciÃ³n consumible con la decisiÃ³n diligenciada.',
          false,
          normalizedDecision,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
      }
      continue;
    }

    if (decisionRow.problem === 'TIPO_DOCUMENTO_PPT_NO_CATALOGADO') {
      if (normalizedDecision === 'CREAR_TIPO_PPT') {
        if (hasPptDocType) {
          state.assessments.push(buildResolvedAssessment(decisionRow, 'TIPO_PPT_YA_EXISTE', 'PPT'));
        } else {
          const assessment = buildBlockedAssessment(
            decisionRow,
            'PARAMETRIZACION_TECNICA_REQUERIDA',
            'PARAMETRIZACION_TIPO_DOCUMENTO_PPT_REQUERIDA',
            'Debe crearse el tipo documental PPT / PERMISO POR PROTECCIÃ“N TEMPORAL antes del smoke.',
            true,
            'PPT',
          );
          state.assessments.push(assessment);
          state.technical_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
        }
      } else {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'DECISION_HUMANA_PENDIENTE',
          'DECISION_PPT_INVALIDA',
          'Se esperaba CREAR_TIPO_PPT o una correcciÃ³n documental explÃ­cita.',
          false,
          normalizedDecision,
        );
        state.assessments.push(assessment);
        state.human_pending.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
      }
      continue;
    }

    if (decisionRow.problem === 'TIPO_VINCULACION_REQUERIDO') {
      if (tipoVincPermitidos.has(normalizedDecision) && tipoVincByCode.has(normalizedDecision.replace('LABORAL_', ''))) {
        state.import_vinc_plan = deriveFallbackVincPlan(v4Row);
        state.assessments.push(buildResolvedAssessment(decisionRow, 'TIPO_VINCULACION_CONFIRMADO', normalizedDecision));
      } else if (normalizedDecision === 'OPS' && tipoVincByCode.has('OPS')) {
        state.import_vinc_plan = deriveFallbackVincPlan(v4Row);
        state.assessments.push(buildResolvedAssessment(decisionRow, 'TIPO_VINCULACION_CONFIRMADO', normalizedDecision));
      } else {
        const assessment = buildBlockedAssessment(
          decisionRow,
          'ERROR_REAL_DATOS',
          'TIPO_VINCULACION_NO_DISPONIBLE',
          `La decisiÃ³n "${decisionRow.decision}" no coincide con un tipo_vinculaciÃ³n disponible.`,
          false,
          normalizedDecision,
        );
        state.assessments.push(assessment);
        state.data_errors.push({ code: assessment.code, detail: assessment.detail, kind: assessment.kind as BlockerKind, sheet: assessment.sheet });
      }
      continue;
    }
  }

  const coveragePreview = cloneCoveragePreview(v4.coverage_preview);
  const baselineCoverageRow = rowsByFila.get(BASELINE_PREVIOUSLY_ACCEPTED_COVERAGE_FILA);
  if (baselineCoverageRow) {
    const baselineKey = buildCoverageKey([
      baselineCoverageRow.municipio_propuesto ?? baselineCoverageRow.municipio_origen ?? '',
      baselineCoverageRow.institucion_propuesta ?? baselineCoverageRow.institucion_origen ?? '',
      baselineCoverageRow.sede_propuesta ?? baselineCoverageRow.sede_origen ?? '',
      baselineCoverageRow.modalidad_propuesta ?? baselineCoverageRow.modalidad_origen ?? '',
    ]);
    const baselinePreviewRow = coveragePreview.find((item) =>
      buildCoverageKey([item.municipio, item.institucion, item.sede, item.modalidad]) === baselineKey,
    );
    if (baselinePreviewRow) {
      baselinePreviewRow.asignadas_propuestas += 1;
    }
  }

  const licitacionMap = new Map(
    baseline.licitacion_perfiles.map((row) => [row.perfil, { ...row }]),
  );
  const finalCounts = {
    active_with_coverage: baseline.categories.active_with_coverage,
    active_without_coverage: baseline.categories.active_without_coverage,
    retired_historical: baseline.categories.retired_historical,
    review: 0,
  };
  const finalImportableCounts = { ...baseline.importable_counts };
  const autoResolvedCoverageRow = rowsByFila.get(AUTO_RESOLVED_COVERAGE_FILA);
  const autoResolvedCoverageTarget = autoResolvedCoverageRow
    ? {
      municipio: autoResolvedCoverageRow.municipio_origen ?? 'LEJANÍAS',
      institucion: autoResolvedCoverageRow.institucion_origen ?? 'INSTITUCIÓN EDUCATIVA DE LEJANIAS',
      sede: 'SEDE PRINCIPAL LEJANIAS',
      modalidad: autoResolvedCoverageRow.modalidad_origen ?? 'CAA',
    }
    : null;

  if (autoResolvedCoverageRow && autoResolvedCoverageTarget) {
    finalCounts.active_with_coverage += 1;
    if ((autoResolvedCoverageRow.persona_plan ?? 'REVISAR') === 'PERSONA_CREAR') finalImportableCounts.personas_crear += 1;
    if ((autoResolvedCoverageRow.persona_plan ?? 'REVISAR') === 'PERSONA_REUTILIZAR') finalImportableCounts.personas_reutilizar += 1;
    if ((autoResolvedCoverageRow.vinculacion_plan ?? 'REVISAR') === 'VINCULACION_CREAR') finalImportableCounts.vinculaciones_crear += 1;
    if ((autoResolvedCoverageRow.vinculacion_plan ?? 'REVISAR') === 'VINCULACION_REUTILIZAR') finalImportableCounts.vinculaciones_reutilizar += 1;

    const autoResolvedPreviewRow = coveragePreview.find((item) => buildCoverageKey([item.municipio, item.institucion, item.sede, item.modalidad]) === buildCoverageKey([autoResolvedCoverageTarget.municipio, autoResolvedCoverageTarget.institucion, autoResolvedCoverageTarget.sede, autoResolvedCoverageTarget.modalidad]));
    if (autoResolvedPreviewRow) {
      autoResolvedPreviewRow.asignadas_propuestas += 1;
    }
  }

  for (const state of rowStates.values()) {
    if (state.assessments.length !== state.decision_rows.length) {
      state.human_pending.push({
        code: 'DECISION_NO_PROCESADA',
        detail: 'La fila tiene una decisiÃ³n que no pudo clasificarse.',
        kind: 'DECISION_HUMANA_PENDIENTE',
        sheet: state.decision_rows[0]?.sheet ?? 'FECHAS',
      });
    }

    const row = state.row;
    const coverageCandidate = state.is_manipuladora ||
      normalizeText(state.method_payment) === 'COBERTURA' ||
      normalizeText(state.method_payment) === 'CASO_ESPECIAL';

    if (state.human_pending.length > 0 || state.data_errors.length > 0 || state.technical_pending.length > 0) {
      state.category = 'REVISAR';
      finalCounts.review += 1;
      continue;
    }

    state.import_person_plan = state.import_person_plan ?? deriveFallbackPersonPlan(row);
    state.import_vinc_plan = state.import_vinc_plan ?? deriveFallbackVincPlan(row);
    state.category = coverageCandidate ? 'IMPORTAR_ACTIVA_CON_COBERTURA' : 'IMPORTAR_ACTIVA_SIN_COBERTURA';

    if (state.category === 'IMPORTAR_ACTIVA_CON_COBERTURA') {
      finalCounts.active_with_coverage += 1;
      const target = resolveCoverageTarget(state.decision_rows[0]!, row);
      const key = buildCoverageKey([target.municipio, target.institucion, target.sede, target.modalidad]);
      const previewRow = coveragePreview.find((item) => buildCoverageKey([item.municipio, item.institucion, item.sede, item.modalidad]) === key);
      if (previewRow) {
        previewRow.asignadas_propuestas += 1;
      }
    } else {
      finalCounts.active_without_coverage += 1;
    }

    if (state.import_person_plan === 'PERSONA_CREAR') finalImportableCounts.personas_crear += 1;
    if (state.import_person_plan === 'PERSONA_REUTILIZAR') finalImportableCounts.personas_reutilizar += 1;
    if (state.import_vinc_plan === 'VINCULACION_CREAR') finalImportableCounts.vinculaciones_crear += 1;
    if (state.import_vinc_plan === 'VINCULACION_REUTILIZAR') finalImportableCounts.vinculaciones_reutilizar += 1;

    if (state.licitacion_perfil) {
      const current = licitacionMap.get(state.licitacion_perfil);
      if (current) {
        current.presentados += 1;
      }
    }
  }

  const manipPendingRows = [...rowStates.values()].filter((state) => state.is_manipuladora).length;
  const manipResolvedRows = [...rowStates.values()].filter((state) => state.is_manipuladora && state.category === 'IMPORTAR_ACTIVA_CON_COBERTURA').length;
  const manipActivas = baseline.manipuladoras.total - baseline.manipuladoras.retiradas;
  const manipuladoras = {
    total: baseline.manipuladoras.total,
    activas: manipActivas,
    retiradas: baseline.manipuladoras.retiradas,
    asignables: baseline.manipuladoras.asignables + manipResolvedRows + (autoResolvedCoverageRow && looksLikeManipuladoraCargo(autoResolvedCoverageRow.cargo_origen) ? 1 : 0),
    pendientes: manipPendingRows - manipResolvedRows,
  };

  const coverageSummary = recalcCoverageSummary(coveragePreview);
  const licitacionPerfiles = [...licitacionMap.values()].map((row) => ({
    ...row,
    diferencia: row.presentados - row.requeridos,
    estado: row.presentados === row.requeridos ? 'CUMPLE' : row.presentados < row.requeridos ? 'DEFICIT' : 'EXCESO',
  }));

  const decisionsConsumed = decisionRows.filter((row) => {
    const state = rowStates.get(row.fila);
    return state?.assessments.some((assessment) => assessment.sheet === row.sheet && assessment.row_decision === buildDecisionLabel(row) && assessment.consumed);
  }).length;
  const decisionsInvalid = decisionRows.length - decisionsConsumed;

  const humanPendingRows = [...rowStates.values()].filter((state) => state.human_pending.length > 0);
  const dataErrorRows = [...rowStates.values()].filter((state) => state.data_errors.length > 0);
  const technicalPendingRows = [...rowStates.values()].filter((state) => state.technical_pending.length > 0);

  const technicalParamList = uniqueStrings([
    ...technicalPendingRows.flatMap((state) => state.technical_pending.map((item) => item.detail)),
  ]);

  let smokePlanPath: string | null = null;
  if (humanPendingRows.length === 0 && dataErrorRows.length === 0 && technicalPendingRows.length === 0) {
    const samples: SmokePlanRow[] = [];
    const pushSample = (kind: SmokeSampleKind, predicate: (state: RowResolutionState) => boolean, observacion: string): void => {
      const existingFilenames = new Set(samples.map((item) => item.fila_xlsx));
      const match = [...rowStates.values()].find((state) => !existingFilenames.has(state.row?.fila_origen ?? 0) && predicate(state));
      if (!match || !match.row) return;
      samples.push({
        cargo: match.row.cargo_origen ?? contextValue(match.context, 'Cargo'),
        categoria_final: match.category,
        cedula: match.cedula,
        criterio: kind,
        fila_xlsx: match.row.fila_origen,
        metodo_pago: match.method_payment,
        nombre: match.name,
        observacion,
      });
    };

    pushSample('MANIPULADORA_COBERTURA', (state) => state.category === 'IMPORTAR_ACTIVA_CON_COBERTURA' && state.is_manipuladora, 'Manipuladora activa con cobertura.');
    pushSample('PERSONA_REUTILIZADA', (state) => state.import_person_plan === 'PERSONA_REUTILIZAR' && state.category !== 'REVISAR', 'Reutiliza persona existente.');
    pushSample('PERSONA_NUEVA', (state) => state.import_person_plan === 'PERSONA_CREAR' && state.category !== 'REVISAR', 'Crea persona nueva.');
    pushSample('ADMINISTRATIVO', (state) => state.category === 'IMPORTAR_ACTIVA_SIN_COBERTURA' && !state.is_manipuladora, 'Administrativo.');
    pushSample('LABORAL', (state) => normalizeText(contextValue(state.context, 'VinculaciÃ³n')) === 'LABORAL' && state.category !== 'REVISAR', 'VinculaciÃ³n laboral.');
    pushSample('OPS', (state) => state.is_ops && state.category !== 'REVISAR', 'PrestaciÃ³n de servicios.');
    pushSample('LICITACION', (state) => Boolean(state.licitacion_perfil) && state.category !== 'REVISAR', 'Cuenta en licitaciÃ³n.');
    pushSample('CASO_ESPECIAL', (state) => state.is_case_special && state.category !== 'REVISAR', 'Caso especial.');
    if (!samples.some((item) => item.criterio === 'RETIRADA_HISTORICA')) {
      const existingFilenames = new Set(samples.map((item) => item.fila_xlsx));
      const retired = v4.report_rows.find((row) =>
        row.categoria_final === 'IMPORTAR_RETIRADA_HISTORICA' &&
        !existingFilenames.has(row.fila_origen),
      );
      if (retired?.fila_origen) {
        samples.push({
          cargo: retired.cargo_origen ?? null,
          categoria_final: 'IMPORTAR_RETIRADA_HISTORICA',
          cedula: normalizeDoc(retired.cedula),
          criterio: 'RETIRADA_HISTORICA',
          fila_xlsx: retired.fila_origen,
          metodo_pago: retired.metodo_pago_origen ?? null,
          nombre: String(retired.nombre ?? '').trim(),
          observacion: 'Retirada histórica con fecha_fin inclusiva.',
        });
      }
    }

    if (samples.length > 0) {
      await Promise.all([
        writeFile(path.resolve(SMOKE_PLAN_JSON), JSON.stringify(samples, null, 2), 'utf8'),
        writeFile(path.resolve(SMOKE_PLAN_CSV), buildCsv(samples, [
          'criterio',
          'fila_xlsx',
          'cedula',
          'nombre',
          'categoria_final',
          'cargo',
          'metodo_pago',
          'observacion',
        ]), 'utf8'),
      ]);
      smokePlanPath = path.resolve(SMOKE_PLAN_JSON);
    }
  }

  const summary = {
    baseline_review: baseline.categories.review,
    categories: finalCounts,
    coverage_summary: coverageSummary,
    data_error_rows: dataErrorRows.length,
    decision_humana_pendiente_rows: humanPendingRows.length,
    decisiones_consumidas_correctamente: decisionsConsumed,
    decisiones_encontradas: decisionRows.length,
    decisiones_invalidas: decisionsInvalid,
    fechas_pendientes: humanPendingRows.filter((state) => state.decision_rows.some((row) => row.sheet === 'FECHAS')).length,
    files: {
      decisiones_reales: decisionesMeta,
      personal: personalMeta,
    },
    importable_counts: finalImportableCounts,
    licitacion_perfiles: licitacionPerfiles,
    manipuladoras,
    pending_counts: {
      caso_especiales: rowStates.size === 0 ? 0 : [...rowStates.values()].filter((state) =>
        state.human_pending.some((item) => item.sheet === 'CASOS_ESPECIALES') ||
        state.technical_pending.some((item) => item.sheet === 'CASOS_ESPECIALES'),
      ).length,
      catalogos: [...rowStates.values()].filter((state) =>
        state.human_pending.some((item) => item.sheet === 'CATALOGOS') ||
        state.technical_pending.some((item) => item.sheet === 'CATALOGOS'),
      ).length,
      fechas: humanPendingRows.filter((state) => state.human_pending.some((item) => item.sheet === 'FECHAS')).length,
      identidades: [...rowStates.values()].filter((state) =>
        state.human_pending.some((item) => item.sheet === 'IDENTIDADES') ||
        state.technical_pending.some((item) => item.sheet === 'IDENTIDADES'),
      ).length,
      ubicaciones: [...rowStates.values()].filter((state) =>
        state.human_pending.some((item) => item.sheet === 'UBICACIONES') ||
        state.technical_pending.some((item) => item.sheet === 'UBICACIONES'),
      ).length,
    },
    postcheck_bd: {
      before: supportData.counts_before,
      after: supportData.counts_after,
    },
    ppt_status: hasPptDocType ? 'YA_CATALOGADO' : 'PARAMETRIZACION_TIPO_DOCUMENTO_REQUERIDA',
    review_zero: finalCounts.review === 0,
    row_states: [...rowStates.values()].map((state) => ({
      assessments: state.assessments,
      category: state.category,
      cedula: state.cedula,
      data_errors: state.data_errors,
      fila_xlsx: state.row?.fila_origen ?? state.decision_rows[0]?.fila ?? null,
      human_pending: state.human_pending,
      licitacion_perfil: state.licitacion_perfil,
      method_payment: state.method_payment,
      name: state.name,
      technical_pending: state.technical_pending,
    })),
    smoke_plan_path: smokePlanPath,
    technical_parametrizations: technicalParamList,
    technical_pending_rows: technicalPendingRows.length,
    total_filas: 772,
    writes_to_db: 0,
  };

  await writeFile(path.resolve(SUMMARY_JSON), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});








