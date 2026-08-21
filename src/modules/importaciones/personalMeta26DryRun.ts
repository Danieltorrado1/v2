import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool } from '../../config/db';
import {
  matchCoverageAssignmentDetailed,
  type CoverageAliasProposal,
  type CoverageFailureCause,
  type CoverageStageAudit,
  type HelperInstitucionRow,
  type HelperModalidadRow,
  type HelperMunicipioRow,
  type HelperSedeRow
} from './personalMeta26DryRun.helpers';
import { buildCoverageDelta, buildLicitacionQuotaDelta, looksLikeManipuladoraCargo } from '../vinculaciones/vinculaciones.personal.domain';
import { METODOS_PAGO } from '../vinculaciones/vinculaciones.schemas';

export const META26_RUN_DATE = '2026-08-21';
export const META26_FILE = 'data/Importacion_Personal_CONSORCIO_PAE_META_26.xlsx';
export const META26_CONTRATO_ID = 24;
export const META26_EMPRESA_ID = 15;
export const META26_TARGET_REASON_SOCIAL = 'CONSORCIO PAE META-26';

const META26_REASON_SOCIAL_ALIASES = [
  'CONSORCIO PAE META-26',
  'CONSORCIO PAE META 26'
] as const;

const ACTIVE_VINC_STATES = new Set(['ACTIVA', 'ACTIVO', 'SUSPENDIDA']);
const MAIN_SHEET_NAME = 'IMPORTACION_META';

type ReasonSocialClass =
  | 'META26'
  | 'OTRA_RAZON_SOCIAL'
  | 'SIN_RAZON_SOCIAL'
  | 'RAZON_SOCIAL_AMBIGUA';

type PersonaIdentityStatus =
  | 'PERSONA_NUEVA'
  | 'PERSONA_EXISTENTE'
  | 'DUPLICADO_EXACTO'
  | 'MISMA_CEDULA_NOMBRE_DIFERENTE'
  | 'DOCUMENTO_FALTANTE'
  | 'DOCUMENTO_INVALIDO'
  | 'TIPO_DOCUMENTO_NO_RECONOCIDO';

type VinculacionPlanStatus =
  | 'VINCULACION_CREAR'
  | 'VINCULACION_REUTILIZAR'
  | 'REVISAR';

type CoverageMatchStatus =
  | 'ASIGNACION_OK'
  | 'MUNICIPIO_NO_RECONOCIDO'
  | 'INSTITUCION_NO_RECONOCIDA'
  | 'SEDE_NO_RECONOCIDA'
  | 'MODALIDAD_NO_RECONOCIDA'
  | 'SEDE_MODALIDAD_NO_EXISTE'
  | 'AMBIGUA'
  | 'SIN_ASIGNACION'
  | 'REVISAR'
  | 'NO_APLICA';

type LaborLocationStatus =
  | 'UBICACION_OK'
  | 'UBICACION_NO_RECONOCIDA'
  | 'UBICACION_AMBIGUA'
  | 'SIN_UBICACION'
  | 'NO_APLICA';

type FechaIssueCode =
  | 'FECHA_INICIO_FALTANTE'
  | 'FECHA_FIN_REQUERIDA_FALTANTE'
  | 'FECHA_INVALIDA'
  | 'FIN_ANTERIOR_INICIO'
  | 'COMBINACION_CONTRACTUAL_INVALIDA';

type ImportPlanState =
  | 'LISTO_CREAR_PERSONA'
  | 'LISTO_REUTILIZAR_PERSONA'
  | 'LISTO_CREAR_VINCULACION'
  | 'LISTO_REUTILIZAR_VINCULACION'
  | 'LISTO_ASIGNACION_COBERTURA'
  | 'LISTO_ASIGNACION_LABORAL'
  | 'LISTO_PRESENTACION_LICITACION'
  | 'REVISAR'
  | 'EXCLUIR_OTRA_RAZON_SOCIAL';

interface CountRow extends QueryResultRow {
  total: number;
}

interface ContractRow extends QueryResultRow {
  empresa_id: number;
  fecha_finalizacion: Date | string | null;
  fecha_inicio: Date | string | null;
  id: number;
  nombre_empresa: string;
  numero_contrato: string | null;
}

interface DocTypeRow extends QueryResultRow {
  codigo: string | null;
  es_identificacion_personal: boolean | null;
  id: number;
  nombre_documento: string;
}

interface TipoVincRow extends QueryResultRow {
  codigo: string | null;
  id: number;
  nombre_vinculacion: string;
}

interface CargoRow extends QueryResultRow {
  id: number;
  nombre_cargo: string;
}

interface UbicacionRow extends QueryResultRow {
  id: number;
  nombre_ubicacion: string;
}

interface PerfilRow extends QueryResultRow {
  cantidad_requerida: number;
  codigo_perfil: string;
  contrato_cargo_equivalente_id: number | null;
  id: number;
  nombre_perfil: string;
}

interface FocalizacionRow extends QueryResultRow {
  cobertura_requerida: number | null;
  focalizacion_final_id: number;
  institucion_id: number | null;
  institucion_nombre: string | null;
  modalidad_id: number | null;
  modalidad_codigo_base: string | null;
  modalidad_codigo_original: string | null;
  modalidad_nombre: string | null;
  municipio_id: number | null;
  municipio_nombre: string | null;
  sede_id: number | null;
  sede_modalidad_id: number | null;
  sede_nombre: string | null;
}

interface InstitucionAliasRow extends QueryResultRow {
  institucion_id: number;
  municipio_id: number | null;
  nombre_alias: string;
}

interface SedeAliasRow extends QueryResultRow {
  institucion_id: number | null;
  sede_id: number;
  nombre_alias: string;
}

interface ModalidadAliasRow extends QueryResultRow {
  alias: string;
  modalidad_id: number;
}

interface ExistingPersonRow extends QueryResultRow {
  identificacion_id: number;
  nombre_bd: string;
  normalizado_documento: string;
  persona_id: number;
  tipo_documento_codigo: string | null;
  tipo_documento_id: number;
}

interface ExistingVincRow extends QueryResultRow {
  contrato_cargo_nombre: string | null;
  contrato_id: number;
  empresa_id: number | null;
  estado_vinculacion: string | null;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string | null;
  id: number;
  numero_contrato: string | null;
  persona_id: number;
  tipo_vinculacion_codigo: string | null;
}

interface WorkbookSheetInspection {
  calculated_columns: string[];
  empty_columns: string[];
  headers: string[];
  header_row: number | null;
  name: string;
  total_rows: number;
  useful_rows: number;
}

export interface WorkbookInspection {
  file_path: string;
  sha256: string;
  size_bytes: number;
  sheets: WorkbookSheetInspection[];
}

export interface SourceMainRow {
  asignacion_laboral: string | null;
  cargo_laboral: string | null;
  celular: string | null;
  contrato: string | null;
  correo: string | null;
  fecha_fin_contrato: string | null;
  fecha_inicio_contrato: string | null;
  fecha_nacimiento: string | null;
  fila_origen: number;
  hoja: string;
  institucion_educativa: string | null;
  metodo_pago: string | null;
  modalidad: string | null;
  municipio: string | null;
  nit: string | null;
  numero_documento: string | null;
  observaciones: string | null;
  perfil_licitacion: string | null;
  presentado_licitacion: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  raw: Record<string, unknown>;
  razon_social: string | null;
  sede: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo: string | null;
  tipo_contrato: string | null;
  tipo_documento: string | null;
  tipo_vinculacion: string | null;
  ubicacion_operativa: string | null;
  valor_caso_especial: string | null;
}

export interface ReviewCsvRow {
  accion_requerida: string;
  cargo_origen: string | null;
  cedula: string | null;
  fila_origen: number;
  hoja: string;
  nombre: string | null;
  problema: string;
  propuesta: string | null;
  razon_social: string | null;
  valor_origen: string | null;
}

export interface AliasProposalCsvRow extends CoverageAliasProposal {
  causa: CoverageFailureCause | null;
}

export interface CoveragePreviewRow {
  asignadas_propuestas: number;
  diferencia: number;
  estado: string;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  requeridas: number;
  sede: string | null;
}

export interface LicitacionPreviewRow {
  diferencia: number;
  estado: string;
  perfil: string;
  presentados: number;
  requeridos: number;
}

export interface DryRunRowReport {
  asignacion_laboral_origen: string | null;
  cargo_mapping_propuesto: string | null;
  cargo_origen: string | null;
  cargo_resuelto: string | null;
  casos_no_bloqueantes: string[];
  cedula: string | null;
  cobertura_auditoria: CoverageStageAudit[];
  cobertura_estado: CoverageMatchStatus;
  institucion_origen: string | null;
  estado_importacion: ImportPlanState[];
  fecha_errores: FechaIssueCode[];
  fila_origen: number;
  hoja: string;
  identidad_estado: PersonaIdentityStatus;
  licitacion_documental_estado: 'PENDIENTE_CONFIGURACION_REQUISITOS' | 'NO_APLICA';
  licitacion_perfil_resuelto: string | null;
  metodo_pago_origen: string | null;
  modalidad_origen: string | null;
  municipio_origen: string | null;
  nombre: string | null;
  observaciones_origen: string | null;
  persona_existente_id: number | null;
  persona_plan: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | 'REVISAR';
  problemas_bloqueantes: string[];
  razon_social: string | null;
  razon_social_clase: ReasonSocialClass;
  sede_origen: string | null;
  sede_modalidad_id: number | null;
  tipo_contrato_origen: string | null;
  tipo_documento_origen: string | null;
  tipo_documento_resuelto: string | null;
  tipo_vinculacion_origen: string | null;
  tipo_vinculacion_resuelto: string | null;
  ubicacion_estado: LaborLocationStatus;
  ubicacion_mapping_propuesto: string | null;
  ubicacion_operativa_origen: string | null;
  ubicacion_resuelta: string | null;
  vinculacion_existente_id: number | null;
  vinculacion_plan: VinculacionPlanStatus;
}

interface TipoContratoValidation {
  normalized: 'TF' | 'TI' | 'OL' | 'OPS' | null;
  issues: FechaIssueCode[];
}

interface CoverageMatchResult {
  candidate_count: number;
  focalizacion_final_id: number | null;
  sede_modalidad_id: number | null;
  status: CoverageMatchStatus;
}

interface ContractFeatures {
  has_valor_caso_especial_column: boolean;
}

interface DatabaseCounts {
  cobertura_asignaciones: number;
  personal_asignaciones_laborales: number;
  personal_presentaciones_licitacion: number;
  personas: number;
  vinculaciones: number;
}

interface RunContext {
  cargo_rows: CargoRow[];
  contract: ContractRow;
  contract_features: ContractFeatures;
  counts_after: DatabaseCounts;
  counts_before: DatabaseCounts;
  doc_type_rows: DocTypeRow[];
  existing_people: Map<string, ExistingPersonRow[]>;
  existing_vinculaciones: Map<number, ExistingVincRow[]>;
  focalizacion_rows: FocalizacionRow[];
  institucion_alias_rows: InstitucionAliasRow[];
  institucion_rows: HelperInstitucionRow[];
  modalidad_rows: HelperModalidadRow[];
  modalidad_alias_rows: ModalidadAliasRow[];
  municipio_rows: HelperMunicipioRow[];
  perfil_rows: PerfilRow[];
  sede_alias_rows: SedeAliasRow[];
  sede_rows: HelperSedeRow[];
  tipo_vinc_rows: TipoVincRow[];
  ubicacion_rows: UbicacionRow[];
}

export interface PersonalMeta26DryRunReport {
  bd_after: DatabaseCounts;
  bd_before: DatabaseCounts;
  blockers: string[];
  changed_operational_detected: number;
  contract: {
    empresa_id: number;
    fecha_finalizacion: string | null;
    fecha_inicio: string | null;
    id: number;
    nombre_empresa: string;
    numero_contrato: string | null;
  };
  coverage_preview: CoveragePreviewRow[];
  coverage_summary: {
    asignadas_total: number;
    completas: number;
    deficitarias: number;
    deficit_total: number;
    exceso_total: number;
    excesos: number;
    requeridas_total: number;
    sin_personal: number;
  };
  fields_missing_blocking: Array<{ campo: string; count: number }>;
  fields_missing_non_blocking: Array<{ campo: string; count: number }>;
  importer_supports_real_xlsx: boolean;
  is_safe_for_real_import: boolean;
  licitacion_preview: LicitacionPreviewRow[];
  licitacion_summary: {
    per_profile: Record<string, LicitacionPreviewRow & { documental_estado: 'PENDIENTE_CONFIGURACION_REQUISITOS' }>;
    total_presentaciones: number;
    total_requeridas: number;
  };
  manual_decision_rows: ReviewCsvRow[];
  methods_found: string[];
  modelo_alertas: string[];
  otras_razones_sociales: string[];
  proposed_aliases: AliasProposalCsvRow[];
  report_rows: DryRunRowReport[];
  review_rows: ReviewCsvRow[];
  tipos_contrato_encontrados: string[];
  tipos_vinculacion_encontrados: string[];
  ubicaciones_encontradas: string[];
  ubicaciones_mapeadas: string[];
  ubicaciones_no_reconocidas: string[];
  unique_identity_conflicts: Array<{ cedula: string; nombre_archivo: string | null; nombre_bd: string | null }>;
  unique_identity_duplicates: string[];
  unique_people: {
    personas_crear: number;
    personas_reutilizar: number;
    personas_unicas: number;
    personas_vinc_previas_otro_contrato: number;
    vinculaciones_crear: number;
    vinculaciones_reutilizar: number;
  };
  workbook: WorkbookInspection;
}

const normalizeComparableText = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const normalizeAlphaNumericToken = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  return normalizeComparableText(value).replace(/[^A-Z0-9]+/g, '');
};

export const normalizeIdentityDocument = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  const fixedDecimal = /^\d+\.0+$/.test(trimmed) ? trimmed.replace(/\.0+$/, '') : trimmed;
  return fixedDecimal.replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
};

export const buildComparableName = (parts: Array<string | null | undefined>): string => normalizeComparableText(parts.filter(Boolean).join(' '));

const toDisplayName = (row: Pick<SourceMainRow, 'primer_nombre' | 'segundo_nombre' | 'primer_apellido' | 'segundo_apellido'>): string | null => {
  const parts = [
    row.primer_nombre,
    row.segundo_nombre,
    row.primer_apellido,
    row.segundo_apellido
  ].filter((value): value is string => Boolean(value && value.trim()));

  return parts.length > 0 ? parts.join(' ') : null;
};

export const classifyReasonSocial = (value: string | null | undefined): ReasonSocialClass => {
  if (!value || value.trim().length === 0) {
    return 'SIN_RAZON_SOCIAL';
  }

  const normalized = normalizeComparableText(value);
  const exactAlias = META26_REASON_SOCIAL_ALIASES.some((alias) => normalizeComparableText(alias) === normalized);

  if (exactAlias) {
    return 'META26';
  }

  const compact = normalizeAlphaNumericToken(value);
  if (compact.includes('CONSORCIO') && compact.includes('PAE') && compact.includes('META') && compact.includes('26')) {
    return 'RAZON_SOCIAL_AMBIGUA';
  }

  return 'OTRA_RAZON_SOCIAL';
};

export const normalizePresentedLicitacion = (value: string | null | undefined): boolean | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  if (normalized === 'SI' || normalized === 'S' || normalized === 'TRUE') {
    return true;
  }

  if (normalized === 'NO' || normalized === 'N' || normalized === 'FALSE') {
    return false;
  }

  return null;
};

const normalizeNullableCellText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const excelDateToIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text;
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
      const [day, month, year] = text.split('/');
      if (!day || !month || !year) {
        return null;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y)}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  return null;
};

const cellToHeader = (value: unknown): string => normalizeNullableCellText(value) ?? '';

const getWorksheetMatrix = (sheet: XLSX.WorkSheet): unknown[][] => XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: true,
  defval: null,
  blankrows: false
}) as unknown[][];

const detectHeaderRow = (rows: unknown[][]): { headers: string[]; rowNumber: number | null } => {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    const cells = row.filter((value) => normalizeNullableCellText(value) !== null);
    if (cells.length >= 2) {
      return {
        headers: row.map(cellToHeader),
        rowNumber: index + 1
      };
    }
  }

  return { headers: [], rowNumber: null };
};

const inspectSheet = (name: string, sheet: XLSX.WorkSheet): WorkbookSheetInspection => {
  const rows = getWorksheetMatrix(sheet);
  const { headers, rowNumber } = detectHeaderRow(rows);
  const dataRows = rowNumber === null ? [] : rows.slice(rowNumber);
  const usefulRows = dataRows.filter((row) => row.some((value) => normalizeNullableCellText(value) !== null));
  const emptyColumns = headers
    .map((header, index) => ({
      header,
      index
    }))
    .filter(({ header }) => header.length > 0)
    .filter(({ index }) => usefulRows.every((row) => normalizeNullableCellText(row[index]) === null))
    .map(({ header }) => header);

  const calculatedColumns = headers
    .map((header, index) => {
      if (!header || !sheet['!ref']) {
        return null;
      }

      const range = XLSX.utils.decode_range(sheet['!ref']);
      const columnIndex = range.s.c + index;
      for (let row = (rowNumber ?? 1) + 1; row <= range.e.r + 1; row += 1) {
        const address = XLSX.utils.encode_cell({ c: columnIndex, r: row - 1 });
        const cell = sheet[address];
        if (cell?.f) {
          return header;
        }
      }

      return null;
    })
    .filter((header): header is string => Boolean(header));

  return {
    name,
    total_rows: rows.length,
    header_row: rowNumber,
    headers: headers.filter((header) => header.length > 0),
    useful_rows: usefulRows.length,
    empty_columns: emptyColumns,
    calculated_columns: calculatedColumns
  };
};

const buildWorkbookInspection = async (filePath: string): Promise<{ buffer: Buffer; workbook: XLSX.WorkBook; inspection: WorkbookInspection }> => {
  const absolutePath = path.resolve(filePath);
  const [buffer, fileStats] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  return {
    buffer,
    workbook,
    inspection: {
      file_path: filePath,
      sha256,
      size_bytes: fileStats.size,
      sheets: workbook.SheetNames
        .map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return sheet ? inspectSheet(sheetName, sheet) : null;
        })
        .filter((sheet): sheet is WorkbookSheetInspection => sheet !== null)
    }
  };
};

const parseMainSheetRows = (workbook: XLSX.WorkBook): SourceMainRow[] => {
  const sheet = workbook.Sheets[MAIN_SHEET_NAME];
  if (!sheet) {
    throw new Error(`No se encontró la hoja ${MAIN_SHEET_NAME}`);
  }

  const rows = getWorksheetMatrix(sheet);
  const { headers, rowNumber } = detectHeaderRow(rows);
  if (rowNumber === null) {
    return [];
  }

  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header) {
      headerIndex.set(header, index);
    }
  });

  const getCell = (row: unknown[], header: string): unknown => {
    const index = headerIndex.get(header);
    return index === undefined ? null : row[index] ?? null;
  };

  return rows.slice(rowNumber).map((row, offset) => {
    const fila_origen = rowNumber + offset + 1;
    const raw: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) {
        raw[header] = row[index] ?? null;
      }
    });

    return {
      hoja: MAIN_SHEET_NAME,
      fila_origen,
      raw,
      razon_social: normalizeNullableCellText(getCell(row, 'RAZON_SOCIAL')),
      nit: normalizeNullableCellText(getCell(row, 'NIT')),
      contrato: normalizeNullableCellText(getCell(row, 'CONTRATO')),
      tipo_documento: normalizeNullableCellText(getCell(row, 'TIPO_DOCUMENTO')),
      numero_documento: normalizeNullableCellText(getCell(row, 'NUMERO_DOCUMENTO')),
      primer_nombre: normalizeNullableCellText(getCell(row, 'PRIMER_NOMBRE')),
      segundo_nombre: normalizeNullableCellText(getCell(row, 'SEGUNDO_NOMBRE')),
      primer_apellido: normalizeNullableCellText(getCell(row, 'PRIMER_APELLIDO')),
      segundo_apellido: normalizeNullableCellText(getCell(row, 'SEGUNDO_APELLIDO')),
      fecha_nacimiento: excelDateToIso(getCell(row, 'FECHA_NACIMIENTO')),
      sexo: normalizeNullableCellText(getCell(row, 'SEXO')),
      celular: normalizeNullableCellText(getCell(row, 'CELULAR')),
      correo: normalizeNullableCellText(getCell(row, 'CORREO')),
      tipo_vinculacion: normalizeNullableCellText(getCell(row, 'TIPO_VINCULACION')),
      tipo_contrato: normalizeNullableCellText(getCell(row, 'TIPO_CONTRATO')),
      fecha_inicio_contrato: excelDateToIso(getCell(row, 'FECHA_INICIO_CONTRATO')),
      fecha_fin_contrato: excelDateToIso(getCell(row, 'FECHA_FIN_CONTRATO')),
      cargo_laboral: normalizeNullableCellText(getCell(row, 'CARGO_LABORAL')),
      asignacion_laboral: normalizeNullableCellText(getCell(row, 'ASIGNACION_LABORAL')),
      ubicacion_operativa: normalizeNullableCellText(getCell(row, 'UBICACION_OPERATIVA')),
      metodo_pago: normalizeNullableCellText(getCell(row, 'ESQUEMA_PAGO')),
      valor_caso_especial: normalizeNullableCellText(getCell(row, 'VALOR_CASO_ESPECIAL')),
      municipio: normalizeNullableCellText(getCell(row, 'MUNICIPIO')),
      institucion_educativa: normalizeNullableCellText(getCell(row, 'INSTITUCION_EDUCATIVA')),
      sede: normalizeNullableCellText(getCell(row, 'SEDE')),
      modalidad: normalizeNullableCellText(getCell(row, 'MODALIDAD')),
      presentado_licitacion: normalizeNullableCellText(getCell(row, 'PRESENTADO_LICITACION')),
      perfil_licitacion: normalizeNullableCellText(getCell(row, 'PERFIL_LICITACION')),
      observaciones: normalizeNullableCellText(getCell(row, 'OBSERVACIONES'))
    };
  });
};

export const validateContractDates = (input: {
  endDate: string | null;
  startDate: string | null;
  tipoContrato: string | null;
  tipoVinculacion: string | null;
}): TipoContratoValidation => {
  const normalizedType = normalizeComparableText(input.tipoContrato);
  const normalizedVinc = normalizeComparableText(input.tipoVinculacion);
  const issues: FechaIssueCode[] = [];

  let normalized: 'TF' | 'TI' | 'OL' | 'OPS' | null = null;
  if (normalizedType === 'TERMINO FIJO') {
    normalized = 'TF';
  } else if (normalizedType === 'TERMINO INDEFINIDO') {
    normalized = 'TI';
  } else if (normalizedType === 'OBRA O LABOR') {
    normalized = 'OL';
  } else if (!normalizedType && normalizedVinc === 'PRESTACION DE SERVICIOS') {
    normalized = 'OPS';
  } else if (normalizedVinc === 'PRESTACION DE SERVICIOS') {
    normalized = 'OPS';
  } else if (normalizedType) {
    issues.push('COMBINACION_CONTRACTUAL_INVALIDA');
  }

  if (!input.startDate) {
    issues.push('FECHA_INICIO_FALTANTE');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    issues.push('FECHA_INVALIDA');
  }

  if (input.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    issues.push('FECHA_INVALIDA');
  }

  if (normalized === 'TF' && !input.endDate) {
    issues.push('FECHA_FIN_REQUERIDA_FALTANTE');
  }

  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    issues.push('FIN_ANTERIOR_INICIO');
  }

  return { normalized, issues };
};

const normalizeMetodoPago = (value: string | null | undefined): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }

  return METODOS_PAGO.find((method) => normalizeComparableText(method) === normalized) ?? null;
};

const normalizeProfileToken = (value: string | null | undefined): string => normalizeComparableText(value);

const matchByNormalizedName = <T extends { nombre_cargo?: string; nombre_ubicacion?: string; nombre_perfil?: string; codigo_perfil?: string | null }>(
  items: T[],
  source: string | null,
  pickers: Array<(item: T) => string | null | undefined>
): T[] => {
  const normalized = normalizeComparableText(source);
  if (!normalized) {
    return [];
  }

  return items.filter((item) => pickers.some((picker) => normalizeComparableText(picker(item)) === normalized));
};

export const resolveCargoMapping = (sourceCargo: string | null, cargoRows: CargoRow[]): { proposed: string | null; resolved: CargoRow | null } => {
  const normalized = normalizeComparableText(sourceCargo);
  if (!normalized) {
    return { proposed: null, resolved: null };
  }

  const exactMatches = matchByNormalizedName(cargoRows, sourceCargo, [
    (item) => item.nombre_cargo
  ]);
  if (exactMatches.length === 1) {
    return { proposed: exactMatches[0]?.nombre_cargo ?? null, resolved: exactMatches[0] ?? null };
  }

  if (normalized === 'MANIPULADORA DE ALIMENTOS') {
    const manipCargo = cargoRows.find((item) => normalizeComparableText(item.nombre_cargo).includes('MANIPULADOR'));
    return { proposed: manipCargo?.nombre_cargo ?? null, resolved: manipCargo ?? null };
  }

  return { proposed: null, resolved: null };
};

const buildUbicacionAliasMap = (ubicacionRows: UbicacionRow[]): Map<string, UbicacionRow[]> => {
  const index = new Map<string, UbicacionRow[]>();
  const add = (alias: string, row: UbicacionRow): void => {
    const key = normalizeComparableText(alias);
    const existing = index.get(key) ?? [];
    existing.push(row);
    index.set(key, existing);
  };

  for (const row of ubicacionRows) {
    add(row.nombre_ubicacion, row);
  }

  const aliasCandidates: Array<[string, string]> = [
    ['BODEGA RP GRANADA', 'BODEGA GRANADA'],
    ['AUXILIAR DE FACTURACION', 'FACTURACION'],
    ['AUXILIAR DE CALIDAD', 'CALIDAD'],
    ['GESTION DE ZONA', 'GESTION DE ZONA'],
    ['AUXILIAR GESTION DE ZONA', 'AUXILIAR GESTION DE ZONA'],
    ['TALENTO HUMANO', 'TALENTO HUMANO'],
    ['SUMINISTRO', 'SUMINISTRO'],
    ['BODEGA RI', 'BODEGA RI'],
    ['BODEGA RP', 'BODEGA RP'],
    ['AUXILIAR DE RUTA RI', 'AUXILIAR DE RUTA RI'],
    ['AUXILIAR DE RUTA RP', 'AUXILIAR DE RUTA RP']
  ];

  for (const [alias, target] of aliasCandidates) {
    const row = ubicacionRows.find((item) => normalizeComparableText(item.nombre_ubicacion) === normalizeComparableText(target));
    if (row) {
      add(alias, row);
    }
  }

  return index;
};

export const resolveLaborLocation = (
  row: Pick<SourceMainRow, 'asignacion_laboral' | 'cargo_laboral' | 'municipio' | 'institucion_educativa' | 'sede' | 'modalidad' | 'ubicacion_operativa'>,
  ubicacionRows: UbicacionRow[]
): { proposed: string | null; resolved: UbicacionRow | null; status: LaborLocationStatus } => {
  if (looksLikeManipuladoraCargo(row.cargo_laboral)) {
    return { proposed: null, resolved: null, status: 'NO_APLICA' };
  }

  if (row.municipio || row.institucion_educativa || row.sede || row.modalidad) {
    return { proposed: null, resolved: null, status: 'UBICACION_AMBIGUA' };
  }

  const aliasMap = buildUbicacionAliasMap(ubicacionRows);
  const candidateTexts = [
    row.ubicacion_operativa,
    row.asignacion_laboral === 'BODEGA' ? row.ubicacion_operativa : row.asignacion_laboral
  ].filter((value): value is string => Boolean(value && value.trim()));

  if (candidateTexts.length === 0) {
    return { proposed: null, resolved: null, status: 'SIN_UBICACION' };
  }

  const matches = candidateTexts.flatMap((candidate) => aliasMap.get(normalizeComparableText(candidate)) ?? []);
  const uniqueMatches = [...new Map(matches.map((item) => [item.id, item])).values()];

  if (uniqueMatches.length === 1) {
    return {
      proposed: uniqueMatches[0]?.nombre_ubicacion ?? null,
      resolved: uniqueMatches[0] ?? null,
      status: 'UBICACION_OK'
    };
  }

  return {
    proposed: null,
    resolved: null,
    status: uniqueMatches.length > 1 ? 'UBICACION_AMBIGUA' : 'UBICACION_NO_RECONOCIDA'
  };
};

const buildPerfilAliasMap = (perfilRows: PerfilRow[]): Map<string, PerfilRow> => {
  const index = new Map<string, PerfilRow>();
  const register = (alias: string, row: PerfilRow): void => {
    index.set(normalizeProfileToken(alias), row);
  };

  for (const row of perfilRows) {
    register(row.codigo_perfil, row);
    register(row.nombre_perfil, row);
  }

  const synonyms: Record<string, string> = {
    'MANIPULADORAS DE ALIMENTOS': 'MANIPULADORAS_ALIMENTOS',
    'OPERARIOS DE BODEGA, TRANSPORTADORES Y AUXILIARES': 'OPER_BOD_TRANS_AUX',
    'AUXILIARES ADMINISTRATIVOS': 'AUX_ADMIN',
    'COORDINADORES DE ZONA': 'COORD_ZONA',
    'COORDINADORES DE SUMINISTRO': 'COORD_SUMINISTRO',
    'SUPERVISORES DE CALIDAD': 'SUP_CALIDAD'
  };

  for (const [source, code] of Object.entries(synonyms)) {
    const row = perfilRows.find((item) => normalizeProfileToken(item.codigo_perfil) === normalizeProfileToken(code));
    if (row) {
      register(source, row);
    }
  }

  return index;
};

const resolvePerfilLicitacion = (sourceProfile: string | null, perfilRows: PerfilRow[]): PerfilRow | null => {
  const aliasMap = buildPerfilAliasMap(perfilRows);
  return aliasMap.get(normalizeProfileToken(sourceProfile)) ?? null;
};

const queryRows = async <T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T[]> => (await client.query<T>(sql, params)).rows;

const loadCounts = async (client: PoolClient): Promise<DatabaseCounts> => {
  const personas = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personas');
  const vinculaciones = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM vinculaciones');
  const cobertura = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM cobertura_asignaciones');
  const laborales = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personal_asignaciones_laborales');
  const licitacion = await queryRows<CountRow>(client, 'SELECT COUNT(*)::int AS total FROM personal_presentaciones_licitacion');

  return {
    personas: personas[0]?.total ?? 0,
    vinculaciones: vinculaciones[0]?.total ?? 0,
    cobertura_asignaciones: cobertura[0]?.total ?? 0,
    personal_asignaciones_laborales: laborales[0]?.total ?? 0,
    personal_presentaciones_licitacion: licitacion[0]?.total ?? 0
  };
};

const loadContract = async (client: PoolClient): Promise<ContractRow> => {
  const rows = await queryRows<ContractRow>(
    client,
    `
      SELECT
        c.id,
        c.empresa_id,
        e.nombre_empresa,
        c.numero_contrato,
        c.fecha_inicio,
        c.fecha_finalizacion
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [META26_CONTRATO_ID]
  );

  const contract = rows[0];
  if (!contract) {
    throw new Error(`No se encontró el contrato ${META26_CONTRATO_ID}`);
  }

  return contract;
};

const loadContractFeatures = async (client: PoolClient): Promise<ContractFeatures> => {
  const rows = await queryRows<{ column_name: string }>(
    client,
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vinculaciones'
        AND column_name IN ('valor_caso_especial')
    `
  );

  const columnNames = new Set(rows.map((row) => row.column_name));
  return {
    has_valor_caso_especial_column: columnNames.has('valor_caso_especial')
  };
};

const loadDocTypes = async (client: PoolClient): Promise<DocTypeRow[]> => queryRows<DocTypeRow>(
  client,
  `
    SELECT id, codigo, nombre_documento, es_identificacion_personal
    FROM tipos_documentos
    WHERE COALESCE(es_identificacion_personal, FALSE) = TRUE
    ORDER BY id ASC
  `
);

const loadTipoVinc = async (client: PoolClient): Promise<TipoVincRow[]> => queryRows<TipoVincRow>(
  client,
  `
    SELECT id, codigo, nombre_vinculacion
    FROM tipos_vinculacion
    ORDER BY id ASC
  `
);

const loadCargoRows = async (client: PoolClient): Promise<CargoRow[]> => queryRows<CargoRow>(
  client,
  `
    SELECT id, nombre_cargo
    FROM contrato_cargos
    WHERE contrato_id = $1::bigint
      AND COALESCE(activo, TRUE) = TRUE
    ORDER BY id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadUbicacionRows = async (client: PoolClient): Promise<UbicacionRow[]> => queryRows<UbicacionRow>(
  client,
  `
    SELECT id, nombre_ubicacion
    FROM contrato_ubicaciones_laborales
    WHERE contrato_id = $1::bigint
      AND COALESCE(activo, TRUE) = TRUE
    ORDER BY id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadPerfilRows = async (client: PoolClient): Promise<PerfilRow[]> => queryRows<PerfilRow>(
  client,
  `
    SELECT
      id,
      codigo_perfil,
      nombre_perfil,
      cantidad_requerida,
      contrato_cargo_equivalente_id
    FROM contrato_perfiles_licitacion
    WHERE contrato_id = $1::bigint
      AND COALESCE(activo, TRUE) = TRUE
    ORDER BY id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadMunicipioRows = async (client: PoolClient): Promise<HelperMunicipioRow[]> => queryRows<HelperMunicipioRow>(
  client,
  `
    SELECT id, codigo_dane, nombre_municipio
    FROM municipios
    ORDER BY nombre_municipio ASC
  `
);

const loadInstitucionRows = async (client: PoolClient): Promise<HelperInstitucionRow[]> => queryRows<HelperInstitucionRow>(
  client,
  `
    SELECT id, municipio_id, codigo_dane, nombre_institucion
    FROM instituciones
    WHERE contrato_id = $1::bigint
    ORDER BY id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadSedeRows = async (client: PoolClient): Promise<HelperSedeRow[]> => queryRows<HelperSedeRow>(
  client,
  `
    SELECT s.id, s.institucion_id, s.municipio_id, s.codigo_dane, s.consecutivo_sede, s.nombre_sede
    FROM sedes s
    INNER JOIN instituciones i ON i.id = s.institucion_id
    WHERE i.contrato_id = $1::bigint
    ORDER BY s.id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadModalidadRows = async (client: PoolClient): Promise<HelperModalidadRow[]> => queryRows<HelperModalidadRow>(
  client,
  `
    SELECT id, codigo_original, codigo_base, nombre_modalidad
    FROM modalidades
    ORDER BY id ASC
  `
);

const loadFocalizacionRows = async (client: PoolClient): Promise<FocalizacionRow[]> => queryRows<FocalizacionRow>(
  client,
  `
    SELECT
      ff.id AS focalizacion_final_id,
      ff.sede_modalidad_id,
      ff.municipio_id,
      ff.municipio_texto AS municipio_nombre,
      ff.institucion_id,
      COALESCE(ff.institucion_final, i.nombre_institucion) AS institucion_nombre,
      ff.sede_id,
      ff.sede_final AS sede_nombre,
      ff.modalidad_id,
      m.codigo_original AS modalidad_codigo_original,
      m.codigo_base AS modalidad_codigo_base,
      ff.modalidad_final AS modalidad_nombre,
      ff.cobertura_requerida
    FROM focalizacion_final ff
    LEFT JOIN instituciones i ON i.id = ff.institucion_id
    LEFT JOIN modalidades m ON m.id = ff.modalidad_id
    WHERE ff.contrato_id = $1::bigint
    ORDER BY ff.id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadInstitucionAliases = async (client: PoolClient): Promise<InstitucionAliasRow[]> => queryRows<InstitucionAliasRow>(
  client,
  `
    SELECT
      ih.institucion_id,
      i.municipio_id,
      ih.nombre_normalizado AS nombre_alias
    FROM instituciones_identidad_historial ih
    INNER JOIN instituciones i ON i.id = ih.institucion_id
    WHERE i.contrato_id = $1::bigint
    ORDER BY ih.id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadSedeAliases = async (client: PoolClient): Promise<SedeAliasRow[]> => queryRows<SedeAliasRow>(
  client,
  `
    SELECT
      sh.sede_id,
      s.institucion_id,
      sh.nombre_normalizado AS nombre_alias
    FROM sedes_identidad_historial sh
    INNER JOIN sedes s ON s.id = sh.sede_id
    INNER JOIN instituciones i ON i.id = s.institucion_id
    WHERE i.contrato_id = $1::bigint
    ORDER BY sh.id ASC
  `,
  [META26_CONTRATO_ID]
);

const loadModalidadAliases = async (client: PoolClient): Promise<ModalidadAliasRow[]> => queryRows<ModalidadAliasRow>(
  client,
  `
    SELECT modalidad_id, alias
    FROM modalidad_aliases
    WHERE COALESCE(activo, TRUE) = TRUE
    ORDER BY id ASC
  `
);

const resolveSourceDocType = (sourceType: string | null, docTypeRows: DocTypeRow[]): DocTypeRow | null => {
  const normalized = normalizeComparableText(sourceType);
  if (!normalized) {
    return null;
  }

  const synonyms: Record<string, string[]> = {
    CC: ['CEDULA', 'CEDULA DE CIUDADANIA'],
    CE: ['CEDULA DE EXTRANJERIA'],
    TI: ['TARJETA DE IDENTIDAD'],
    PPT: ['PPT', 'PERMISO POR PROTECCION TEMPORAL'],
    PEP: ['PEP', 'PERMISO ESPECIAL DE PERMANENCIA'],
    PASAPORTE: ['PASAPORTE']
  };
  const synonymTokens = synonyms[normalized] ?? [normalized];

  const exact = docTypeRows.find((item) =>
    synonymTokens.includes(normalizeComparableText(item.codigo)) ||
    synonymTokens.includes(normalizeComparableText(item.nombre_documento))
  );

  return exact ?? null;
};

const resolveSourceTipoVinc = (sourceType: string | null, sourceContractType: string | null, tipoRows: TipoVincRow[]): TipoVincRow | null => {
  const normalizedSource = normalizeComparableText(sourceType);
  const normalizedContractType = normalizeComparableText(sourceContractType);
  if (!normalizedSource) {
    return null;
  }

  if (normalizedSource === 'PRESTACION DE SERVICIOS') {
    return tipoRows.find((item) => normalizeComparableText(item.codigo) === 'OPS') ?? null;
  }

  if (normalizedSource !== 'LABORAL') {
    return tipoRows.find((item) =>
      normalizeComparableText(item.codigo) === normalizedSource ||
      normalizeComparableText(item.nombre_vinculacion) === normalizedSource
    ) ?? null;
  }

  const byCode =
    normalizedContractType === 'TERMINO FIJO'
      ? 'TF'
      : normalizedContractType === 'TERMINO INDEFINIDO'
        ? 'TI'
        : normalizedContractType === 'OBRA O LABOR'
          ? 'OL'
          : null;

  if (!byCode) {
    return null;
  }

  return tipoRows.find((item) => normalizeComparableText(item.codigo) === byCode) ?? null;
};

const buildExistingPeopleIndex = async (
  client: PoolClient,
  sourceRows: SourceMainRow[],
  docTypeRows: DocTypeRow[]
): Promise<Map<string, ExistingPersonRow[]>> => {
  const resolvedDocTypeIds = [...new Set(sourceRows
    .map((row) => resolveSourceDocType(row.tipo_documento, docTypeRows)?.id ?? null)
    .filter((value): value is number => value !== null))];
  const normalizedDocs = [...new Set(sourceRows
    .map((row) => normalizeIdentityDocument(row.numero_documento))
    .filter((value) => value.length > 0))];

  if (resolvedDocTypeIds.length === 0 || normalizedDocs.length === 0) {
    return new Map();
  }

  const rows = await queryRows<ExistingPersonRow>(
    client,
    `
      SELECT
        p.id AS persona_id,
        pi.id AS identificacion_id,
        pi.tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) AS normalizado_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_bd
      FROM persona_identificaciones pi
      INNER JOIN personas p ON p.id = pi.persona_id
      INNER JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
      WHERE pi.es_vigente = TRUE
        AND pi.tipo_documento_id = ANY($1::bigint[])
        AND UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) = ANY($2::text[])
    `,
    [resolvedDocTypeIds, normalizedDocs]
  );

  const index = new Map<string, ExistingPersonRow[]>();
  for (const row of rows) {
    const key = `${row.tipo_documento_id}|${row.normalizado_documento}`;
    const existing = index.get(key) ?? [];
    existing.push(row);
    index.set(key, existing);
  }

  return index;
};

const buildExistingVincIndex = async (
  client: PoolClient,
  personIds: number[]
): Promise<Map<number, ExistingVincRow[]>> => {
  if (personIds.length === 0) {
    return new Map();
  }

  const rows = await queryRows<ExistingVincRow>(
    client,
    `
      SELECT
        v.id,
        v.persona_id,
        v.contrato_id,
        v.empresa_id,
        v.fecha_inicio,
        v.fecha_fin,
        v.estado_vinculacion,
        tv.codigo AS tipo_vinculacion_codigo,
        cc.nombre_cargo AS contrato_cargo_nombre,
        c.numero_contrato
      FROM vinculaciones v
      LEFT JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      LEFT JOIN contratos c ON c.id = v.contrato_id
      WHERE v.persona_id = ANY($1::bigint[])
      ORDER BY v.persona_id ASC, v.fecha_inicio DESC NULLS LAST, v.id DESC
    `,
    [personIds]
  );

  const index = new Map<number, ExistingVincRow[]>();
  for (const row of rows) {
    const existing = index.get(row.persona_id) ?? [];
    existing.push(row);
    index.set(row.persona_id, existing);
  }

  return index;
};

const buildCoverageCandidateIndex = (
  focalizacionRows: FocalizacionRow[],
  institucionAliasRows: InstitucionAliasRow[],
  sedeAliasRows: SedeAliasRow[],
  modalidadAliasRows: ModalidadAliasRow[]
): {
  byComposite: Map<string, FocalizacionRow[]>;
  byMunicipio: Map<string, FocalizacionRow[]>;
  institucionAliasesById: Map<number, string[]>;
  modalidadAliasesById: Map<number, string[]>;
  sedeAliasesById: Map<number, string[]>;
} => {
  const byComposite = new Map<string, FocalizacionRow[]>();
  const byMunicipio = new Map<string, FocalizacionRow[]>();
  const institucionAliasesById = new Map<number, string[]>();
  const sedeAliasesById = new Map<number, string[]>();
  const modalidadAliasesById = new Map<number, string[]>();

  const pushMapValue = <T>(map: Map<string, T[]>, key: string, value: T): void => {
    const existing = map.get(key) ?? [];
    existing.push(value);
    map.set(key, existing);
  };

  const pushAlias = (map: Map<number, string[]>, id: number | null, value: string | null): void => {
    if (!id || !value) {
      return;
    }
    const existing = map.get(id) ?? [];
    const raw = normalizeComparableText(value);
    const variants = new Set<string>([raw]);
    if (raw.startsWith('SEDE ')) {
      variants.add(raw.replace(/^SEDE\s+/, ''));
    }
    if (raw.startsWith('INSTITUCION EDUCATIVA ')) {
      variants.add(raw.replace(/^INSTITUCION EDUCATIVA\s+/, ''));
    }
    if (raw.startsWith('CENTRO EDUCATIVO ')) {
      variants.add(raw.replace(/^CENTRO EDUCATIVO\s+/, ''));
    }
    for (const normalized of variants) {
      if (normalized && !existing.includes(normalized)) {
        existing.push(normalized);
        map.set(id, existing);
      }
    }
  };

  for (const row of focalizacionRows) {
    const municipio = normalizeComparableText(row.municipio_nombre);
    const institucion = normalizeComparableText(row.institucion_nombre);
    const sede = normalizeComparableText(row.sede_nombre);
    const modalidad = normalizeComparableText(row.modalidad_nombre);
    const key = `${municipio}|${institucion}|${sede}|${modalidad}`;
    pushMapValue(byComposite, key, row);
    pushMapValue(byMunicipio, municipio, row);
    pushAlias(institucionAliasesById, row.institucion_id, row.institucion_nombre);
    pushAlias(sedeAliasesById, row.sede_id, row.sede_nombre);
    pushAlias(modalidadAliasesById, row.modalidad_id, row.modalidad_nombre);
  }

  for (const row of institucionAliasRows) {
    pushAlias(institucionAliasesById, row.institucion_id, row.nombre_alias);
  }

  for (const row of sedeAliasRows) {
    pushAlias(sedeAliasesById, row.sede_id, row.nombre_alias);
  }

  for (const row of modalidadAliasRows) {
    pushAlias(modalidadAliasesById, row.modalidad_id, row.alias);
  }

  return {
    byComposite,
    byMunicipio,
    institucionAliasesById,
    sedeAliasesById,
    modalidadAliasesById
  };
};

export const matchCoverageAssignment = (
  row: Pick<SourceMainRow, 'municipio' | 'institucion_educativa' | 'sede' | 'modalidad'>,
  focalizacionRows: FocalizacionRow[],
  institucionAliasRows: InstitucionAliasRow[],
  sedeAliasRows: SedeAliasRow[],
  modalidadAliasRows: ModalidadAliasRow[]
): CoverageMatchResult => {
  if (!row.municipio || !row.institucion_educativa || !row.sede || !row.modalidad) {
    return {
      status: 'SIN_ASIGNACION',
      focalizacion_final_id: null,
      sede_modalidad_id: null,
      candidate_count: 0
    };
  }

  const index = buildCoverageCandidateIndex(
    focalizacionRows,
    institucionAliasRows,
    sedeAliasRows,
    modalidadAliasRows
  );
  const municipio = normalizeComparableText(row.municipio);
  const institucion = normalizeComparableText(row.institucion_educativa);
  const sede = normalizeComparableText(row.sede);
  const modalidad = normalizeComparableText(row.modalidad);
  const compositeKey = `${municipio}|${institucion}|${sede}|${modalidad}`;
  const exact = index.byComposite.get(compositeKey) ?? [];

  if (exact.length === 1) {
    return {
      status: 'ASIGNACION_OK',
      focalizacion_final_id: exact[0]?.focalizacion_final_id ?? null,
      sede_modalidad_id: exact[0]?.sede_modalidad_id ?? null,
      candidate_count: 1
    };
  }

  if (exact.length > 1) {
    return {
      status: 'AMBIGUA',
      focalizacion_final_id: null,
      sede_modalidad_id: null,
      candidate_count: exact.length
    };
  }

  const sameMunicipio = index.byMunicipio.get(municipio) ?? [];
  if (sameMunicipio.length === 0) {
    return { status: 'MUNICIPIO_NO_RECONOCIDO', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0 };
  }

  const institutionTokens = new Set<string>([
    institucion,
    institucion.replace(/^INSTITUCION EDUCATIVA\s+/, ''),
    institucion.replace(/^CENTRO EDUCATIVO\s+/, '')
  ]);
  const institutionMatches = sameMunicipio.filter((candidate) => {
    const aliases = index.institucionAliasesById.get(candidate.institucion_id ?? -1) ?? [];
    return [...institutionTokens].some((token) => token && aliases.includes(token));
  });
  if (institutionMatches.length === 0) {
    return { status: 'INSTITUCION_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0 };
  }

  const sedeTokens = new Set<string>([
    sede,
    sede.replace(/^SEDE\s+/, '')
  ]);
  const sedeMatches = institutionMatches.filter((candidate) => {
    const aliases = index.sedeAliasesById.get(candidate.sede_id ?? -1) ?? [];
    return [...sedeTokens].some((token) => token && aliases.includes(token));
  });
  if (sedeMatches.length === 0) {
    return { status: 'SEDE_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0 };
  }

  const modalidadMatches = sedeMatches.filter((candidate) =>
    (index.modalidadAliasesById.get(candidate.modalidad_id ?? -1) ?? []).includes(modalidad)
  );
  if (modalidadMatches.length === 0) {
    return { status: 'MODALIDAD_NO_RECONOCIDA', focalizacion_final_id: null, sede_modalidad_id: null, candidate_count: 0 };
  }

  if (modalidadMatches.length === 1) {
    return {
      status: modalidadMatches[0]?.sede_modalidad_id ? 'ASIGNACION_OK' : 'SEDE_MODALIDAD_NO_EXISTE',
      focalizacion_final_id: modalidadMatches[0]?.focalizacion_final_id ?? null,
      sede_modalidad_id: modalidadMatches[0]?.sede_modalidad_id ?? null,
      candidate_count: 1
    };
  }

  return {
    status: 'AMBIGUA',
    focalizacion_final_id: null,
    sede_modalidad_id: null,
    candidate_count: modalidadMatches.length
  };
};

const chooseExistingVinculacion = (
  vincRows: ExistingVincRow[],
  sourceCargo: string | null,
  sourceTipoVinc: string | null
): ExistingVincRow | null => {
  const contractRows = vincRows.filter((row) => row.contrato_id === META26_CONTRATO_ID);
  if (contractRows.length === 0) {
    return null;
  }

  const normalizedCargo = normalizeComparableText(sourceCargo);
  const normalizedTipoVinc = normalizeComparableText(sourceTipoVinc);
  const activeRows = contractRows.filter((row) => ACTIVE_VINC_STATES.has(normalizeComparableText(row.estado_vinculacion)));
  const candidateRows = activeRows.length > 0 ? activeRows : contractRows;
  const exact = candidateRows.find((row) =>
    normalizeComparableText(row.contrato_cargo_nombre) === normalizedCargo &&
    (
      normalizeComparableText(row.tipo_vinculacion_codigo) === normalizedTipoVinc ||
      (normalizedTipoVinc === 'PRESTACION DE SERVICIOS' && normalizeComparableText(row.tipo_vinculacion_codigo) === 'OPS')
    )
  );

  if (exact) {
    return exact;
  }

  return candidateRows.length === 1 ? candidateRows[0] ?? null : null;
};

const buildFieldCounters = (rows: DryRunRowReport[]): {
  blocking: Array<{ campo: string; count: number }>;
  non_blocking: Array<{ campo: string; count: number }>;
} => {
  const blocking = new Map<string, number>();
  const nonBlocking = new Map<string, number>();

  for (const row of rows) {
    for (const issue of row.problemas_bloqueantes) {
      blocking.set(issue, (blocking.get(issue) ?? 0) + 1);
    }
    for (const issue of row.casos_no_bloqueantes) {
      nonBlocking.set(issue, (nonBlocking.get(issue) ?? 0) + 1);
    }
  }

  const toArray = (input: Map<string, number>) => [...input.entries()]
    .map(([campo, count]) => ({ campo, count }))
    .sort((left, right) => right.count - left.count || left.campo.localeCompare(right.campo, 'es'));

  return {
    blocking: toArray(blocking),
    non_blocking: toArray(nonBlocking)
  };
};

const csvSafe = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? value : Array.isArray(value) ? value.join(' | ') : JSON.stringify(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = <T extends object>(rows: T[], columns: ReadonlyArray<keyof T>): string => {
  const header = columns.map((column) => csvSafe(String(column))).join(',');
  const lines = rows.map((row) => columns.map((column) => csvSafe(row[column as keyof T])).join(','));
  return [header, ...lines].join('\n');
};

const buildReviewRow = (row: DryRunRowReport, problema: string, propuesta: string | null, valor_origen: string | null, accion_requerida: string): ReviewCsvRow => ({
  fila_origen: row.fila_origen,
  hoja: row.hoja,
  cedula: row.cedula,
  nombre: row.nombre,
  razon_social: row.razon_social,
  cargo_origen: row.cargo_origen,
  problema,
  valor_origen,
  propuesta,
  accion_requerida
});

const buildLicitacionPreview = (rows: DryRunRowReport[], perfilRows: PerfilRow[]): {
  preview: LicitacionPreviewRow[];
  summary: PersonalMeta26DryRunReport['licitacion_summary'];
} => {
  const presentations = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!row.licitacion_perfil_resuelto || !row.cedula || !row.estado_importacion.includes('LISTO_PRESENTACION_LICITACION')) {
      continue;
    }

    const perfil = perfilRows.find((item) => item.nombre_perfil === row.licitacion_perfil_resuelto || item.codigo_perfil === row.licitacion_perfil_resuelto);
    if (!perfil) {
      continue;
    }

    const set = presentations.get(perfil.id) ?? new Set<string>();
    set.add(row.cedula);
    presentations.set(perfil.id, set);
  }

  const preview = perfilRows.map((perfil) => {
    const presentados = presentations.get(perfil.id)?.size ?? 0;
    const delta = buildLicitacionQuotaDelta(perfil.cantidad_requerida, presentados);
    return {
      perfil: perfil.codigo_perfil,
      requeridos: perfil.cantidad_requerida,
      presentados,
      diferencia: delta.diferencia,
      estado: delta.estado
    } satisfies LicitacionPreviewRow;
  });

  return {
    preview,
    summary: {
      total_requeridas: perfilRows.reduce((sum, item) => sum + item.cantidad_requerida, 0),
      total_presentaciones: preview.reduce((sum, item) => sum + item.presentados, 0),
      per_profile: Object.fromEntries(preview.map((item) => [
        item.perfil,
        {
          ...item,
          documental_estado: 'PENDIENTE_CONFIGURACION_REQUISITOS'
        }
      ]))
    }
  };
};

const buildCoveragePreview = (rows: DryRunRowReport[], focalizacionRows: FocalizacionRow[]): {
  preview: CoveragePreviewRow[];
  summary: PersonalMeta26DryRunReport['coverage_summary'];
} => {
  const assignments = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!row.cedula || !row.sede_modalidad_id || !row.estado_importacion.includes('LISTO_ASIGNACION_COBERTURA')) {
      continue;
    }

    const set = assignments.get(row.sede_modalidad_id) ?? new Set<string>();
    set.add(row.cedula);
    assignments.set(row.sede_modalidad_id, set);
  }

  const preview = focalizacionRows.map((item) => {
    const asignadas = assignments.get(item.sede_modalidad_id ?? -1)?.size ?? 0;
    const delta = buildCoverageDelta(item.cobertura_requerida ?? 0, asignadas);
    return {
      municipio: item.municipio_nombre,
      institucion: item.institucion_nombre,
      sede: item.sede_nombre,
      modalidad: item.modalidad_nombre,
      requeridas: delta.requeridas,
      asignadas_propuestas: asignadas,
      diferencia: delta.diferencia,
      estado: delta.estado
    } satisfies CoveragePreviewRow;
  });

  const summary = preview.reduce(
    (accumulator, item) => {
      accumulator.requeridas_total += item.requeridas;
      accumulator.asignadas_total += item.asignadas_propuestas;
      if (item.estado === 'COMPLETA') {
        accumulator.completas += 1;
      } else if (item.estado === 'DEFICIT') {
        accumulator.deficitarias += 1;
        accumulator.deficit_total += Math.abs(item.diferencia);
      } else if (item.estado === 'EXCESO') {
        accumulator.excesos += 1;
        accumulator.exceso_total += item.diferencia;
      }
      if (item.asignadas_propuestas === 0) {
        accumulator.sin_personal += 1;
      }
      return accumulator;
    },
    {
      requeridas_total: 0,
      asignadas_total: 0,
      deficit_total: 0,
      exceso_total: 0,
      completas: 0,
      deficitarias: 0,
      excesos: 0,
      sin_personal: 0
    }
  );

  return { preview, summary };
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

export const runPersonalMeta26DryRun = async (filePath = META26_FILE): Promise<PersonalMeta26DryRunReport> => {
  const { workbook, inspection } = await buildWorkbookInspection(filePath);
  const sourceRows = parseMainSheetRows(workbook)
    .filter((row) => Object.values(row.raw).some((value) => normalizeNullableCellText(value) !== null));
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '60s'`);

    const counts_before = await loadCounts(client);
    const contract = await loadContract(client);
    const contract_features = await loadContractFeatures(client);
    const doc_type_rows = await loadDocTypes(client);
    const tipo_vinc_rows = await loadTipoVinc(client);
    const cargo_rows = await loadCargoRows(client);
    const ubicacion_rows = await loadUbicacionRows(client);
    const perfil_rows = await loadPerfilRows(client);
    const municipio_rows = await loadMunicipioRows(client);
    const institucion_rows = await loadInstitucionRows(client);
    const sede_rows = await loadSedeRows(client);
    const modalidad_rows = await loadModalidadRows(client);
    const focalizacion_rows = await loadFocalizacionRows(client);
    const institucion_alias_rows = await loadInstitucionAliases(client);
    const sede_alias_rows = await loadSedeAliases(client);
    const modalidad_alias_rows = await loadModalidadAliases(client);

    const existing_people = await buildExistingPeopleIndex(client, sourceRows, doc_type_rows);
    const existing_vinculaciones = await buildExistingVincIndex(
      client,
      [...new Set([...existing_people.values()].flat().map((row) => row.persona_id))]
    );

    const report_rows: DryRunRowReport[] = [];
    const review_rows: ReviewCsvRow[] = [];
    const proposedAliases = new Map<string, AliasProposalCsvRow>();
    const blockers = new Set<string>();
    const methods_found = [...new Set(sourceRows.map((row) => normalizeComparableText(row.metodo_pago)).filter(Boolean))];
    const tipos_contrato_encontrados = [...new Set(sourceRows.map((row) => normalizeComparableText(row.tipo_contrato)).filter(Boolean))];
    const tipos_vinculacion_encontrados = [...new Set(sourceRows.map((row) => normalizeComparableText(row.tipo_vinculacion)).filter(Boolean))];
    const ubicaciones_encontradas = [...new Set(sourceRows.flatMap((row) => [row.asignacion_laboral, row.ubicacion_operativa].filter((value): value is string => Boolean(value && value.trim())).map((value) => normalizeComparableText(value))))];

    const uniquePersonPlans = new Map<string, {
      identity_status: PersonaIdentityStatus;
      person_plan: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | 'REVISAR';
      persona_id: number | null;
      vinc_plan: VinculacionPlanStatus;
      has_other_contracts: boolean;
    }>();
    const uniqueIdentityConflicts = new Map<string, { cedula: string; nombre_archivo: string | null; nombre_bd: string | null }>();
    const uniqueIdentityDuplicates = new Set<string>();
    const otrasRazonesSociales = new Set<string>();

    for (const sourceRow of sourceRows) {
      const razonSocialClass = classifyReasonSocial(sourceRow.razon_social);
      if (razonSocialClass === 'OTRA_RAZON_SOCIAL' || razonSocialClass === 'RAZON_SOCIAL_AMBIGUA') {
        if (sourceRow.razon_social) {
          otrasRazonesSociales.add(sourceRow.razon_social);
        }
      }

      const document = normalizeIdentityDocument(sourceRow.numero_documento);
      const docType = resolveSourceDocType(sourceRow.tipo_documento, doc_type_rows);
      const tipoVinc = resolveSourceTipoVinc(sourceRow.tipo_vinculacion, sourceRow.tipo_contrato, tipo_vinc_rows);
      const comparableName = buildComparableName([
        sourceRow.primer_nombre,
        sourceRow.segundo_nombre,
        sourceRow.primer_apellido,
        sourceRow.segundo_apellido
      ]);
      const identityKey = docType ? `${docType.id}|${document}` : null;
      const existingPeopleForKey = identityKey ? existing_people.get(identityKey) ?? [] : [];
      const cargoResolution = resolveCargoMapping(sourceRow.cargo_laboral, cargo_rows);
      const coverageResolution = looksLikeManipuladoraCargo(sourceRow.cargo_laboral)
        ? matchCoverageAssignmentDetailed(
          sourceRow,
          focalizacion_rows,
          institucion_alias_rows,
          sede_alias_rows,
          modalidad_alias_rows,
          municipio_rows,
          institucion_rows,
          sede_rows,
          modalidad_rows
        )
        : {
          status: 'NO_APLICA' as CoverageMatchStatus,
          focalizacion_final_id: null,
          sede_modalidad_id: null,
          candidate_count: 0,
          auditoria: [],
          alias_proposals: []
        };
      const ubicacionResolution = resolveLaborLocation(sourceRow, ubicacion_rows);
      const fechaValidation = validateContractDates({
        tipoContrato: sourceRow.tipo_contrato,
        tipoVinculacion: sourceRow.tipo_vinculacion,
        startDate: sourceRow.fecha_inicio_contrato,
        endDate: sourceRow.fecha_fin_contrato
      });
      const resolvedMetodoPago = normalizeMetodoPago(sourceRow.metodo_pago);
      const perfil = normalizePresentedLicitacion(sourceRow.presentado_licitacion) === true
        ? resolvePerfilLicitacion(sourceRow.perfil_licitacion, perfil_rows)
        : null;

      const blockingIssues: string[] = [];
      const nonBlockingIssues: string[] = [];
      const estados: ImportPlanState[] = [];
      let identidadEstado: PersonaIdentityStatus = 'PERSONA_NUEVA';
      let personaPlan: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | 'REVISAR' = 'PERSONA_CREAR';
      let personaExistenteId: number | null = null;
      let vinculacionPlan: VinculacionPlanStatus = 'VINCULACION_CREAR';
      let vinculacionExistenteId: number | null = null;

      if (razonSocialClass !== 'META26') {
        estados.push('EXCLUIR_OTRA_RAZON_SOCIAL');
      }

      if (!document) {
        identidadEstado = 'DOCUMENTO_FALTANTE';
        blockingIssues.push('DOCUMENTO_FALTANTE');
      } else if (document.length < 3) {
        identidadEstado = 'DOCUMENTO_INVALIDO';
        blockingIssues.push('DOCUMENTO_INVALIDO');
      } else if (!docType) {
        identidadEstado = 'TIPO_DOCUMENTO_NO_RECONOCIDO';
        blockingIssues.push('TIPO_DOCUMENTO_NO_RECONOCIDO');
      } else if (existingPeopleForKey.length > 1) {
        identidadEstado = 'MISMA_CEDULA_NOMBRE_DIFERENTE';
        personaPlan = 'REVISAR';
        blockingIssues.push('CONFLICTO_IDENTIDAD_MULTIPLES_PERSONAS_BD');
      } else if (existingPeopleForKey.length === 1) {
        personaExistenteId = existingPeopleForKey[0]?.persona_id ?? null;
        const nombreBd = buildComparableName([existingPeopleForKey[0]?.nombre_bd ?? null]);
        if (nombreBd && comparableName && nombreBd !== comparableName) {
          identidadEstado = 'MISMA_CEDULA_NOMBRE_DIFERENTE';
          personaPlan = 'REVISAR';
          blockingIssues.push('MISMA_CEDULA_NOMBRE_DIFERENTE');
          uniqueIdentityConflicts.set(identityKey ?? document, {
            cedula: document,
            nombre_archivo: toDisplayName(sourceRow),
            nombre_bd: existingPeopleForKey[0]?.nombre_bd ?? null
          });
        } else {
          identidadEstado = 'PERSONA_EXISTENTE';
          personaPlan = 'PERSONA_REUTILIZAR';
        }
      }

      if (!sourceRow.cargo_laboral) {
        blockingIssues.push('CARGO_FALTANTE');
      } else if (!cargoResolution.resolved) {
        blockingIssues.push('CARGO_NO_MAPEADO');
      }

      if (!tipoVinc) {
        blockingIssues.push('TIPO_VINCULACION_NO_MAPEADO');
      }

      for (const issue of fechaValidation.issues) {
        blockingIssues.push(issue);
      }

      if (!resolvedMetodoPago) {
        blockingIssues.push('METODO_PAGO_NO_RECONOCIDO');
      }

      if (normalizeComparableText(sourceRow.metodo_pago) === 'CASO_ESPECIAL' && !sourceRow.valor_caso_especial) {
        blockingIssues.push('VALOR_CASO_ESPECIAL_FALTANTE');
      }

      if (!contract_features.has_valor_caso_especial_column && normalizeComparableText(sourceRow.metodo_pago) === 'CASO_ESPECIAL') {
        blockers.add('MODELO_BD_SIN_CAMPO_VALOR_CASO_ESPECIAL');
      }

      if (looksLikeManipuladoraCargo(sourceRow.cargo_laboral)) {
        if (coverageResolution.status !== 'ASIGNACION_OK') {
          blockingIssues.push(coverageResolution.status);
        }
      } else if (ubicacionResolution.status !== 'UBICACION_OK') {
        if (ubicacionResolution.status === 'SIN_UBICACION') {
          blockingIssues.push('SIN_UBICACION');
        } else if (ubicacionResolution.status === 'UBICACION_NO_RECONOCIDA') {
          blockingIssues.push('UBICACION_NO_RECONOCIDA');
        } else if (ubicacionResolution.status === 'UBICACION_AMBIGUA') {
          blockingIssues.push('UBICACION_AMBIGUA');
        }
      }

      if (normalizePresentedLicitacion(sourceRow.presentado_licitacion) === true && !perfil) {
        blockingIssues.push('PERFIL_LICITACION_NO_MAPEADO');
      }

      if (!sourceRow.primer_nombre) {
        nonBlockingIssues.push('PRIMER_NOMBRE_FALTANTE');
      }
      if (!sourceRow.primer_apellido) {
        nonBlockingIssues.push('PRIMER_APELLIDO_FALTANTE');
      }
      if (!sourceRow.tipo_contrato) {
        nonBlockingIssues.push('TIPO_CONTRATO_FALTANTE_EN_XLSX');
      }
      if (!sourceRow.fecha_fin_contrato) {
        nonBlockingIssues.push('FECHA_FIN_CONTRATO_FALTANTE_EN_XLSX');
      }
      if (!sourceRow.contrato) {
        nonBlockingIssues.push('COLUMNA_CONTRATO_VACIA_EN_XLSX');
      }
      if (!sourceRow.sexo) {
        nonBlockingIssues.push('SEXO_FALTANTE');
      }
      if (normalizePresentedLicitacion(sourceRow.presentado_licitacion) === true) {
        nonBlockingIssues.push('PENDIENTE_CONFIGURACION_REQUISITOS');
      }

      if (personaExistenteId !== null) {
        const personVincs = existing_vinculaciones.get(personaExistenteId) ?? [];
        const chosenVinc = chooseExistingVinculacion(personVincs, cargoResolution.proposed, sourceRow.tipo_vinculacion);
        const contract24Vincs = personVincs.filter((item) => item.contrato_id === META26_CONTRATO_ID);
        const hasOtherContracts = personVincs.some((item) => item.contrato_id !== META26_CONTRATO_ID);

        if (!chosenVinc && contract24Vincs.length > 1) {
          vinculacionPlan = 'REVISAR';
          blockingIssues.push('MULTIPLES_VINCULACIONES_CONTRATO_24');
        } else if (chosenVinc) {
          vinculacionPlan = 'VINCULACION_REUTILIZAR';
          vinculacionExistenteId = chosenVinc.id;
        }

        uniquePersonPlans.set(identityKey ?? document, {
          identity_status: identidadEstado,
          person_plan: personaPlan,
          persona_id: personaExistenteId,
          vinc_plan: vinculacionPlan,
          has_other_contracts: hasOtherContracts
        });
      } else if (identityKey ?? document) {
        uniquePersonPlans.set(identityKey ?? document, {
          identity_status: identidadEstado,
          person_plan: personaPlan,
          persona_id: null,
          vinc_plan: vinculacionPlan,
          has_other_contracts: false
        });
      }

      if (personaPlan === 'PERSONA_REUTILIZAR') {
        estados.push('LISTO_REUTILIZAR_PERSONA');
      } else if (personaPlan === 'PERSONA_CREAR' && identidadEstado === 'PERSONA_NUEVA') {
        estados.push('LISTO_CREAR_PERSONA');
      }

      if (vinculacionPlan === 'VINCULACION_REUTILIZAR') {
        estados.push('LISTO_REUTILIZAR_VINCULACION');
      } else if (vinculacionPlan === 'VINCULACION_CREAR' && personaPlan !== 'REVISAR') {
        estados.push('LISTO_CREAR_VINCULACION');
      }

      if (looksLikeManipuladoraCargo(sourceRow.cargo_laboral) && coverageResolution.status === 'ASIGNACION_OK') {
        estados.push('LISTO_ASIGNACION_COBERTURA');
      }

      if (!looksLikeManipuladoraCargo(sourceRow.cargo_laboral) && ubicacionResolution.status === 'UBICACION_OK') {
        estados.push('LISTO_ASIGNACION_LABORAL');
      }

      if (perfil && normalizePresentedLicitacion(sourceRow.presentado_licitacion) === true) {
        estados.push('LISTO_PRESENTACION_LICITACION');
      }

      if (blockingIssues.length > 0 || razonSocialClass === 'RAZON_SOCIAL_AMBIGUA') {
        estados.push('REVISAR');
      }

      const reportRow: DryRunRowReport = {
        hoja: sourceRow.hoja,
        fila_origen: sourceRow.fila_origen,
        razon_social: sourceRow.razon_social,
        razon_social_clase: razonSocialClass,
        cedula: document || sourceRow.numero_documento,
        nombre: toDisplayName(sourceRow),
        tipo_documento_origen: sourceRow.tipo_documento,
        tipo_documento_resuelto: docType?.codigo ?? docType?.nombre_documento ?? null,
        identidad_estado: identidadEstado,
        persona_plan: personaPlan,
        persona_existente_id: personaExistenteId,
        vinculacion_plan: vinculacionPlan,
        vinculacion_existente_id: vinculacionExistenteId,
        cargo_origen: sourceRow.cargo_laboral,
        cargo_resuelto: cargoResolution.resolved?.nombre_cargo ?? null,
        cargo_mapping_propuesto: cargoResolution.proposed,
        tipo_vinculacion_origen: sourceRow.tipo_vinculacion,
        tipo_vinculacion_resuelto: tipoVinc?.codigo ?? tipoVinc?.nombre_vinculacion ?? null,
        tipo_contrato_origen: sourceRow.tipo_contrato,
        metodo_pago_origen: sourceRow.metodo_pago,
        observaciones_origen: sourceRow.observaciones,
        cobertura_estado: coverageResolution.status,
        cobertura_auditoria: coverageResolution.auditoria,
        sede_modalidad_id: coverageResolution.sede_modalidad_id,
        municipio_origen: sourceRow.municipio,
        institucion_origen: sourceRow.institucion_educativa,
        sede_origen: sourceRow.sede,
        modalidad_origen: sourceRow.modalidad,
        ubicacion_estado: ubicacionResolution.status,
        ubicacion_resuelta: ubicacionResolution.resolved?.nombre_ubicacion ?? null,
        ubicacion_mapping_propuesto: ubicacionResolution.proposed,
        asignacion_laboral_origen: sourceRow.asignacion_laboral,
        ubicacion_operativa_origen: sourceRow.ubicacion_operativa,
        licitacion_perfil_resuelto: perfil?.codigo_perfil ?? null,
        licitacion_documental_estado: normalizePresentedLicitacion(sourceRow.presentado_licitacion) === true ? 'PENDIENTE_CONFIGURACION_REQUISITOS' : 'NO_APLICA',
        fecha_errores: fechaValidation.issues,
        problemas_bloqueantes: [...new Set(blockingIssues)],
        casos_no_bloqueantes: [...new Set(nonBlockingIssues)],
        estado_importacion: [...new Set(estados)]
      };
      report_rows.push(reportRow);

      for (const aliasProposal of coverageResolution.alias_proposals) {
        const key = [
          aliasProposal.tipo_entidad,
          aliasProposal.contexto,
          aliasProposal.valor_xlsx,
          aliasProposal.valor_bd,
          aliasProposal.id_bd,
          aliasProposal.causa ?? ''
        ].join('|');
        const current = proposedAliases.get(key);
        if (current) {
          current.filas_afectadas += 1;
        } else {
          proposedAliases.set(key, { ...aliasProposal });
        }
      }

      if (reportRow.estado_importacion.includes('REVISAR')) {
        for (const problema of reportRow.problemas_bloqueantes) {
          const coverageAudit = reportRow.cobertura_auditoria.find((item) =>
            item.estado === problema ||
            (problema.startsWith('MUNICIPIO') && item.entidad === 'MUNICIPIO') ||
            (problema.startsWith('INSTITUCION') && item.entidad === 'INSTITUCION') ||
            (problema.startsWith('SEDE') && item.entidad === 'SEDE') ||
            (problema.startsWith('MODALIDAD') && item.entidad === 'MODALIDAD')
          );
          review_rows.push(
            buildReviewRow(
              reportRow,
              problema,
              coverageAudit?.valor_bd
                ?? (coverageAudit?.candidatos_bd.length ? coverageAudit.candidatos_bd.join(' | ') : null)
                ?? reportRow.cargo_mapping_propuesto
                ?? reportRow.ubicacion_mapping_propuesto
                ?? reportRow.licitacion_perfil_resuelto,
              problema === 'CARGO_NO_MAPEADO' || problema === 'CARGO_FALTANTE'
                ? reportRow.cargo_origen
                : problema.startsWith('UBICACION') || problema === 'SIN_UBICACION'
                  ? reportRow.ubicacion_operativa_origen ?? reportRow.asignacion_laboral_origen
                  : problema.startsWith('MUNICIPIO')
                    ? reportRow.municipio_origen
                    : problema.startsWith('INSTITUCION')
                      ? reportRow.institucion_origen
                      : problema.startsWith('SEDE')
                        ? reportRow.sede_origen
                        : problema.startsWith('MODALIDAD')
                          ? reportRow.modalidad_origen
                          : problema === 'PERFIL_LICITACION_NO_MAPEADO'
                            ? sourceRow.perfil_licitacion
                            : problema === 'VALOR_CASO_ESPECIAL_FALTANTE'
                              ? sourceRow.valor_caso_especial
                              : problema.includes('FECHA_INICIO')
                                ? sourceRow.fecha_inicio_contrato
                                : problema.includes('FECHA_FIN')
                                  ? sourceRow.fecha_fin_contrato
                                  : reportRow.cedula,
              problema.includes('IDENTIDAD')
                ? 'VALIDAR IDENTIDAD EN BD'
                : problema.includes('UBICACION') || problema === 'SIN_UBICACION'
                  ? 'COMPLETAR/MAPEAR UBICACION LABORAL'
                  : problema.includes('ASIGNACION') || problema.includes('MODALIDAD') || problema.includes('SEDE') || problema.includes('INSTITUCION') || problema.includes('MUNICIPIO')
                    ? 'CORREGIR ASIGNACION DE COBERTURA'
                    : problema.includes('CARGO')
                      ? 'CORREGIR/MAPEAR CARGO'
                      : problema.includes('TIPO_VINCULACION')
                        ? 'CORREGIR TIPO DE VINCULACION'
                        : problema.includes('FECHA')
                          ? 'CORREGIR FECHAS CONTRACTUALES'
                          : problema.includes('PERFIL')
                            ? 'CORREGIR PERFIL DE LICITACION'
                            : problema.includes('CASO_ESPECIAL')
                              ? 'COMPLETAR VALOR DE CASO ESPECIAL'
                              : 'REVISAR FILA'
            )
          );
        }
      }
    }

    const coverage = buildCoveragePreview(report_rows, focalizacion_rows);
    const licitacion = buildLicitacionPreview(report_rows, perfil_rows);
    const counts_after = await loadCounts(client);
    await client.query('ROLLBACK');

    const fieldCounters = buildFieldCounters(report_rows);
    const ubicaciones_mapeadas = [...new Set(report_rows
      .map((row) => row.ubicacion_resuelta)
      .filter((value): value is string => Boolean(value && value.trim())))].sort((left, right) => left.localeCompare(right, 'es'));
    const ubicaciones_no_reconocidas = [...new Set(report_rows
      .filter((row) => row.ubicacion_estado === 'UBICACION_NO_RECONOCIDA' || row.ubicacion_estado === 'UBICACION_AMBIGUA' || row.ubicacion_estado === 'SIN_UBICACION')
      .flatMap((row) => [row.ubicacion_operativa_origen, row.asignacion_laboral_origen])
      .filter((value): value is string => Boolean(value && value.trim())))].sort((left, right) => left.localeCompare(right, 'es'));
    const personPlanItems = [...uniquePersonPlans.values()];

    if (Number(contract.empresa_id) !== META26_EMPRESA_ID) {
      blockers.add(`CONTRATO_24_NO_PERTENECE_A_EMPRESA_${META26_EMPRESA_ID}`);
    }

    if (normalizeComparableText(contract.nombre_empresa) !== normalizeComparableText(META26_TARGET_REASON_SOCIAL)) {
      blockers.add('NOMBRE_EMPRESA_CONTRATO_24_NO_COINCIDE_CON_META26');
    }

    if (counts_before.personas !== counts_after.personas ||
      counts_before.vinculaciones !== counts_after.vinculaciones ||
      counts_before.cobertura_asignaciones !== counts_after.cobertura_asignaciones ||
      counts_before.personal_asignaciones_laborales !== counts_after.personal_asignaciones_laborales ||
      counts_before.personal_presentaciones_licitacion !== counts_after.personal_presentaciones_licitacion) {
      blockers.add('CONTEOS_BD_CAMBIARON_DURANTE_DRY_RUN');
    }

    return {
      workbook: inspection,
      contract: {
        id: contract.id,
        empresa_id: contract.empresa_id,
        nombre_empresa: contract.nombre_empresa,
        numero_contrato: contract.numero_contrato,
        fecha_inicio: toDateString(contract.fecha_inicio),
        fecha_finalizacion: toDateString(contract.fecha_finalizacion)
      },
      bd_before: counts_before,
      bd_after: counts_after,
      report_rows,
      review_rows,
      manual_decision_rows: review_rows,
      proposed_aliases: [...proposedAliases.values()].sort((left, right) =>
        right.filas_afectadas - left.filas_afectadas ||
        left.tipo_entidad.localeCompare(right.tipo_entidad, 'es') ||
        left.valor_xlsx.localeCompare(right.valor_xlsx, 'es')
      ),
      coverage_preview: coverage.preview,
      coverage_summary: coverage.summary,
      licitacion_preview: licitacion.preview,
      licitacion_summary: licitacion.summary,
      methods_found,
      tipos_contrato_encontrados,
      tipos_vinculacion_encontrados,
      ubicaciones_encontradas,
      ubicaciones_mapeadas,
      ubicaciones_no_reconocidas,
      otras_razones_sociales: [...otrasRazonesSociales].sort((left, right) => left.localeCompare(right, 'es')),
      unique_identity_conflicts: [...uniqueIdentityConflicts.values()],
      unique_identity_duplicates: [...uniqueIdentityDuplicates],
      unique_people: {
        personas_unicas: uniquePersonPlans.size,
        personas_crear: personPlanItems.filter((item) => item.identity_status === 'PERSONA_NUEVA' && item.person_plan === 'PERSONA_CREAR').length,
        personas_reutilizar: personPlanItems.filter((item) => item.identity_status === 'PERSONA_EXISTENTE' && item.person_plan === 'PERSONA_REUTILIZAR').length,
        vinculaciones_crear: personPlanItems.filter((item) => item.vinc_plan === 'VINCULACION_CREAR').length,
        vinculaciones_reutilizar: personPlanItems.filter((item) => item.vinc_plan === 'VINCULACION_REUTILIZAR').length,
        personas_vinc_previas_otro_contrato: personPlanItems.filter((item) => item.has_other_contracts).length
      },
      changed_operational_detected: 0,
      fields_missing_blocking: fieldCounters.blocking,
      fields_missing_non_blocking: fieldCounters.non_blocking,
      blockers: [...blockers].sort((left, right) => left.localeCompare(right, 'es')),
      modelo_alertas: [
        ...(!contract_features.has_valor_caso_especial_column ? ['La tabla vinculaciones no tiene columna valor_caso_especial.'] : [])
      ],
      importer_supports_real_xlsx: blockers.size === 0,
      is_safe_for_real_import: blockers.size === 0 && review_rows.length === 0
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
