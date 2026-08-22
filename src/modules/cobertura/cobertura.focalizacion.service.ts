import { createHash } from 'node:crypto';

import { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool } from '../../config/db';
import { env } from '../../config/env';
import { getSupabaseAdminClient } from '../../config/supabaseAdmin';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { createSystemAlertFromCandidate } from '../alertas/alertas.service';
import { buildExcelBuffer } from '../reportes/reportes.excel';
import {
  buildChangeKind,
  calculateCoverageFromRule,
  coerceOptionalInteger,
  detectEffectiveDateRange,
  detectImportDuplicates,
  normalizeFocalizacionText,
  type FocalizacionImportStatus,
  type ParsedFocalizacionRow,
} from './cobertura.focalizacion.domain';
import {
  ensureCoverageRulesSchemaReady,
  loadCoverageRuleForContext,
} from './cobertura.rules.service';

interface ContractRow extends QueryResultRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string | null;
  numero_contrato: string | null;
}

interface CargaRow extends QueryResultRow {
  id: string;
  contrato_id: string;
  nombre_archivo: string;
  estado: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  fecha_recepcion: string | null;
  fecha_importacion: Date;
  archivo_sha256: string | null;
  archivo_mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  total_filas: number | null;
  filas_procesadas: number | null;
  filas_alerta: number | null;
  filas_error: number | null;
  resumen_json: Record<string, unknown> | null;
  created_at: Date;
}

interface CountRow extends QueryResultRow {
  total: number;
}

interface MunicipioRow extends QueryResultRow {
  id: string;
  codigo_dane: string;
  nombre_municipio: string;
}

interface ModalidadRow extends QueryResultRow {
  id: string;
  codigo_original: string;
  codigo_base: string;
  nombre_modalidad: string;
}

interface ModalidadAliasRow extends QueryResultRow {
  modalidad_id: string;
  alias: string;
}

interface InstitucionRow extends QueryResultRow {
  id: string;
  codigo_dane: string | null;
  contrato_id: string | null;
  municipio_id: string | null;
  nombre_institucion: string;
}

interface SedeRow extends QueryResultRow {
  id: string;
  institucion_id: string;
  municipio_id: string | null;
  codigo_dane: string | null;
  consecutivo_sede: string | null;
  nombre_sede: string;
}

interface PreliminarDetalleRow extends QueryResultRow {
  id: string;
  fila_origen: number;
  municipio_texto: string | null;
  institucion_original: string;
  sede_original: string;
  consecutivo_original: string | null;
  modalidad_original: string;
  cupos_reportados: number;
  cupos_primaria: number | null;
  cupos_secundaria: number | null;
  techo_primaria: number | null;
  techo_secundaria: number | null;
  techo_total: number | null;
  estado_procesamiento: string | null;
  resultado_comparacion: string | null;
  mensaje_resultado: string | null;
  focalizacion_vigencia_id: string | null;
  cobertura_requerida: number | null;
  created_at: Date;
  fila_metadata: Record<string, unknown> | null;
}

interface FocalizacionVigenciaRow extends QueryResultRow {
  id: string;
  contrato_id: string;
  municipio_id: string | null;
  institucion_id: string;
  sede_id: string;
  modalidad_id: string;
  focalizacion_total: number;
  focalizacion_primaria: number | null;
  focalizacion_secundaria: number | null;
  techo_total: number | null;
  techo_primaria: number | null;
  techo_secundaria: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  cobertura_requerida: number | null;
  cobertura_estado: string;
  origen: string;
  preliminar_id: string | null;
  carga_id: string | null;
}

interface FocalizacionImportSummary {
  total_filas: number;
  procesadas: number;
  aumentos: number;
  disminuciones: number;
  sin_cambio: number;
  nuevas: number;
  alertas: number;
  errores: number;
}

export interface FocalizacionImportLote {
  id: number;
  contrato_id: number;
  contrato_nombre: string | null;
  empresa_id: number;
  empresa_nombre: string | null;
  nombre_archivo: string;
  estado: string;
  fecha_inicio_vigencia: string | null;
  fecha_fin_vigencia: string | null;
  fecha_recepcion: string | null;
  fecha_importacion: string;
  total_filas: number;
  filas_procesadas: number;
  filas_alerta: number;
  filas_error: number;
  resumen: FocalizacionImportSummary;
}

export interface FocalizacionImportRowDetail {
  id: number;
  fila: number;
  municipio: string | null;
  institucion: string;
  sede: string;
  consecutivo: string | null;
  modalidad: string;
  focalizacion_total: number;
  focalizacion_primaria: number | null;
  focalizacion_secundaria: number | null;
  techo_total: number | null;
  estado: string;
  comparacion: string | null;
  mensaje: string;
  cobertura_requerida: number | null;
  focalizacion_vigencia_id: number | null;
}

export interface FocalizacionImportDetailResult {
  lote: FocalizacionImportLote;
  rows: FocalizacionImportRowDetail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    filter: string;
  };
}

export interface FocalizacionImportListResult {
  items: FocalizacionImportLote[];
}

export interface FocalizacionUploadResult {
  lote: FocalizacionImportLote;
  rows: FocalizacionImportRowDetail[];
}

const STORAGE_SCOPE = 'focalizacion';
const ACTIVE_BATCH_STATES = ['PROCESADO', 'PROCESADO_CON_ALERTAS', 'SIN_VIGENCIA'];
const PROCESSED_STATES = new Set([
  'PROCESADA',
  'AUMENTO',
  'DISMINUCION',
  'SIN_CAMBIO',
  'NUEVA_SEDE',
  'NUEVA_MODALIDAD',
  'OFICIAL_POSTERIOR_AJUSTE_MANUAL',
  'SIN_REGLA_COBERTURA',
]);
const ALERT_STATES = new Set([
  'POSIBLE_CAMBIO_DANE',
  'POSIBLE_CAMBIO_NOMBRE',
  'POSIBLE_COINCIDENCIA',
  'MODALIDAD_NO_RECONOCIDA',
  'OFICIAL_POSTERIOR_AJUSTE_MANUAL',
  'SIN_REGLA_COBERTURA',
]);
const ERROR_STATES = new Set([
  'SEDE_NO_RECONOCIDA',
  'MUNICIPIO_NO_RECONOCIDO',
  'FECHA_VIGENCIA_NO_RECONOCIDA',
  'FOCALIZACION_VACIA',
  'DUPLICADO_EN_ARCHIVO',
  'DUPLICADO_CONFLICTIVO',
  'ERROR',
]);
const ERROR_FILTER_STATES = Array.from(ERROR_STATES);
const ALERT_FILTER_STATES = Array.from(ALERT_STATES);
const REPROCESSABLE_STATES = [
  'SEDE_NO_RECONOCIDA',
  'POSIBLE_COINCIDENCIA',
  'MUNICIPIO_NO_RECONOCIDO',
  'MODALIDAD_NO_RECONOCIDA',
  'FECHA_VIGENCIA_NO_RECONOCIDA',
  'SIN_REGLA_COBERTURA',
  'ERROR',
] as const;

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isBlankRow = (row: unknown[]): boolean => {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
};

const hasTenantContractAccess = (
  tenant: TenantAccessContext | undefined,
  contratoId: number,
  empresaId: number,
): boolean => {
  if (!tenant || tenant.isGlobalAdmin) {
    return true;
  }

  if (tenant.contratoIds.length > 0) {
    return tenant.contratoIds.includes(contratoId);
  }

  return tenant.empresaIds.includes(empresaId);
};

const dateMinusOne = (value: string): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

const datePlusOne = (value: string): string => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const ensureFocalizacionSchemaReady = async (client: PoolClient): Promise<void> => {
  const result = await client.query<QueryResultRow>(
    `
      SELECT
        to_regclass('public.focalizacion_vigencias') IS NOT NULL AS has_vigencias,
        to_regclass('public.instituciones_identidad_historial') IS NOT NULL AS has_institucion_historial,
        to_regclass('public.sedes_identidad_historial') IS NOT NULL AS has_sede_historial,
        to_regclass('public.sede_institucion_historial') IS NOT NULL AS has_sede_institucion_historial,
        to_regclass('public.modalidad_aliases') IS NOT NULL AS has_modalidad_aliases
    `,
  );

  const row = result.rows[0];
  if (
    !row?.has_vigencias ||
    !row.has_institucion_historial ||
    !row.has_sede_historial ||
    !row.has_sede_institucion_historial ||
    !row.has_modalidad_aliases
  ) {
    throw new AppError(
      'La base de datos no tiene aplicada la migracion de focalizacion historica.',
      409,
      'FOCALIZACION_MIGRATION_REQUIRED',
    );
  }
};

const loadContractOrThrow = async (
  client: PoolClient,
  contratoId: number,
  tenant?: TenantAccessContext,
): Promise<ContractRow> => {
  const result = await client.query<ContractRow>(
    `
      SELECT
        c.id::text AS id,
        c.empresa_id::text AS empresa_id,
        c.numero_contrato,
        e.nombre_empresa AS empresa_nombre
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [contratoId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Contrato no encontrado', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!hasTenantContractAccess(tenant, contratoId, toNumber(row.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  return row;
};

const buildStoragePath = (contratoId: number, originalName: string): string => {
  const safeName = originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${STORAGE_SCOPE}/contrato_${contratoId}/${Date.now()}-${safeName}`;
};

const uploadOriginalFile = async (
  buffer: Buffer,
  _mimeType: string | null,
  storagePath: string,
): Promise<{ bucket: string | null; path: string | null; bytes: Buffer | null; storageError: string | null }> => {
  const client = getSupabaseAdminClient();
  const upload = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(storagePath, buffer, {
    upsert: false,
  });

  if (upload.error) {
    return {
      bucket: null,
      bytes: buffer,
      path: null,
      storageError: upload.error.message,
    };
  }

  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    bytes: null,
    path: storagePath,
    storageError: null,
  };
};

const findSheetName = (workbook: XLSX.WorkBook): string => {
  const exact = workbook.SheetNames.find((name) => normalizeFocalizacionText(name) === 'DETALLADO');
  return exact ?? workbook.SheetNames[0] ?? '';
};

const findHeaderRowIndex = (rows: unknown[][]): number => {
  for (let index = 0; index < rows.length; index += 1) {
    const normalized = (rows[index] ?? []).map((cell) =>
      normalizeFocalizacionText(typeof cell === 'string' || typeof cell === 'number' ? String(cell) : null),
    );
    const hasBase =
      normalized.includes('CONSECUTIVO') &&
      normalized.includes('MUNICIPIO') &&
      normalized.includes('SEDE EDUCATIVA') &&
      normalized.some((value) => value === 'MODALIDAD' || value.startsWith('MODALIDAD '));
    if (hasBase) {
      return index;
    }
  }

  throw new AppError(
    'No fue posible reconocer la estructura de la hoja DETALLADO.',
    422,
    'FOCALIZACION_LAYOUT_INVALIDO',
  );
};

const buildColumnMap = (headerRow: unknown[], groupHeaderRow: unknown[]): Record<string, number> => {
  const groups: string[] = [];
  let activeGroup = '';

  for (let index = 0; index < headerRow.length; index += 1) {
    const current = normalizeFocalizacionText(
      typeof groupHeaderRow[index] === 'string' || typeof groupHeaderRow[index] === 'number'
        ? String(groupHeaderRow[index])
        : null,
    );
    if (current) {
      activeGroup = current;
    }
    groups[index] = activeGroup;
  }

  const map: Record<string, number> = {};

  for (let index = 0; index < headerRow.length; index += 1) {
    const direct = normalizeFocalizacionText(
      typeof headerRow[index] === 'string' || typeof headerRow[index] === 'number'
        ? String(headerRow[index])
        : null,
    );
    const group = groups[index] ?? '';
    const sub = direct;

    if (direct === 'CONSECUTIVO') map.consecutivo = index;
    if (direct === 'MUNICIPIO') map.municipio = index;
    if (direct === 'INSTITUCION EDUCATIVA') map.institucion = index;
    if (direct === 'SEDE EDUCATIVA') map.sede = index;
    if (direct === 'MODALIDAD' || direct.startsWith('MODALIDAD ')) map.modalidad = index;

    if (group.startsWith('TECHO') && sub === 'PRIMARIA') map.techo_primaria = index;
    if (group.startsWith('TECHO') && sub === 'SECUNDARIA') map.techo_secundaria = index;
    if (group.startsWith('TECHO') && sub === 'TOTAL') map.techo_total = index;
    if (group.startsWith('FOCALIZACION') && sub === 'PRIMARIA') map.focalizacion_primaria = index;
    if (group.startsWith('FOCALIZACION') && sub === 'SECUNDARIA') map.focalizacion_secundaria = index;
    if (group.startsWith('FOCALIZACION') && sub === 'TOTAL') map.focalizacion_total = index;
  }

  const required = ['consecutivo', 'municipio', 'institucion', 'sede', 'modalidad', 'focalizacion_total'];
  const missing = required.filter((key) => typeof map[key] !== 'number');
  if (missing.length > 0) {
    throw new AppError(
      'La hoja DETALLADO no contiene todas las columnas requeridas.',
      422,
      'FOCALIZACION_LAYOUT_INVALIDO',
      { missing },
    );
  }

  return map;
};

export const parseWorkbookRows = (
  buffer: Buffer,
): {
  fechaDetectada: { fecha_inicio_vigencia: string; fecha_fin_vigencia: string } | null;
  rows: ParsedFocalizacionRow[];
} => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = findSheetName(workbook);
  if (!sheetName) {
    throw new AppError('El archivo no contiene hojas para procesar.', 422, 'FOCALIZACION_ARCHIVO_VACIO');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new AppError('La hoja DETALLADO no existe en el archivo cargado.', 422, 'FOCALIZACION_SHEET_NOT_FOUND');
  }
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    defval: null,
    header: 1,
    raw: true,
  }) as unknown[][];

  const headerRowIndex = findHeaderRowIndex(rawRows);
  const columnMap = buildColumnMap(rawRows[headerRowIndex] ?? [], rawRows[headerRowIndex - 1] ?? []);
  const candidates = [
    sheetName,
    ...rawRows
      .slice(0, Math.min(rawRows.length, headerRowIndex + 6))
      .flat()
      .map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''))
      .filter(Boolean),
  ];

  const detectedRange = detectEffectiveDateRange(candidates);
  const rows: ParsedFocalizacionRow[] = [];
  const consecutivoIndex = columnMap.consecutivo as number;
  const municipioIndex = columnMap.municipio as number;
  const institucionIndex = columnMap.institucion as number;
  const sedeIndex = columnMap.sede as number;
  const modalidadIndex = columnMap.modalidad as number;
  const focalizacionTotalIndex = columnMap.focalizacion_total as number;

  for (let index = headerRowIndex + 1; index < rawRows.length; index += 1) {
    const row = rawRows[index] ?? [];
    if (isBlankRow(row)) {
      continue;
    }

    const modalidad = row[modalidadIndex];
    const institucion = row[institucionIndex];
    const sede = row[sedeIndex];
    const municipio = row[municipioIndex];
    if (!municipio || !modalidad || !institucion || !sede) {
      continue;
    }

    rows.push({
      fila_numero: index + 1,
      consecutivo: row[consecutivoIndex] === null ? null : String(row[consecutivoIndex]).trim(),
      municipio: row[municipioIndex] === null ? null : String(row[municipioIndex]).trim(),
      institucion: row[institucionIndex] === null ? null : String(row[institucionIndex]).trim(),
      sede: row[sedeIndex] === null ? null : String(row[sedeIndex]).trim(),
      modalidad: row[modalidadIndex] === null ? null : String(row[modalidadIndex]).trim(),
      techo_primaria:
        typeof columnMap.techo_primaria === 'number'
          ? coerceOptionalInteger(row[columnMap.techo_primaria])
          : null,
      techo_secundaria:
        typeof columnMap.techo_secundaria === 'number'
          ? coerceOptionalInteger(row[columnMap.techo_secundaria])
          : null,
      techo_total:
        typeof columnMap.techo_total === 'number' ? coerceOptionalInteger(row[columnMap.techo_total]) : null,
      focalizacion_primaria:
        typeof columnMap.focalizacion_primaria === 'number'
          ? coerceOptionalInteger(row[columnMap.focalizacion_primaria])
          : null,
      focalizacion_secundaria:
        typeof columnMap.focalizacion_secundaria === 'number'
          ? coerceOptionalInteger(row[columnMap.focalizacion_secundaria])
          : null,
      focalizacion_total: coerceOptionalInteger(row[focalizacionTotalIndex]),
    });
  }

  return {
    fechaDetectada: detectedRange
      ? {
          fecha_fin_vigencia: detectedRange.fecha_fin_vigencia,
          fecha_inicio_vigencia: detectedRange.fecha_inicio_vigencia,
        }
      : null,
    rows,
  };
};

const loadMunicipios = async (client: PoolClient): Promise<MunicipioRow[]> => {
  const result = await client.query<MunicipioRow>(
    `SELECT id::text AS id, codigo_dane, nombre_municipio FROM municipios ORDER BY nombre_municipio ASC, id ASC`,
  );
  return result.rows;
};

const loadModalidades = async (
  client: PoolClient,
): Promise<{ aliases: ModalidadAliasRow[]; modalidades: ModalidadRow[] }> => {
  const [modalidadesResult, aliasesResult] = await Promise.all([
    client.query<ModalidadRow>(
      `SELECT id::text AS id, codigo_original, codigo_base, nombre_modalidad
       FROM modalidades
       WHERE COALESCE(activo, TRUE) = TRUE
       ORDER BY id ASC`,
    ),
    client.query<ModalidadAliasRow>(
      `SELECT modalidad_id::text AS modalidad_id, alias
       FROM modalidad_aliases
       WHERE COALESCE(activo, TRUE) = TRUE
       ORDER BY id ASC`,
    ),
  ]);

  return {
    aliases: aliasesResult.rows,
    modalidades: modalidadesResult.rows,
  };
};

const loadInstituciones = async (client: PoolClient, contratoId: number): Promise<InstitucionRow[]> => {
  const result = await client.query<InstitucionRow>(
    `
      SELECT
        id::text AS id,
        codigo_dane,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        nombre_institucion
      FROM instituciones
      WHERE COALESCE(activo, TRUE) = TRUE
        AND contrato_id = $1::bigint
      ORDER BY id ASC
    `,
    [contratoId],
  );
  return result.rows;
};

const loadSedes = async (client: PoolClient): Promise<SedeRow[]> => {
  const result = await client.query<SedeRow>(
    `
      SELECT
        id::text AS id,
        institucion_id::text AS institucion_id,
        municipio_id::text AS municipio_id,
        codigo_dane,
        consecutivo_sede,
        nombre_sede
      FROM sedes
      WHERE COALESCE(activo, TRUE) = TRUE
      ORDER BY id ASC
    `,
  );
  return result.rows;
};

export const resolveMunicipioId = (value: string | null, municipios: MunicipioRow[], consecutivo?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeFocalizacionText(value);
  const consecutivoDigits = consecutivo?.replace(/\D/g, '') ?? '';
  const municipioCode = consecutivoDigits.length >= 6 ? consecutivoDigits.slice(1, 6) : '';
  const byName = municipios.filter((row) => normalizeFocalizacionText(row.nombre_municipio) === normalized);
  if (byName.length === 1 && byName[0]) {
    return toNumber(byName[0].id);
  }

  const byCode = municipios.filter((row) => normalizeFocalizacionText(row.codigo_dane) === normalized);
  if (byCode.length === 1 && byCode[0]) {
    return toNumber(byCode[0].id);
  }

  const byEmbeddedCode = municipios.filter((row) => municipioCode && row.codigo_dane === municipioCode);
  if (byEmbeddedCode.length === 1 && byEmbeddedCode[0]) {
    return toNumber(byEmbeddedCode[0].id);
  }

  return null;
};

const resolveModalidad = (
  value: string | null,
  modalidades: ModalidadRow[],
  aliases: ModalidadAliasRow[],
): ModalidadRow | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeFocalizacionText(value);
  const exact = modalidades.filter(
    (row) =>
      normalizeFocalizacionText(row.codigo_original) === normalized ||
      normalizeFocalizacionText(row.nombre_modalidad) === normalized,
  );
  if (exact.length === 1 && exact[0]) {
    return exact[0];
  }

  const aliasMatch = aliases.filter((row) => normalizeFocalizacionText(row.alias) === normalized);
  if (aliasMatch.length === 1) {
    return modalidades.find((row) => row.id === aliasMatch[0]?.modalidad_id) ?? null;
  }

  return null;
};

const ensureInstitucionHistory = async (
  client: PoolClient,
  institucionId: number,
  nombre: string,
  codigoDane: string | null,
  cargaId: number,
  actorUserId: string,
): Promise<void> => {
  await client.query(
    `
      INSERT INTO instituciones_identidad_historial (
        institucion_id,
        nombre_original_fuente,
        nombre_normalizado,
        nombre_visible,
        codigo_dane,
        vigente_desde,
        origen,
        archivo_origen_id,
        usuario_id
      )
      SELECT $1::bigint, $2, $3, $2, $4, CURRENT_DATE, 'ARCHIVO', $5::bigint, $6::bigint
      WHERE NOT EXISTS (
        SELECT 1
        FROM instituciones_identidad_historial
        WHERE institucion_id = $1::bigint
          AND nombre_normalizado = $3
          AND COALESCE(codigo_dane, '') = COALESCE($4, '')
      )
    `,
    [institucionId, nombre, normalizeFocalizacionText(nombre), codigoDane, cargaId, actorUserId],
  );
};

const ensureSedeHistory = async (
  client: PoolClient,
  sedeId: number,
  nombre: string,
  codigoDane: string | null,
  consecutivo: string | null,
  cargaId: number,
  actorUserId: string,
): Promise<void> => {
  await client.query(
    `
      INSERT INTO sedes_identidad_historial (
        sede_id,
        nombre_original_fuente,
        nombre_normalizado,
        nombre_visible,
        codigo_dane,
        consecutivo_sede,
        vigente_desde,
        origen,
        archivo_origen_id,
        usuario_id
      )
      SELECT $1::bigint, $2, $3, $2, $4, $5, CURRENT_DATE, 'ARCHIVO', $6::bigint, $7::bigint
      WHERE NOT EXISTS (
        SELECT 1
        FROM sedes_identidad_historial
        WHERE sede_id = $1::bigint
          AND nombre_normalizado = $3
          AND COALESCE(codigo_dane, '') = COALESCE($4, '')
          AND COALESCE(consecutivo_sede, '') = COALESCE($5, '')
      )
    `,
    [sedeId, nombre, normalizeFocalizacionText(nombre), codigoDane, consecutivo, cargaId, actorUserId],
  );
};

const ensureSedeInstitucionHistory = async (
  client: PoolClient,
  sedeId: number,
  institucionId: number,
  cargaId: number,
): Promise<void> => {
  await client.query(
    `
      INSERT INTO sede_institucion_historial (
        sede_id,
        institucion_id,
        vigente_desde,
        origen,
        archivo_origen_id
      )
      SELECT $1::bigint, $2::bigint, CURRENT_DATE, 'ARCHIVO', $3::bigint
      WHERE NOT EXISTS (
        SELECT 1
        FROM sede_institucion_historial
        WHERE sede_id = $1::bigint
          AND institucion_id = $2::bigint
          AND vigente_hasta IS NULL
      )
    `,
    [sedeId, institucionId, cargaId],
  );
};

const createInstitucion = async (
  client: PoolClient,
  contratoId: number,
  municipioId: number | null,
  nombre: string,
  codigoDane: string | null,
): Promise<number> => {
  const result = await client.query<QueryResultRow>(
    `
      INSERT INTO instituciones (contrato_id, municipio_id, codigo_dane, nombre_institucion, activo, created_at)
      VALUES ($1::bigint, $2::bigint, $3, $4, TRUE, NOW())
      RETURNING id::text AS id
    `,
    [contratoId, municipioId, codigoDane, nombre],
  );

  return toNumber(result.rows[0]?.id);
};

const createSede = async (
  client: PoolClient,
  institucionId: number,
  municipioId: number | null,
  nombre: string,
  codigoDane: string | null,
  consecutivo: string | null,
): Promise<number> => {
  const result = await client.query<QueryResultRow>(
    `
      INSERT INTO sedes (institucion_id, municipio_id, codigo_dane, consecutivo_sede, nombre_sede, activo, created_at)
      VALUES ($1::bigint, $2::bigint, $3, $4, $5, TRUE, NOW())
      RETURNING id::text AS id
    `,
    [institucionId, municipioId, codigoDane, consecutivo, nombre],
  );

  return toNumber(result.rows[0]?.id);
};

const ensureSedeModalidad = async (
  client: PoolClient,
  sedeId: number,
  modalidadId: number,
  contratoId: number,
  claveSedeModalidad: string,
): Promise<number> => {
  const existing = await client.query<QueryResultRow>(
    `SELECT id::text AS id FROM sede_modalidades WHERE sede_id = $1::bigint AND modalidad_id = $2::bigint AND contrato_id = $3::bigint LIMIT 1`,
    [sedeId, modalidadId, contratoId],
  );

  if (existing.rows[0]?.id) {
    return toNumber(existing.rows[0].id);
  }

  const inserted = await client.query<QueryResultRow>(
    `
      INSERT INTO sede_modalidades (sede_id, modalidad_id, contrato_id, clave_sede_modalidad, activo, created_at)
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4, TRUE, NOW())
      RETURNING id::text AS id
    `,
    [sedeId, modalidadId, contratoId, claveSedeModalidad],
  );

  return toNumber(inserted.rows[0]?.id);
};

const resolveInstitutionAndSede = async (
  client: PoolClient,
  args: {
    actorUserId: string;
    cargaId: number;
    codigoDaneInstitucion: string | null;
    codigoDaneSede: string | null;
    consecutivo: string | null;
    contratoId: number;
    institucionNombre: string;
    instituciones: InstitucionRow[];
    municipioId: number | null;
    sedeNombre: string;
    sedes: SedeRow[];
  },
): Promise<{ institucion_id: number; message: string; sede_id: number; status: FocalizacionImportStatus }> => {
  const institutionCode = normalizeFocalizacionText(args.codigoDaneInstitucion);
  const institutionName = normalizeFocalizacionText(args.institucionNombre);
  const sedeCode = normalizeFocalizacionText(args.codigoDaneSede);
  const sedeName = normalizeFocalizacionText(args.sedeNombre);
  const consecutivo = normalizeFocalizacionText(args.consecutivo);

  let institucion =
    args.instituciones.find((row) => institutionCode && normalizeFocalizacionText(row.codigo_dane) === institutionCode) ??
    args.instituciones.find(
      (row) =>
        normalizeFocalizacionText(row.nombre_institucion) === institutionName &&
        String(row.municipio_id ?? '') === String(args.municipioId ?? ''),
    );

  if (!institucion) {
    const institucionId = await createInstitucion(
      client,
      args.contratoId,
      args.municipioId,
      args.institucionNombre,
      args.codigoDaneInstitucion,
    );
    await ensureInstitucionHistory(
      client,
      institucionId,
      args.institucionNombre,
      args.codigoDaneInstitucion,
      args.cargaId,
      args.actorUserId,
    );
    args.instituciones.push({
      codigo_dane: args.codigoDaneInstitucion,
      contrato_id: String(args.contratoId),
      id: String(institucionId),
      municipio_id: args.municipioId === null ? null : String(args.municipioId),
      nombre_institucion: args.institucionNombre,
    });
    institucion = args.instituciones.find((row) => row.id === String(institucionId));
  }

  if (!institucion) {
    throw new AppError(
      'No fue posible resolver la institucion del archivo.',
      500,
      'FOCALIZACION_INSTITUCION_RESOLUTION_FAILED',
    );
  }

  const institutionSedes = args.sedes.filter((row) => row.institucion_id === institucion?.id);
  let sede =
    institutionSedes.find((row) => sedeCode && normalizeFocalizacionText(row.codigo_dane) === sedeCode) ??
    institutionSedes.find((row) => consecutivo && normalizeFocalizacionText(row.consecutivo_sede) === consecutivo) ??
    institutionSedes.find(
      (row) =>
        normalizeFocalizacionText(row.nombre_sede) === sedeName &&
        String(row.municipio_id ?? '') === String(args.municipioId ?? ''),
    );

  let status: FocalizacionImportStatus = 'PROCESADA';
  let message = 'Fila procesada correctamente.';

  if (!sede) {
    const possible = institutionSedes.filter((row) => {
      const current = normalizeFocalizacionText(row.nombre_sede);
      return current.includes(sedeName) || sedeName.includes(current);
    });

    if (possible.length > 1) {
      return {
        institucion_id: toNumber(institucion.id),
        message: `Posible coincidencia de sede: ${args.sedeNombre}`,
        sede_id: 0,
        status: 'POSIBLE_COINCIDENCIA',
      };
    }

    const sedeId = await createSede(
      client,
      toNumber(institucion.id),
      args.municipioId,
      args.sedeNombre,
      args.codigoDaneSede,
      args.consecutivo,
    );
    await ensureSedeHistory(
      client,
      sedeId,
      args.sedeNombre,
      args.codigoDaneSede,
      args.consecutivo,
      args.cargaId,
      args.actorUserId,
    );
    await ensureSedeInstitucionHistory(client, sedeId, toNumber(institucion.id), args.cargaId);
    args.sedes.push({
      codigo_dane: args.codigoDaneSede,
      consecutivo_sede: args.consecutivo,
      id: String(sedeId),
      institucion_id: institucion.id,
      municipio_id: args.municipioId === null ? null : String(args.municipioId),
      nombre_sede: args.sedeNombre,
    });

    return {
      institucion_id: toNumber(institucion.id),
      message: `Nueva sede creada: ${args.sedeNombre}`,
      sede_id: sedeId,
      status: 'NUEVA_SEDE',
    };
  }

  if (args.codigoDaneSede && sede.codigo_dane && normalizeFocalizacionText(sede.codigo_dane) !== sedeCode) {
    status = 'POSIBLE_CAMBIO_DANE';
    message = `Posible cambio DANE detectado para la sede ${args.sedeNombre}`;
  }

  if (normalizeFocalizacionText(sede.nombre_sede) !== sedeName && status === 'PROCESADA') {
    status = 'POSIBLE_CAMBIO_NOMBRE';
    message = `Posible cambio de nombre detectado para la sede ${args.sedeNombre}`;
  }

  await ensureInstitucionHistory(
    client,
    toNumber(institucion.id),
    args.institucionNombre,
    args.codigoDaneInstitucion,
    args.cargaId,
    args.actorUserId,
  );
  await ensureSedeHistory(
    client,
    toNumber(sede.id),
    args.sedeNombre,
    args.codigoDaneSede,
    args.consecutivo,
    args.cargaId,
    args.actorUserId,
  );
  await ensureSedeInstitucionHistory(client, toNumber(sede.id), toNumber(institucion.id), args.cargaId);

  return {
    institucion_id: toNumber(institucion.id),
    message,
    sede_id: toNumber(sede.id),
    status,
  };
};

const insertPreliminarRow = async (
  client: PoolClient,
  cargaId: number,
  contratoId: number,
  row: ParsedFocalizacionRow,
): Promise<number> => {
  const result = await client.query<QueryResultRow>(
    `
      INSERT INTO focalizacion_preliminar (
        carga_id,
        contrato_id,
        municipio_texto,
        institucion_original,
        sede_original,
        consecutivo_original,
        modalidad_original,
        cupos_reportados,
        cupos_primaria,
        cupos_secundaria,
        techo_primaria,
        techo_secundaria,
        techo_total,
        fila_origen,
        activo,
        created_at,
        clave_sede_modalidad,
        estado_procesamiento,
        mensaje_resultado
      )
      VALUES ($1::bigint, $2::bigint, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE, NOW(), $15, 'PENDIENTE', 'Fila recibida para procesamiento')
      RETURNING id::text AS id
    `,
    [
      cargaId,
      contratoId,
      row.municipio,
      row.institucion ?? 'SIN INSTITUCION',
      row.sede ?? 'SIN SEDE',
      row.consecutivo,
      row.modalidad ?? 'SIN MODALIDAD',
      row.focalizacion_total ?? 0,
      row.focalizacion_primaria,
      row.focalizacion_secundaria,
      row.techo_primaria,
      row.techo_secundaria,
      row.techo_total,
      row.fila_numero,
      `${normalizeFocalizacionText(row.consecutivo)}|${normalizeFocalizacionText(row.sede)}|${normalizeFocalizacionText(row.modalidad)}`,
    ],
  );

  return toNumber(result.rows[0]?.id);
};

const updatePreliminarResult = async (
  client: PoolClient,
  preliminarId: number,
  input: {
    cobertura_requerida?: number | null;
    estado: FocalizacionImportStatus;
    focalizacion_vigencia_id?: number | null;
    institucion_id?: number | null;
    mensaje: string;
    metadata?: Record<string, unknown> | null;
    modalidad_id?: number | null;
    resultado_comparacion?: string | null;
    sede_id?: number | null;
  },
): Promise<void> => {
  await client.query(
    `
      UPDATE focalizacion_preliminar
      SET estado_procesamiento = $2,
          mensaje_resultado = $3,
          resultado_comparacion = $4,
          institucion_id_resuelta = $5::bigint,
          sede_id_resuelta = $6::bigint,
          modalidad_id_resuelta = $7::bigint,
          focalizacion_vigencia_id = $8::bigint,
          cobertura_requerida = $9::integer,
          fila_metadata = COALESCE(fila_metadata, '{}'::jsonb) || $10::jsonb
      WHERE id = $1::bigint
    `,
    [
      preliminarId,
      input.estado,
      input.mensaje,
      input.resultado_comparacion ?? null,
      input.institucion_id ?? null,
      input.sede_id ?? null,
      input.modalidad_id ?? null,
      input.focalizacion_vigencia_id ?? null,
      input.cobertura_requerida ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
};

const loadLatestExistingVersion = async (
  client: PoolClient,
  contratoId: number,
  sedeId: number,
  modalidadId: number,
): Promise<FocalizacionVigenciaRow | null> => {
  const result = await client.query<FocalizacionVigenciaRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion_id::text AS institucion_id,
        sede_id::text AS sede_id,
        modalidad_id::text AS modalidad_id,
        focalizacion_total,
        focalizacion_primaria,
        focalizacion_secundaria,
        techo_total,
        techo_primaria,
        techo_secundaria,
        vigente_desde::text AS vigente_desde,
        vigente_hasta::text AS vigente_hasta,
        cobertura_requerida,
        cobertura_estado,
        origen
      FROM focalizacion_vigencias
      WHERE contrato_id = $1::bigint
        AND sede_id = $2::bigint
        AND modalidad_id = $3::bigint
      ORDER BY vigente_desde DESC, created_at DESC, id DESC
      LIMIT 1
    `,
    [contratoId, sedeId, modalidadId],
  );

  return result.rows[0] ?? null;
};

const handleOverlappingVersions = async (
  client: PoolClient,
  args: {
    actorUserId: string;
    contratoId: number;
    modalidadId: number;
    newEnd: string | null;
    newStart: string;
    sedeId: number;
  },
): Promise<number | null> => {
  const overlapping = await client.query<FocalizacionVigenciaRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion_id::text AS institucion_id,
        sede_id::text AS sede_id,
        modalidad_id::text AS modalidad_id,
        focalizacion_total,
        focalizacion_primaria,
        focalizacion_secundaria,
        techo_total,
        techo_primaria,
        techo_secundaria,
        vigente_desde::text AS vigente_desde,
        vigente_hasta::text AS vigente_hasta,
        cobertura_requerida,
        cobertura_estado,
        origen
      FROM focalizacion_vigencias
      WHERE contrato_id = $1::bigint
        AND sede_id = $2::bigint
        AND modalidad_id = $3::bigint
        AND COALESCE(vigente_hasta, '9999-12-31'::date) >= $4::date
        AND vigente_desde <= COALESCE($5::date, '9999-12-31'::date)
        AND activo = TRUE
      ORDER BY vigente_desde ASC, id ASC
    `,
    [args.contratoId, args.sedeId, args.modalidadId, args.newStart, args.newEnd],
  );

  let previousVersionId: number | null = null;

  for (const row of overlapping.rows) {
    previousVersionId = toNumber(row.id);
    const oldStart = row.vigente_desde;
    const oldEnd = row.vigente_hasta;

    if (oldStart < args.newStart) {
      await client.query(
        `UPDATE focalizacion_vigencias SET vigente_hasta = $2::date, updated_at = NOW() WHERE id = $1::bigint`,
        [row.id, dateMinusOne(args.newStart)],
      );
    } else {
      await client.query(
        `UPDATE focalizacion_vigencias SET activo = FALSE, updated_at = NOW() WHERE id = $1::bigint`,
        [row.id],
      );
    }

    if (args.newEnd && (!oldEnd || oldEnd > args.newEnd)) {
      await client.query(
        `
          INSERT INTO focalizacion_vigencias (
            contrato_id,
            municipio_id,
            institucion_id,
            sede_id,
            modalidad_id,
            focalizacion_total,
            focalizacion_primaria,
            focalizacion_secundaria,
            techo_total,
            techo_primaria,
            techo_secundaria,
            vigente_desde,
            vigente_hasta,
            cobertura_requerida,
            cobertura_estado,
            origen,
            motivo,
            activo,
            created_by,
            created_at,
            updated_at,
            valor_anterior_id
          )
          VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6, $7, $8, $9, $10, $11, $12::date, $13::date, $14, $15, $16, 'Tail split after overlap', TRUE, $17::bigint, NOW(), NOW(), $18::bigint)
        `,
        [
          row.contrato_id,
          row.municipio_id,
          row.institucion_id,
          row.sede_id,
          row.modalidad_id,
          row.focalizacion_total,
          row.focalizacion_primaria,
          row.focalizacion_secundaria,
          row.techo_total,
          row.techo_primaria,
          row.techo_secundaria,
          datePlusOne(args.newEnd),
          oldEnd,
          row.cobertura_requerida,
          row.cobertura_estado,
          row.origen,
          args.actorUserId,
          row.id,
        ],
      );
    }
  }

  return previousVersionId;
};

const insertFocalizacionVigencia = async (
  client: PoolClient,
  args: {
    actorUserId: string;
    cargaId: number | null;
    contratoId: number;
    coberturaEstado: string;
    coberturaRequerida: number | null;
    fechaFin: string | null;
    fechaInicio: string;
    fechaRecepcion: string | null;
    focalizacionPrimaria: number | null;
    focalizacionSecundaria: number | null;
    focalizacionTotal: number;
    institucionId: number;
    modalidadId: number;
    motivo?: string | null;
    municipioId: number | null;
    observacion?: string | null;
    origin: 'ARCHIVO' | 'MANUAL';
    preliminarId: number | null;
    previousVersionId: number | null;
    reglaConfigId: number | null;
    sedeId: number;
    soporteStorageBucket?: string | null;
    soporteStoragePath?: string | null;
    techoPrimaria: number | null;
    techoSecundaria: number | null;
    techoTotal: number | null;
  },
): Promise<number> => {
  const result = await client.query<QueryResultRow>(
    `
      INSERT INTO focalizacion_vigencias (
        contrato_id,
        municipio_id,
        institucion_id,
        sede_id,
        modalidad_id,
        carga_id,
        preliminar_id,
        regla_config_id,
        focalizacion_total,
        focalizacion_primaria,
        focalizacion_secundaria,
        techo_total,
        techo_primaria,
        techo_secundaria,
        vigente_desde,
        vigente_hasta,
        fecha_recepcion,
        cobertura_requerida,
        cobertura_estado,
        origen,
        motivo,
        observacion,
        soporte_storage_bucket,
        soporte_storage_path,
        activo,
        created_by,
        created_at,
        updated_at,
        valor_anterior_id
      )
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6::bigint, $7::bigint, $8::bigint, $9, $10, $11, $12, $13, $14, $15::date, $16::date, $17::date, $18, $19, $20, $21, $22, $23, $24, TRUE, $25::bigint, NOW(), NOW(), $26::bigint)
      RETURNING id::text AS id
    `,
    [
      args.contratoId,
      args.municipioId,
      args.institucionId,
      args.sedeId,
      args.modalidadId,
      args.cargaId,
      args.preliminarId,
      args.reglaConfigId,
      args.focalizacionTotal,
      args.focalizacionPrimaria,
      args.focalizacionSecundaria,
      args.techoTotal,
      args.techoPrimaria,
      args.techoSecundaria,
      args.fechaInicio,
      args.fechaFin,
      args.fechaRecepcion,
      args.coberturaRequerida,
      args.coberturaEstado,
      args.origin,
      args.motivo ?? null,
      args.observacion ?? null,
      args.soporteStorageBucket ?? null,
      args.soporteStoragePath ?? null,
      args.actorUserId,
      args.previousVersionId,
    ],
  );

  return toNumber(result.rows[0]?.id);
};

const syncFocalizacionFinal = async (
  client: PoolClient,
  contratoId: number,
  sedeId: number,
  modalidadId: number,
  sedeModalidadId: number,
): Promise<void> => {
  const latestResult = await client.query<
    FocalizacionVigenciaRow & {
      categoria_cobertura: string | null;
      codigo_dane_institucion: string | null;
      codigo_dane_sede: string | null;
      consecutivo_sede: string | null;
      institucion_nombre: string;
      modalidad_original: string;
      sede_nombre: string;
    }
  >(
    `
      SELECT
        fv.id::text AS id,
        fv.contrato_id::text AS contrato_id,
        fv.municipio_id::text AS municipio_id,
        fv.institucion_id::text AS institucion_id,
        fv.sede_id::text AS sede_id,
        fv.modalidad_id::text AS modalidad_id,
        fv.focalizacion_total,
        fv.focalizacion_primaria,
        fv.focalizacion_secundaria,
        fv.techo_total,
        fv.techo_primaria,
        fv.techo_secundaria,
        fv.vigente_desde::text AS vigente_desde,
        fv.vigente_hasta::text AS vigente_hasta,
        fv.cobertura_requerida,
        fv.cobertura_estado,
        fv.origen,
        fv.preliminar_id::text AS preliminar_id,
        fv.carga_id::text AS carga_id,
        i.nombre_institucion AS institucion_nombre,
        i.codigo_dane AS codigo_dane_institucion,
        s.nombre_sede AS sede_nombre,
        s.codigo_dane AS codigo_dane_sede,
        s.consecutivo_sede,
        m.codigo_original AS modalidad_original,
        NULL::text AS categoria_cobertura
      FROM focalizacion_vigencias fv
      INNER JOIN instituciones i ON i.id = fv.institucion_id
      INNER JOIN sedes s ON s.id = fv.sede_id
      INNER JOIN modalidades m ON m.id = fv.modalidad_id
      WHERE fv.contrato_id = $1::bigint
        AND fv.sede_id = $2::bigint
        AND fv.modalidad_id = $3::bigint
        AND fv.activo = TRUE
      ORDER BY fv.vigente_desde DESC, fv.created_at DESC, fv.id DESC
      LIMIT 1
    `,
    [contratoId, sedeId, modalidadId],
  );

  const latest = latestResult.rows[0];
  if (!latest) {
    return;
  }

  const existing = await client.query<QueryResultRow>(
    `SELECT id::text AS id FROM focalizacion_final WHERE contrato_id = $1::bigint AND sede_modalidad_id = $2::bigint LIMIT 1`,
    [contratoId, sedeModalidadId],
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE focalizacion_final
        SET preliminar_id = $23::bigint,
            carga_id = $24::bigint,
            municipio_id = $2::bigint,
            municipio_texto = (SELECT nombre_municipio FROM municipios WHERE id = $2::bigint),
            institucion_final = $3,
            sede_final = $4,
            codigo_dane_institucion = $5,
            codigo_dane_sede = $6,
            consecutivo_final = $7,
            modalidad_final = $8,
            cupos_aprobados = $9,
            cupos_primaria = $10,
            cupos_secundaria = $11,
            estado_validacion = 'APROBADO',
            observacion_validacion = $12,
            fecha_validacion = NOW(),
            activo = TRUE,
            updated_at = NOW(),
            institucion_id = $13::bigint,
            sede_id = $14::bigint,
            modalidad_id = $15::bigint,
            sede_modalidad_id = $16::bigint,
            categoria_cobertura = $17,
            clave_sede_modalidad = $18,
            cobertura_requerida = $19::integer,
            cobertura_estado = $20,
            vigente_desde = $21::date,
            vigente_hasta = $22::date
        WHERE id = $1::bigint
      `,
      [
        existing.rows[0].id,
        latest.municipio_id,
        latest.institucion_nombre,
        latest.sede_nombre,
        latest.codigo_dane_institucion,
        latest.codigo_dane_sede,
        latest.consecutivo_sede,
        latest.modalidad_original,
        latest.focalizacion_total,
        latest.focalizacion_primaria ?? 0,
        latest.focalizacion_secundaria ?? 0,
        `Actualizado por importacion historica (${latest.vigente_desde}${latest.vigente_hasta ? ` a ${latest.vigente_hasta}` : ''})`,
        latest.institucion_id,
        latest.sede_id,
        latest.modalidad_id,
        sedeModalidadId,
        latest.categoria_cobertura,
        `${sedeModalidadId}|${latest.modalidad_original}`,
        latest.cobertura_requerida ?? null,
        latest.cobertura_estado,
        latest.vigente_desde,
        latest.vigente_hasta ?? null,
        latest.preliminar_id,
        latest.carga_id,
      ],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO focalizacion_final (
        preliminar_id,
        carga_id,
        contrato_id,
        municipio_id,
        municipio_texto,
        institucion_final,
        sede_final,
        codigo_dane_institucion,
        codigo_dane_sede,
        consecutivo_final,
        modalidad_final,
        cupos_aprobados,
        cupos_primaria,
        cupos_secundaria,
        estado_validacion,
        observacion_validacion,
        fecha_validacion,
        activo,
        created_at,
        updated_at,
        categoria_cobertura,
        clave_sede_modalidad,
        institucion_id,
        sede_id,
        modalidad_id,
        sede_modalidad_id,
        cobertura_requerida,
        cobertura_estado,
        vigente_desde,
        vigente_hasta
      )
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, (SELECT nombre_municipio FROM municipios WHERE id = $4::bigint), $5, $6, $7, $8, $9, $10, $11, $12, $13, 'APROBADO', $14, NOW(), TRUE, NOW(), NOW(), $15, $16, $17::bigint, $18::bigint, $19::bigint, $20::bigint, $21::integer, $22, $23::date, $24::date)
    `,
    [
      latest.preliminar_id,
      latest.carga_id,
      contratoId,
      latest.municipio_id,
      latest.institucion_nombre,
      latest.sede_nombre,
      latest.codigo_dane_institucion,
      latest.codigo_dane_sede,
      latest.consecutivo_sede,
      latest.modalidad_original,
      latest.focalizacion_total,
      latest.focalizacion_primaria ?? 0,
      latest.focalizacion_secundaria ?? 0,
      `Creado por importacion historica (${latest.vigente_desde}${latest.vigente_hasta ? ` a ${latest.vigente_hasta}` : ''})`,
      latest.categoria_cobertura,
      `${sedeModalidadId}|${latest.modalidad_original}`,
      latest.institucion_id,
      latest.sede_id,
      latest.modalidad_id,
      sedeModalidadId,
      latest.cobertura_requerida ?? null,
      latest.cobertura_estado,
      latest.vigente_desde,
      latest.vigente_hasta ?? null,
    ],
  );
};

const loadPreliminarDetailRow = async (
  client: PoolClient,
  preliminarId: number,
): Promise<PreliminarDetalleRow | null> => {
  const result = await client.query<PreliminarDetalleRow>(
    `
      SELECT
        id::text AS id,
        fila_origen,
        municipio_texto,
        institucion_original,
        sede_original,
        consecutivo_original,
        modalidad_original,
        cupos_reportados,
        cupos_primaria,
        cupos_secundaria,
        techo_primaria,
        techo_secundaria,
        techo_total,
        estado_procesamiento,
        resultado_comparacion,
        mensaje_resultado,
        focalizacion_vigencia_id::text AS focalizacion_vigencia_id,
        cobertura_requerida,
        created_at,
        fila_metadata
      FROM focalizacion_preliminar
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [preliminarId],
  );

  return result.rows[0] ?? null;
};

const loadFocalizacionVigenciaById = async (
  client: PoolClient,
  vigenciaId: number,
): Promise<FocalizacionVigenciaRow | null> => {
  const result = await client.query<FocalizacionVigenciaRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion_id::text AS institucion_id,
        sede_id::text AS sede_id,
        modalidad_id::text AS modalidad_id,
        focalizacion_total,
        focalizacion_primaria,
        focalizacion_secundaria,
        techo_total,
        techo_primaria,
        techo_secundaria,
        vigente_desde::text AS vigente_desde,
        vigente_hasta::text AS vigente_hasta,
        cobertura_requerida,
        cobertura_estado,
        origen
      FROM focalizacion_vigencias
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [vigenciaId],
  );

  return result.rows[0] ?? null;
};

const buildCargaState = (summary: FocalizacionImportSummary, hasVigencia: boolean): string => {
  if (!hasVigencia) {
    return 'SIN_VIGENCIA';
  }

  return summary.errores > 0 || summary.alertas > 0 ? 'PROCESADO_CON_ALERTAS' : 'PROCESADO';
};

const parseStoredSummary = (value: Record<string, unknown> | null | undefined): FocalizacionImportSummary | null => {
  if (!value) {
    return null;
  }

  const keys: Array<keyof FocalizacionImportSummary> = [
    'total_filas',
    'procesadas',
    'aumentos',
    'disminuciones',
    'sin_cambio',
    'nuevas',
    'alertas',
    'errores',
  ];

  const summary = {} as FocalizacionImportSummary;
  for (const key of keys) {
    summary[key] = toNumber(value[key] as string | number | null | undefined);
  }

  return summary;
};

const processPreliminarRow = async (
  client: PoolClient,
  args: {
    actorUserId: string;
    aliases: ModalidadAliasRow[];
    cargaId: number;
    contratoId: number;
    existingComparison?: string | null;
    existingStatus?: string | null;
    existingVigenciaId?: number | null;
    fechaDetectada: { fecha_inicio_vigencia: string; fecha_fin_vigencia: string } | null;
    fechaRecepcion: string | null;
    instituciones: InstitucionRow[];
    modalidades: ModalidadRow[];
    municipios: MunicipioRow[];
    preliminarId: number;
    row: ParsedFocalizacionRow;
    sedes: SedeRow[];
  },
): Promise<FocalizacionImportRowDetail> => {
  if (!args.fechaDetectada) {
    await updatePreliminarResult(client, args.preliminarId, {
      estado: 'FECHA_VIGENCIA_NO_RECONOCIDA',
      mensaje: 'No fue posible reconocer la vigencia efectiva del archivo.',
    });
    const detail = await loadPreliminarDetailRow(client, args.preliminarId);
    if (!detail) {
      throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
    }
    return mapDetailRow(detail);
  }

  if (args.row.focalizacion_total === null) {
    await updatePreliminarResult(client, args.preliminarId, {
      estado: 'FOCALIZACION_VACIA',
      mensaje: 'La focalizacion total esta vacia y no puede convertirse en 0 automaticamente.',
    });
    const detail = await loadPreliminarDetailRow(client, args.preliminarId);
    if (!detail) {
      throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
    }
    return mapDetailRow(detail);
  }

  const municipioId = resolveMunicipioId(args.row.municipio, args.municipios, args.row.consecutivo);
  if (!municipioId) {
    await updatePreliminarResult(client, args.preliminarId, {
      estado: 'MUNICIPIO_NO_RECONOCIDO',
      mensaje: `Municipio no reconocido: ${args.row.municipio ?? 'Sin municipio'}`,
    });
    const detail = await loadPreliminarDetailRow(client, args.preliminarId);
    if (!detail) {
      throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
    }
    return mapDetailRow(detail);
  }

  const modalidad = resolveModalidad(args.row.modalidad, args.modalidades, args.aliases);
  if (!modalidad) {
    await updatePreliminarResult(client, args.preliminarId, {
      estado: 'MODALIDAD_NO_RECONOCIDA',
      mensaje: `Modalidad no reconocida: ${args.row.modalidad ?? 'Sin modalidad'}`,
    });
    const detail = await loadPreliminarDetailRow(client, args.preliminarId);
    if (!detail) {
      throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
    }
    return mapDetailRow(detail);
  }

  const identity = await resolveInstitutionAndSede(client, {
    actorUserId: args.actorUserId,
    cargaId: args.cargaId,
    codigoDaneInstitucion: null,
    codigoDaneSede: null,
    consecutivo: args.row.consecutivo,
    contratoId: args.contratoId,
    institucionNombre: args.row.institucion ?? 'SIN INSTITUCION',
    instituciones: args.instituciones,
    municipioId,
    sedeNombre: args.row.sede ?? 'SIN SEDE',
    sedes: args.sedes,
  });

  if (identity.status === 'POSIBLE_COINCIDENCIA') {
    await updatePreliminarResult(client, args.preliminarId, {
      estado: identity.status,
      institucion_id: identity.institucion_id,
      mensaje: identity.message,
    });
    const detail = await loadPreliminarDetailRow(client, args.preliminarId);
    if (!detail) {
      throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
    }
    return mapDetailRow(detail);
  }

  const modalidadId = toNumber(modalidad.id);
  const sedeModalidadId = await ensureSedeModalidad(
    client,
    identity.sede_id,
    modalidadId,
    args.contratoId,
    `${identity.sede_id}|${modalidad.codigo_original}`,
  );
  const rule = await loadCoverageRuleForContext(client, {
    contratoId: args.contratoId,
    modalidadId,
    fechaVigencia: args.fechaDetectada.fecha_inicio_vigencia,
  });
  const coverage = rule
    ? calculateCoverageFromRule(rule, args.row.focalizacion_total)
    : {
        cupos_calculo: Math.max(0, args.row.focalizacion_total),
        manipuladores_requeridos: null,
        status: 'SIN_REGLA_COBERTURA' as const,
      };

  const existingVigencia = args.existingVigenciaId
    ? await loadFocalizacionVigenciaById(client, args.existingVigenciaId)
    : null;
  const previous = existingVigencia ?? await loadLatestExistingVersion(client, args.contratoId, identity.sede_id, modalidadId);
  const impactaCobertura = previous?.cobertura_requerida !== coverage.manipuladores_requeridos;
  const isOfficialAfterManual = !args.existingVigenciaId && previous?.origen === 'MANUAL';

  let vigenciaId = args.existingVigenciaId ?? null;
  if (args.existingVigenciaId) {
    await client.query(
      `
        UPDATE focalizacion_vigencias
        SET municipio_id = $2::bigint,
            institucion_id = $3::bigint,
            sede_id = $4::bigint,
            modalidad_id = $5::bigint,
            regla_config_id = $6::bigint,
            cobertura_requerida = $7::integer,
            cobertura_estado = $8,
            updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [
        args.existingVigenciaId,
        municipioId,
        identity.institucion_id,
        identity.sede_id,
        modalidadId,
        rule?.id ?? null,
        coverage.manipuladores_requeridos,
        coverage.status,
      ],
    );
  } else {
    const previousVersionId = await handleOverlappingVersions(client, {
      actorUserId: args.actorUserId,
      contratoId: args.contratoId,
      modalidadId,
      newEnd: args.fechaDetectada.fecha_fin_vigencia,
      newStart: args.fechaDetectada.fecha_inicio_vigencia,
      sedeId: identity.sede_id,
    });
    vigenciaId = await insertFocalizacionVigencia(client, {
      actorUserId: args.actorUserId,
      cargaId: args.cargaId,
      contratoId: args.contratoId,
      coberturaEstado: coverage.status,
      coberturaRequerida: coverage.manipuladores_requeridos,
      fechaFin: args.fechaDetectada.fecha_fin_vigencia,
      fechaInicio: args.fechaDetectada.fecha_inicio_vigencia,
      fechaRecepcion: args.fechaRecepcion,
      focalizacionPrimaria: args.row.focalizacion_primaria,
      focalizacionSecundaria: args.row.focalizacion_secundaria,
      focalizacionTotal: args.row.focalizacion_total,
      institucionId: identity.institucion_id,
      modalidadId,
      municipioId,
      origin: 'ARCHIVO',
      preliminarId: args.preliminarId,
      previousVersionId: previousVersionId ?? (previous ? toNumber(previous.id) : null),
      reglaConfigId: rule?.id ?? null,
      sedeId: identity.sede_id,
      techoPrimaria: args.row.techo_primaria,
      techoSecundaria: args.row.techo_secundaria,
      techoTotal: args.row.techo_total,
    });
  }

  await syncFocalizacionFinal(client, args.contratoId, identity.sede_id, modalidadId, sedeModalidadId);

  const comparison = args.existingComparison ?? buildChangeKind(previous?.focalizacion_total ?? null, args.row.focalizacion_total);
  const finalStatus: FocalizacionImportStatus =
    coverage.status === 'SIN_REGLA_COBERTURA'
      ? 'SIN_REGLA_COBERTURA'
      : isOfficialAfterManual
        ? 'OFICIAL_POSTERIOR_AJUSTE_MANUAL'
        : args.existingStatus === 'NUEVA_SEDE' || identity.status === 'NUEVA_SEDE'
          ? 'NUEVA_SEDE'
          : comparison === 'AUMENTO'
            ? 'AUMENTO'
            : comparison === 'DISMINUCION'
              ? 'DISMINUCION'
              : comparison === 'SIN_CAMBIO'
                ? 'SIN_CAMBIO'
                : 'PROCESADA';

  const baseMessage =
    coverage.status === 'SIN_REGLA_COBERTURA'
      ? `Focalizacion guardada sin regla de cobertura para ${modalidad.codigo_original}.`
      : identity.message;
  const message = isOfficialAfterManual
    ? `${baseMessage} Focalizacion oficial posterior a ajuste manual.`
    : baseMessage;

  await updatePreliminarResult(client, args.preliminarId, {
    cobertura_requerida: coverage.manipuladores_requeridos,
    estado: finalStatus,
    focalizacion_vigencia_id: vigenciaId,
    institucion_id: identity.institucion_id,
    mensaje: message,
    metadata: {
      impacto_cobertura: impactaCobertura,
      regla_config_id: rule?.id ?? null,
      warning_post_manual: isOfficialAfterManual,
    },
    modalidad_id: modalidadId,
    resultado_comparacion: comparison,
    sede_id: identity.sede_id,
  });

  if (isOfficialAfterManual && vigenciaId) {
    await createSystemAlertFromCandidate(
      {
        descripcion: `Se recibio una focalizacion oficial posterior a un ajuste manual para la sede ${identity.sede_id} y modalidad ${modalidad.codigo_original} con vigencia desde ${args.fechaDetectada.fecha_inicio_vigencia}.`,
        entidad: 'focalizacion_vigencias',
        fecha_vencimiento: null,
        metadata: {
          contrato_id: args.contratoId,
          modalidad_codigo: modalidad.codigo_original,
          modalidad_id: modalidadId,
          origen: 'ARCHIVO',
          preliminar_id: args.preliminarId,
          sede_id: identity.sede_id,
          vigencia_id: vigenciaId
        },
        prioridad: 'BAJA',
        registro_id: String(vigenciaId),
        tipo_alerta: 'FOCALIZACION_OFICIAL_POSTERIOR_A_AJUSTE_MANUAL',
        titulo: 'Focalizacion oficial posterior a ajuste manual'
      },
      args.actorUserId
    );
  }

  const detail = await loadPreliminarDetailRow(client, args.preliminarId);
  if (!detail) {
    throw new AppError('No fue posible recargar la fila preliminar.', 500, 'FOCALIZACION_PRELIMINAR_RELOAD_FAILED');
  }

  return mapDetailRow(detail);
};

const mapDetailRow = (row: PreliminarDetalleRow): FocalizacionImportRowDetail => ({
  comparacion: row.resultado_comparacion,
  consecutivo: row.consecutivo_original,
  cobertura_requerida: row.cobertura_requerida,
  estado: row.estado_procesamiento ?? 'ERROR',
  fila: row.fila_origen,
  focalizacion_primaria: row.cupos_primaria,
  focalizacion_secundaria: row.cupos_secundaria,
  focalizacion_total: row.cupos_reportados,
  focalizacion_vigencia_id: toNullableNumber(row.focalizacion_vigencia_id),
  id: toNumber(row.id),
  institucion: row.institucion_original,
  mensaje: row.mensaje_resultado ?? 'Sin mensaje',
  modalidad: row.modalidad_original,
  municipio: row.municipio_texto,
  sede: row.sede_original,
  techo_total: row.techo_total,
});

const mapSummary = (rows: FocalizacionImportRowDetail[]): FocalizacionImportSummary => ({
  alertas: rows.filter((row) => ALERT_STATES.has(row.estado)).length,
  aumentos: rows.filter((row) => row.comparacion === 'AUMENTO').length,
  disminuciones: rows.filter((row) => row.comparacion === 'DISMINUCION').length,
  errores: rows.filter((row) => ERROR_STATES.has(row.estado)).length,
  nuevas: rows.filter((row) => row.comparacion === 'NUEVA_COMBINACION' || row.estado === 'NUEVA_SEDE').length,
  procesadas: rows.filter((row) => PROCESSED_STATES.has(row.estado)).length,
  sin_cambio: rows.filter((row) => row.comparacion === 'SIN_CAMBIO').length,
  total_filas: rows.length,
});

const mapLote = (
  row: CargaRow,
  contract: ContractRow,
  summary: FocalizacionImportSummary,
): FocalizacionImportLote => ({
  contrato_id: toNumber(contract.id),
  contrato_nombre: contract.numero_contrato,
  empresa_id: toNumber(contract.empresa_id),
  empresa_nombre: contract.empresa_nombre,
  estado: row.estado,
  fecha_fin_vigencia: row.fecha_fin_vigencia,
  fecha_importacion: row.fecha_importacion.toISOString(),
  fecha_inicio_vigencia: row.fecha_inicio_vigencia,
  fecha_recepcion: row.fecha_recepcion,
  filas_alerta: row.filas_alerta ?? summary.alertas,
  filas_error: row.filas_error ?? summary.errores,
  filas_procesadas: row.filas_procesadas ?? summary.procesadas,
  id: toNumber(row.id),
  nombre_archivo: row.nombre_archivo,
  resumen: summary,
  total_filas: row.total_filas ?? summary.total_filas,
});

const getCargaRowOrThrow = async (client: PoolClient, cargaId: number): Promise<CargaRow> => {
  const result = await client.query<CargaRow>(
    `
      SELECT
        id::text AS id,
        contrato_id::text AS contrato_id,
        nombre_archivo,
        estado,
        fecha_inicio_vigencia::text AS fecha_inicio_vigencia,
        fecha_fin_vigencia::text AS fecha_fin_vigencia,
        fecha_recepcion::text AS fecha_recepcion,
        fecha_importacion,
        archivo_sha256,
        archivo_mime_type,
        storage_bucket,
        storage_path,
        total_filas,
        filas_procesadas,
        filas_alerta,
        filas_error,
        resumen_json,
        created_at
      FROM focalizacion_cargas
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [cargaId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError('Lote de focalizacion no encontrado.', 404, 'FOCALIZACION_LOTE_NOT_FOUND');
  }

  return row;
};

const applyCargaFilter = (conditions: string[], params: unknown[], filter: string): void => {
  if (!filter || filter === 'TODOS') {
    return;
  }

  switch (filter) {
    case 'CAMBIOS': {
      const index = params.push(['AUMENTO', 'DISMINUCION']);
      conditions.push(`(resultado_comparacion = ANY($${index}::text[]) OR estado_procesamiento = 'OFICIAL_POSTERIOR_AJUSTE_MANUAL')`);
      break;
    }
    case 'NUEVOS':
      conditions.push(`(resultado_comparacion = 'NUEVA_COMBINACION' OR estado_procesamiento = 'NUEVA_SEDE')`);
      break;
    case 'ERRORES': {
      const index = params.push(ERROR_FILTER_STATES);
      conditions.push(`estado_procesamiento = ANY($${index}::text[])`);
      break;
    }
    case 'ALERTAS': {
      const index = params.push(ALERT_FILTER_STATES);
      conditions.push(`(estado_procesamiento = ANY($${index}::text[]) OR COALESCE((fila_metadata->>'warning_post_manual')::boolean, FALSE) = TRUE)`);
      break;
    }
    case 'SIN_REGLA':
      conditions.push(`estado_procesamiento = 'SIN_REGLA_COBERTURA'`);
      break;
    case 'CON_IMPACTO_COBERTURA':
      conditions.push(`COALESCE((fila_metadata->>'impacto_cobertura')::boolean, FALSE) = TRUE`);
      break;
    case 'SIN_IMPACTO_COBERTURA':
      conditions.push(`focalizacion_vigencia_id IS NOT NULL AND COALESCE((fila_metadata->>'impacto_cobertura')::boolean, FALSE) = FALSE`);
      break;
    default: {
      const index = params.push(filter);
      conditions.push(`estado_procesamiento = $${index}`);
      break;
    }
  }
};

const loadCargaRows = async (
  client: PoolClient,
  cargaId: number,
  filter: string,
  page: number,
  limit: number,
): Promise<{ rows: PreliminarDetalleRow[]; total: number }> => {
  const params: unknown[] = [cargaId];
  const conditions = ['carga_id = $1::bigint'];
  applyCargaFilter(conditions, params, filter);

  const where = conditions.join(' AND ');
  const totalResult = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS total FROM focalizacion_preliminar WHERE ${where}`,
    params,
  );

  params.push(limit);
  params.push((page - 1) * limit);
  const result = await client.query<PreliminarDetalleRow>(
    `
      SELECT
        id::text AS id,
        fila_origen,
        municipio_texto,
        institucion_original,
        sede_original,
        consecutivo_original,
        modalidad_original,
        cupos_reportados,
        cupos_primaria,
        cupos_secundaria,
        techo_primaria,
        techo_secundaria,
        techo_total,
        estado_procesamiento,
        resultado_comparacion,
        mensaje_resultado,
        focalizacion_vigencia_id::text AS focalizacion_vigencia_id,
        cobertura_requerida,
        created_at,
        fila_metadata
      FROM focalizacion_preliminar
      WHERE ${where}
      ORDER BY fila_origen ASC, id ASC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params,
  );

  return {
    rows: result.rows,
    total: totalResult.rows[0]?.total ?? 0,
  };
};

const updateCargaSummary = async (
  client: PoolClient,
  cargaId: number,
  summary: FocalizacionImportSummary,
  estado: string,
): Promise<void> => {
  await client.query(
    `
      UPDATE focalizacion_cargas
      SET estado = $2,
          total_filas = $3,
          filas_procesadas = $4,
          filas_alerta = $5,
          filas_error = $6,
          resumen_json = $7::jsonb,
          fecha_importacion = COALESCE(fecha_importacion, NOW())
      WHERE id = $1::bigint
    `,
    [cargaId, estado, summary.total_filas, summary.procesadas, summary.alertas, summary.errores, JSON.stringify(summary)],
  );
};

export const buildFocalizacionImportTemplate = (): Buffer => {
  return buildExcelBuffer({
    columns: [
      { header: 'CONSECUTIVO', key: 'consecutivo' },
      { header: 'MUNICIPIO', key: 'municipio' },
      { header: 'INSTITUCION EDUCATIVA', key: 'institucion' },
      { header: 'SEDE EDUCATIVA', key: 'sede' },
      { header: 'MODALIDAD', key: 'modalidad' },
      { header: 'TECHO PRIMARIA', key: 'techo_primaria' },
      { header: 'TECHO SECUNDARIA', key: 'techo_secundaria' },
      { header: 'TECHO TOTAL', key: 'techo_total' },
      { header: 'FOCALIZACION PRIMARIA', key: 'focalizacion_primaria' },
      { header: 'FOCALIZACION SECUNDARIA', key: 'focalizacion_secundaria' },
      { header: 'FOCALIZACION TOTAL', key: 'focalizacion_total' },
    ],
    rows: [
      {
        consecutivo: '001',
        focalizacion_primaria: 100,
        focalizacion_secundaria: 90,
        focalizacion_total: 190,
        institucion: 'INSTITUCION EDUCATIVA EJEMPLO',
        modalidad: 'CAA',
        municipio: 'PUERTO LOPEZ',
        sede: 'SEDE PRINCIPAL',
        techo_primaria: 120,
        techo_secundaria: 140,
        techo_total: 260,
      },
    ],
    sheetName: 'DETALLADO',
  });
};

export const getFocalizacionImportDetail = async (
  cargaId: number,
  page = 1,
  limit = 100,
  filter = 'TODOS',
  tenant?: TenantAccessContext,
): Promise<FocalizacionImportDetailResult> => {
  const client = await dbPool.connect();

  try {
    await ensureFocalizacionSchemaReady(client);
    const lote = await getCargaRowOrThrow(client, cargaId);
    const contract = await loadContractOrThrow(client, toNumber(lote.contrato_id), tenant);
    const detail = await loadCargaRows(client, cargaId, filter, page, limit);
    const rows = detail.rows.map(mapDetailRow);
    const summary = parseStoredSummary(lote.resumen_json) ?? mapSummary(rows);

    return {
      lote: mapLote(lote, contract, summary),
      pagination: {
        filter,
        limit,
        page,
        total: detail.total,
        total_pages: Math.max(1, Math.ceil(detail.total / limit)),
      },
      rows,
    };
  } finally {
    client.release();
  }
};

export const listFocalizacionImportaciones = async (
  contratoId: number,
  tenant?: TenantAccessContext,
): Promise<FocalizacionImportListResult> => {
  const client = await dbPool.connect();

  try {
    await ensureFocalizacionSchemaReady(client);
    const contract = await loadContractOrThrow(client, contratoId, tenant);
    const result = await client.query<CargaRow>(
      `
        SELECT
          id::text AS id,
          contrato_id::text AS contrato_id,
          nombre_archivo,
          estado,
          fecha_inicio_vigencia::text AS fecha_inicio_vigencia,
          fecha_fin_vigencia::text AS fecha_fin_vigencia,
          fecha_recepcion::text AS fecha_recepcion,
          fecha_importacion,
          archivo_sha256,
          archivo_mime_type,
          storage_bucket,
          storage_path,
          total_filas,
          filas_procesadas,
          filas_alerta,
          filas_error,
          resumen_json,
          created_at
        FROM focalizacion_cargas
        WHERE contrato_id = $1::bigint
        ORDER BY created_at DESC, id DESC
      `,
      [contratoId],
    );

    const items: FocalizacionImportLote[] = [];
    for (const row of result.rows) {
      const storedSummary = parseStoredSummary(row.resumen_json);
      if (storedSummary) {
        items.push(mapLote(row, contract, storedSummary));
        continue;
      }

      const detail = await loadCargaRows(client, toNumber(row.id), 'TODOS', 1, 1000);
      items.push(mapLote(row, contract, mapSummary(detail.rows.map(mapDetailRow))));
    }

    return { items };
  } finally {
    client.release();
  }
};

export const buildFocalizacionImportReport = async (
  cargaId: number,
  tenant?: TenantAccessContext,
): Promise<Buffer> => {
  const detail = await getFocalizacionImportDetail(cargaId, 1, 5000, 'TODOS', tenant);
  return buildExcelBuffer({
    columns: [
      { header: 'Fila', key: 'fila' },
      { header: 'Municipio', key: 'municipio' },
      { header: 'Institucion', key: 'institucion' },
      { header: 'Sede', key: 'sede' },
      { header: 'Consecutivo', key: 'consecutivo' },
      { header: 'Modalidad', key: 'modalidad' },
      { header: 'Focalizacion total', key: 'focalizacion_total' },
      { header: 'Estado', key: 'estado' },
      { header: 'Comparacion', key: 'comparacion' },
      { header: 'Mensaje', key: 'mensaje' },
      { header: 'Cobertura requerida', key: 'cobertura_requerida' },
      { header: 'Focalizacion vigencia ID', key: 'focalizacion_vigencia_id' },
    ],
    rows: detail.rows as unknown as Array<Record<string, unknown>>, 
    sheetName: 'Resultado',
  });
};

export const uploadHistoricalFocalizacionFile = async (
  fileBuffer: Buffer,
  originalFileName: string,
  mimeType: string | null,
  actorUserId: string,
  contratoId: number,
  tenant?: TenantAccessContext,
): Promise<FocalizacionUploadResult> => {
  const parsed = parseWorkbookRows(fileBuffer);
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureFocalizacionSchemaReady(client);
    const contract = await loadContractOrThrow(client, contratoId, tenant);

    const existing = await client.query<QueryResultRow>(
      `
        SELECT id::text AS id
        FROM focalizacion_cargas
        WHERE contrato_id = $1::bigint
          AND archivo_sha256 = $2
          AND fecha_inicio_vigencia IS NOT DISTINCT FROM $3::date
          AND fecha_fin_vigencia IS NOT DISTINCT FROM $4::date
          AND estado = ANY($5::text[])
        ORDER BY id DESC
        LIMIT 1
      `,
      [
        contratoId,
        sha256,
        parsed.fechaDetectada?.fecha_inicio_vigencia ?? null,
        parsed.fechaDetectada?.fecha_fin_vigencia ?? null,
        ACTIVE_BATCH_STATES,
      ],
    );

    if (existing.rows[0]?.id) {
      await client.query('ROLLBACK');
      const detail = await getFocalizacionImportDetail(toNumber(existing.rows[0].id), 1, 200, 'TODOS', tenant);
      return { lote: detail.lote, rows: detail.rows };
    }

    const storage = await uploadOriginalFile(fileBuffer, mimeType, buildStoragePath(contratoId, originalFileName));
    const fechaRecepcion = new Date().toISOString().slice(0, 10);
    const insertCarga = await client.query<QueryResultRow>(
      `
        INSERT INTO focalizacion_cargas (
          contrato_id,
          nombre_archivo,
          periodo,
          fecha_carga,
          fecha_recepcion,
          fecha_inicio_vigencia,
          fecha_fin_vigencia,
          fecha_importacion,
          usuario_carga_id,
          estado,
          observacion,
          activo,
          created_at,
          version,
          es_vigente,
          archivo_mime_type,
          archivo_sha256,
          storage_bucket,
          storage_path,
          archivo_bytes,
          total_filas,
          filas_procesadas,
          filas_alerta,
          filas_error,
          resumen_json,
          created_by
        )
        VALUES ($1::bigint, $2, $3, NOW(), $4::date, $5::date, $6::date, NOW(), $7::bigint, $8, $9, TRUE, NOW(), 1, FALSE, $10, $11, $12, $13, $14, $15, 0, 0, 0, '{}'::jsonb, $7::bigint)
        RETURNING id::text AS id
      `,
      [
        contratoId,
        originalFileName,
        parsed.fechaDetectada
          ? `${parsed.fechaDetectada.fecha_inicio_vigencia} a ${parsed.fechaDetectada.fecha_fin_vigencia}`
          : null,
        fechaRecepcion,
        parsed.fechaDetectada?.fecha_inicio_vigencia ?? null,
        parsed.fechaDetectada?.fecha_fin_vigencia ?? null,
        actorUserId,
        parsed.fechaDetectada ? 'PROCESANDO' : 'SIN_VIGENCIA',
        parsed.fechaDetectada
          ? storage.storageError
            ? `Archivo cargado para procesamiento historico. Archivo original conservado en base de datos por fallback: ${storage.storageError}`
            : 'Archivo cargado para procesamiento historico.'
          : storage.storageError
            ? `No fue posible reconocer la vigencia del archivo. Archivo original conservado en base de datos por fallback: ${storage.storageError}`
            : 'No fue posible reconocer la vigencia del archivo.',
        mimeType,
        sha256,
        storage.bucket,
        storage.path,
        storage.bytes,
        parsed.rows.length,
      ],
    );
    const cargaId = toNumber(insertCarga.rows[0]?.id);

    const municipios = await loadMunicipios(client);
    const { aliases, modalidades } = await loadModalidades(client);
    const instituciones = await loadInstituciones(client, contratoId);
    const sedes = await loadSedes(client);
    const duplicates = detectImportDuplicates(parsed.rows);
    const processedRows: FocalizacionImportRowDetail[] = [];

    for (const row of parsed.rows) {
      await client.query(`SAVEPOINT focalizacion_row_${row.fila_numero}`);

      try {
        const preliminarId = await insertPreliminarRow(client, cargaId, contratoId, row);
        let processedRow: FocalizacionImportRowDetail | null = null;

        if (!parsed.fechaDetectada) {
          await updatePreliminarResult(client, preliminarId, {
            estado: 'FECHA_VIGENCIA_NO_RECONOCIDA',
            mensaje: 'No fue posible reconocer la vigencia efectiva del archivo.',
          });
        } else if (duplicates.conflictRows.has(row.fila_numero)) {
          await updatePreliminarResult(client, preliminarId, {
            estado: 'DUPLICADO_CONFLICTIVO',
            mensaje: `Documento duplicado conflictivo con filas ${duplicates.conflictRows.get(row.fila_numero)?.join(', ')}`,
          });
        } else if (duplicates.duplicateRows.has(row.fila_numero)) {
          await updatePreliminarResult(client, preliminarId, {
            estado: 'DUPLICADO_EN_ARCHIVO',
            mensaje: `Documento duplicado en filas ${duplicates.duplicateRows.get(row.fila_numero)?.join(', ')}`,
          });
        } else {
          processedRow = await processPreliminarRow(client, {
            actorUserId,
            aliases,
            cargaId,
            contratoId,
            fechaDetectada: parsed.fechaDetectada,
            fechaRecepcion,
            instituciones,
            modalidades,
            municipios,
            preliminarId,
            row,
            sedes,
          });
        }

        if (!processedRow) {
          const current = await loadPreliminarDetailRow(client, preliminarId);
          if (current) {
            processedRow = mapDetailRow(current);
          }
        }

        if (processedRow) {
          processedRows.push(processedRow);
        }

        await client.query(`RELEASE SAVEPOINT focalizacion_row_${row.fila_numero}`);
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT focalizacion_row_${row.fila_numero}`);
        const preliminarId = await insertPreliminarRow(client, cargaId, contratoId, row);
        await updatePreliminarResult(client, preliminarId, {
          estado: 'ERROR',
          mensaje: error instanceof Error ? error.message : 'Error inesperado procesando la fila.',
        });
        const current = await loadPreliminarDetailRow(client, preliminarId);
        if (current) {
          processedRows.push(mapDetailRow(current));
        }
      }
    }

    const summary = mapSummary(processedRows);
    const finalState = buildCargaState(summary, Boolean(parsed.fechaDetectada));
    await updateCargaSummary(client, cargaId, summary, finalState);

    await registerAuditEntry({
      accion: 'focalizacion.import.upload',
      after: {
        alertas: summary.alertas,
        archivo: originalFileName,
        contrato_id: contratoId,
        errores: summary.errores,
        procesadas: summary.procesadas,
        total_filas: summary.total_filas,
      },
      client,
      descripcion: `Importacion historica de focalizacion ${originalFileName}`,
      registro_id: String(cargaId),
      tabla: 'focalizacion_cargas',
      usuario_id: actorUserId,
    });

    await client.query('COMMIT');

    return {
      lote: mapLote(await getCargaRowOrThrow(client, cargaId), contract, summary),
      rows: processedRows,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reprocessHistoricalFocalizacionImport = async (
  cargaId: number,
  actorUserId: string,
  input: {
    fecha_inicio_vigencia?: string | null;
    fecha_fin_vigencia?: string | null;
    preliminar_ids?: number[];
  },
  tenant?: TenantAccessContext,
): Promise<FocalizacionImportDetailResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureFocalizacionSchemaReady(client);
    await ensureCoverageRulesSchemaReady(client);

    if ((input.fecha_inicio_vigencia && !input.fecha_fin_vigencia) || (!input.fecha_inicio_vigencia && input.fecha_fin_vigencia)) {
      throw new AppError(
        'Debes enviar fecha_inicio_vigencia y fecha_fin_vigencia juntas para reprocesar sin vigencia detectada.',
        422,
        'FOCALIZACION_REPROCESS_DATE_RANGE_REQUIRED',
      );
    }

    const lote = await getCargaRowOrThrow(client, cargaId);
    const contract = await loadContractOrThrow(client, toNumber(lote.contrato_id), tenant);
    const fechaDetectada = input.fecha_inicio_vigencia && input.fecha_fin_vigencia
      ? {
          fecha_inicio_vigencia: input.fecha_inicio_vigencia,
          fecha_fin_vigencia: input.fecha_fin_vigencia,
        }
      : lote.fecha_inicio_vigencia && lote.fecha_fin_vigencia
        ? {
            fecha_inicio_vigencia: lote.fecha_inicio_vigencia,
            fecha_fin_vigencia: lote.fecha_fin_vigencia,
          }
        : null;

    if (input.fecha_inicio_vigencia && input.fecha_fin_vigencia) {
      await client.query(
        `
          UPDATE focalizacion_cargas
          SET fecha_inicio_vigencia = $2::date,
              fecha_fin_vigencia = $3::date,
              periodo = $4,
              estado = 'PROCESANDO',
              observacion = 'Lote reabierto para reproceso con vigencia ajustada.',
              fecha_importacion = NOW()
          WHERE id = $1::bigint
        `,
        [
          cargaId,
          input.fecha_inicio_vigencia,
          input.fecha_fin_vigencia,
          `${input.fecha_inicio_vigencia} a ${input.fecha_fin_vigencia}`,
        ],
      );
    }

    const rowParams: unknown[] = [cargaId];
    const rowConditions = ['carga_id = $1::bigint'];
    if (input.preliminar_ids && input.preliminar_ids.length > 0) {
      const index = rowParams.push(input.preliminar_ids);
      rowConditions.push(`id = ANY($${index}::bigint[])`);
    } else {
      const index = rowParams.push(Array.from(REPROCESSABLE_STATES));
      rowConditions.push(`estado_procesamiento = ANY($${index}::text[])`);
    }

    const rowsToReprocess = await client.query<PreliminarDetalleRow>(
      `
        SELECT
          id::text AS id,
          fila_origen,
          municipio_texto,
          institucion_original,
          sede_original,
          consecutivo_original,
          modalidad_original,
          cupos_reportados,
          cupos_primaria,
          cupos_secundaria,
          techo_primaria,
          techo_secundaria,
          techo_total,
          estado_procesamiento,
          resultado_comparacion,
          mensaje_resultado,
          focalizacion_vigencia_id::text AS focalizacion_vigencia_id,
          cobertura_requerida,
          created_at,
          fila_metadata
        FROM focalizacion_preliminar
        WHERE ${rowConditions.join(' AND ')}
        ORDER BY fila_origen ASC, id ASC
      `,
      rowParams,
    );

    const municipios = await loadMunicipios(client);
    const { aliases, modalidades } = await loadModalidades(client);
    const instituciones = await loadInstituciones(client, toNumber(lote.contrato_id));
    const sedes = await loadSedes(client);

    for (const row of rowsToReprocess.rows) {
      await client.query(`SAVEPOINT focalizacion_reprocess_${row.id}`);
      try {
        await processPreliminarRow(client, {
          actorUserId,
          aliases,
          cargaId,
          contratoId: toNumber(lote.contrato_id),
          existingComparison: row.resultado_comparacion,
          existingStatus: row.estado_procesamiento ?? null,
          existingVigenciaId: toNullableNumber(row.focalizacion_vigencia_id),
          fechaDetectada,
          fechaRecepcion: lote.fecha_recepcion,
          instituciones,
          modalidades,
          municipios,
          preliminarId: toNumber(row.id),
          row: {
            consecutivo: row.consecutivo_original,
            fila_numero: row.fila_origen,
            focalizacion_primaria: row.cupos_primaria,
            focalizacion_secundaria: row.cupos_secundaria,
            focalizacion_total: row.cupos_reportados,
            institucion: row.institucion_original,
            modalidad: row.modalidad_original,
            municipio: row.municipio_texto,
            sede: row.sede_original,
            techo_primaria: row.techo_primaria,
            techo_secundaria: row.techo_secundaria,
            techo_total: row.techo_total,
          },
          sedes,
        });
        await client.query(`RELEASE SAVEPOINT focalizacion_reprocess_${row.id}`);
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT focalizacion_reprocess_${row.id}`);
        await updatePreliminarResult(client, toNumber(row.id), {
          estado: 'ERROR',
          mensaje: error instanceof Error ? error.message : 'Error inesperado durante el reproceso de la fila.',
        });
      }
    }

    const allRows = await loadCargaRows(client, cargaId, 'TODOS', 1, 50000);
    const mappedRows = allRows.rows.map(mapDetailRow);
    const summary = mapSummary(mappedRows);
    await updateCargaSummary(client, cargaId, summary, buildCargaState(summary, Boolean(fechaDetectada)));

    await registerAuditEntry({
      accion: 'focalizacion.import.reprocess',
      after: {
        carga_id: cargaId,
        filas_reprocesadas: rowsToReprocess.rows.length,
        fecha_fin_vigencia: fechaDetectada?.fecha_fin_vigencia ?? null,
        fecha_inicio_vigencia: fechaDetectada?.fecha_inicio_vigencia ?? null,
      },
      client,
      descripcion: `Reproceso de lote historico de focalizacion ${cargaId}`,
      registro_id: String(cargaId),
      tabla: 'focalizacion_cargas',
      usuario_id: actorUserId,
    });

    const loteActualizado = await getCargaRowOrThrow(client, cargaId);
    const detail = await loadCargaRows(client, cargaId, 'TODOS', 1, 200);
    await client.query('COMMIT');

    return {
      lote: mapLote(loteActualizado, contract, summary),
      pagination: {
        filter: 'TODOS',
        limit: 200,
        page: 1,
        total: detail.total,
        total_pages: Math.max(1, Math.ceil(detail.total / 200)),
      },
      rows: detail.rows.map(mapDetailRow),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export interface FocalizacionComparisonItem {
  municipio: string | null;
  institucion: string;
  sede: string;
  modalidad_anterior: string | null;
  modalidad_nueva: string | null;
  focalizacion_anterior: number | null;
  focalizacion_nueva: number | null;
  delta_focalizacion: number;
  requeridas_antes: number | null;
  requeridas_ahora: number | null;
  delta_requeridas: number;
  tipo_cambio: 'NUEVA' | 'RETIRADA' | 'AUMENTÓ' | 'DISMINUYÓ' | 'MODALIDAD CAMBIÓ' | 'SIN CAMBIO';
  personal_asignado_actual: number;
  impacto_personal: string;
}

export interface FocalizacionComparisonResult {
  carga_a_id: number;
  carga_b_id: number;
  resumen: { sedes_nuevas: number; sedes_retiradas: number; cambios_modalidad: number; aumentos: number; disminuciones: number; manipuladoras_adicionales: number; potencialmente_excedentes: number };
  filas: FocalizacionComparisonItem[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
  graficos: { municipios: Array<{ municipio: string; anterior: number; nueva: number; requeridas_antes: number; requeridas_ahora: number }>; modalidades: Array<{ modalidad: string; requeridas_antes: number; requeridas_ahora: number }> };
}

const comparisonText = (value: string | null | undefined): string => normalizeFocalizacionText(value ?? '');
const comparisonBaseKey = (row: FocalizacionImportRowDetail): string => [row.municipio, row.institucion, row.sede, row.consecutivo].map(comparisonText).join('|');

export const compareFocalizacionImports = async (
  input: { carga_a_id: number; carga_b_id: number; municipio?: string; modalidad?: string; tipo_cambio?: FocalizacionComparisonItem['tipo_cambio']; solo_cambios: boolean; fecha?: string; page: number; limit: number },
  tenant?: TenantAccessContext,
): Promise<FocalizacionComparisonResult> => {
  const [a, b] = await Promise.all([
    getFocalizacionImportDetail(input.carga_a_id, 1, 5000, 'TODOS', tenant),
    getFocalizacionImportDetail(input.carga_b_id, 1, 5000, 'TODOS', tenant),
  ]);
  if (a.lote.contrato_id !== b.lote.contrato_id) throw new AppError('Las focalizaciones deben pertenecer al mismo contrato.', 422, 'FOCALIZACION_COMPARISON_CONTRACT_MISMATCH');
  const byBase = (rows: FocalizacionImportRowDetail[]) => new Map([...rows.reduce((map, row) => { const key = comparisonBaseKey(row); if (!map.has(key)) map.set(key, row); return map; }, new Map<string, FocalizacionImportRowDetail>())]);
  const oldMap = byBase(a.rows);
  const newMap = byBase(b.rows);
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const client = await dbPool.connect();
  try {
    const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
    const assigned = await client.query<{ municipio: string | null; institucion: string | null; sede: string | null; consecutivo: string | null; assigned: number }>(`SELECT ff.municipio_texto AS municipio, ff.institucion_final AS institucion, ff.sede_final AS sede, ff.consecutivo_final AS consecutivo, COUNT(DISTINCT ca.vinculacion_id)::int AS assigned FROM focalizacion_final ff LEFT JOIN cobertura_asignaciones ca ON ca.focalizacion_final_id = ff.id AND ca.activo = TRUE AND ca.fecha_inicio <= $2::date AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= $2::date) WHERE ff.contrato_id = $1::bigint GROUP BY ff.municipio_texto, ff.institucion_final, ff.sede_final, ff.consecutivo_final`, [a.lote.contrato_id, fecha]);
    const assignedMap = new Map(assigned.rows.map((row) => [[row.municipio, row.institucion, row.sede, row.consecutivo].map((value) => comparisonText(value)).join("|"), row.assigned]));
    const rows: FocalizacionComparisonItem[] = [];
    for (const key of keys) {
      const oldRow = oldMap.get(key) ?? null;
      const newRow = newMap.get(key) ?? null;
      const oldModalidad = oldRow?.modalidad ?? null;
      const newModalidad = newRow?.modalidad ?? null;
      const oldFocal = oldRow?.focalizacion_total ?? null;
      const newFocal = newRow?.focalizacion_total ?? null;
      const oldReq = oldRow?.cobertura_requerida ?? null;
      const newReq = newRow?.cobertura_requerida ?? null;
      const deltaFocal = (newFocal ?? 0) - (oldFocal ?? 0);
      const deltaReq = (newReq ?? 0) - (oldReq ?? 0);
      let tipo: FocalizacionComparisonItem['tipo_cambio'] = 'SIN CAMBIO';
      if (!oldRow) tipo = 'NUEVA'; else if (!newRow) tipo = 'RETIRADA'; else if (comparisonText(oldModalidad) !== comparisonText(newModalidad)) tipo = 'MODALIDAD CAMBIÓ'; else if (deltaFocal > 0 || deltaReq > 0) tipo = 'AUMENTÓ'; else if (deltaFocal < 0 || deltaReq < 0) tipo = 'DISMINUYÓ';
      const assignedCount = assignedMap.get(key) ?? 0;
      let impact = 'SIN IMPACTO';
      if (tipo === 'NUEVA') impact = `REQUIERE ASIGNAR ${newReq ?? 0}`;
      else if (tipo === 'RETIRADA') impact = `REVISAR REASIGNACIÓN DE ${assignedCount}`;
      else if (tipo === 'MODALIDAD CAMBIÓ') impact = `REVISAR ${assignedCount} ASIGNACIONES`;
      else if (deltaReq > 0) impact = `NECESITA +${deltaReq}`;
      else if (deltaReq < 0) impact = `EXCEDENTE ${Math.abs(deltaReq)}`;
      rows.push({ municipio: newRow?.municipio ?? oldRow?.municipio ?? null, institucion: newRow?.institucion ?? oldRow?.institucion ?? '', sede: newRow?.sede ?? oldRow?.sede ?? '', modalidad_anterior: oldModalidad, modalidad_nueva: newModalidad, focalizacion_anterior: oldFocal, focalizacion_nueva: newFocal, delta_focalizacion: deltaFocal, requeridas_antes: oldReq, requeridas_ahora: newReq, delta_requeridas: deltaReq, tipo_cambio: tipo, personal_asignado_actual: assignedCount, impacto_personal: impact });
    }
    const filtered = rows.filter((row) => (!input.municipio || comparisonText(row.municipio).includes(comparisonText(input.municipio))) && (!input.modalidad || comparisonText(row.modalidad_nueva ?? row.modalidad_anterior).includes(comparisonText(input.modalidad))) && (!input.tipo_cambio || row.tipo_cambio === input.tipo_cambio) && (!input.solo_cambios || row.tipo_cambio !== 'SIN CAMBIO'));
    const municipios = [...new Set(filtered.map((row) => row.municipio ?? 'Sin municipio'))].map((municipio) => { const subset = filtered.filter((row) => (row.municipio ?? 'Sin municipio') === municipio); return { municipio, anterior: subset.reduce((sum, row) => sum + (row.focalizacion_anterior ?? 0), 0), nueva: subset.reduce((sum, row) => sum + (row.focalizacion_nueva ?? 0), 0), requeridas_antes: subset.reduce((sum, row) => sum + (row.requeridas_antes ?? 0), 0), requeridas_ahora: subset.reduce((sum, row) => sum + (row.requeridas_ahora ?? 0), 0) }; });
    const modalidades = [...new Set(filtered.flatMap((row) => [row.modalidad_anterior, row.modalidad_nueva]).filter((value): value is string => Boolean(value)))].map((modalidad) => { const subset = filtered.filter((row) => row.modalidad_anterior === modalidad || row.modalidad_nueva === modalidad); return { modalidad, requeridas_antes: subset.reduce((sum, row) => sum + (row.modalidad_anterior === modalidad ? (row.requeridas_antes ?? 0) : 0), 0), requeridas_ahora: subset.reduce((sum, row) => sum + (row.modalidad_nueva === modalidad ? (row.requeridas_ahora ?? 0) : 0), 0) }; });
    const offset = (input.page - 1) * input.limit;
    const resumen = { sedes_nuevas: filtered.filter((row) => row.tipo_cambio === 'NUEVA').length, sedes_retiradas: filtered.filter((row) => row.tipo_cambio === 'RETIRADA').length, cambios_modalidad: filtered.filter((row) => row.tipo_cambio === 'MODALIDAD CAMBIÓ').length, aumentos: filtered.filter((row) => row.tipo_cambio === 'AUMENTÓ').length, disminuciones: filtered.filter((row) => row.tipo_cambio === 'DISMINUYÓ').length, manipuladoras_adicionales: filtered.reduce((sum, row) => sum + Math.max(0, row.delta_requeridas), 0), potencialmente_excedentes: filtered.reduce((sum, row) => sum + Math.max(0, -row.delta_requeridas), 0) };
    return { carga_a_id: input.carga_a_id, carga_b_id: input.carga_b_id, resumen, filas: filtered.slice(offset, offset + input.limit), pagination: { page: input.page, limit: input.limit, total: filtered.length, total_pages: Math.max(1, Math.ceil(filtered.length / input.limit)) }, graficos: { municipios, modalidades } };
  } finally { client.release(); }
};
export const createManualFocalizacionAdjustment = async (
  actorUserId: string,
  input: {
    contrato_id: number;
    fecha_fin_vigencia?: string | null;
    fecha_inicio_vigencia: string;
    focalizacion_primaria?: number | null;
    focalizacion_secundaria?: number | null;
    focalizacion_total: number;
    modalidad_id: number;
    motivo: string;
    observacion?: string | null;
    sede_id: number;
  },
  tenant?: TenantAccessContext,
  soporte?: {
    buffer: Buffer;
    mimeType: string | null;
    originalName: string;
  } | null,
): Promise<{
  cobertura_estado: string;
  cobertura_requerida: number | null;
  regla_config_id: number | null;
  vigencia_id: number;
}> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureFocalizacionSchemaReady(client);
    await ensureCoverageRulesSchemaReady(client);
    await loadContractOrThrow(client, input.contrato_id, tenant);

    const sedeResult = await client.query<
      QueryResultRow & {
        institucion_id: string;
        municipio_id: string | null;
      }
    >(
      `
        SELECT
          s.institucion_id::text AS institucion_id,
          s.municipio_id::text AS municipio_id
        FROM sedes s
        INNER JOIN instituciones i ON i.id = s.institucion_id
        WHERE s.id = $1::bigint
          AND i.contrato_id = $2::bigint
        LIMIT 1
      `,
      [input.sede_id, input.contrato_id],
    );
    const sedeRow = sedeResult.rows[0];
    if (!sedeRow) {
      throw new AppError('La sede no pertenece al contrato indicado.', 404, 'FOCALIZACION_SEDE_CONTRATO_NOT_FOUND');
    }

    const modalidadResult = await client.query<QueryResultRow>(
      `SELECT id::text AS id FROM modalidades WHERE id = $1::bigint AND COALESCE(activo, TRUE) = TRUE LIMIT 1`,
      [input.modalidad_id],
    );
    if (!modalidadResult.rows[0]?.id) {
      throw new AppError('La modalidad no existe o esta inactiva.', 404, 'FOCALIZACION_MODALIDAD_NOT_FOUND');
    }

    const supportUpload = soporte
      ? await uploadOriginalFile(soporte.buffer, soporte.mimeType ?? null, buildStoragePath(input.contrato_id, `manual-${soporte.originalName}`))
      : null;
    const sedeModalidadId = await ensureSedeModalidad(
      client,
      input.sede_id,
      input.modalidad_id,
      input.contrato_id,
      `${input.sede_id}|${input.modalidad_id}`,
    );
    const rule = await loadCoverageRuleForContext(client, {
      contratoId: input.contrato_id,
      modalidadId: input.modalidad_id,
      fechaVigencia: input.fecha_inicio_vigencia,
    });
    const coverage = rule
      ? calculateCoverageFromRule(rule, input.focalizacion_total)
      : {
          cupos_calculo: Math.max(0, input.focalizacion_total),
          manipuladores_requeridos: null,
          status: 'SIN_REGLA_COBERTURA' as const,
        };
    const previous = await loadLatestExistingVersion(client, input.contrato_id, input.sede_id, input.modalidad_id);
    const previousVersionId = await handleOverlappingVersions(client, {
      actorUserId,
      contratoId: input.contrato_id,
      modalidadId: input.modalidad_id,
      newEnd: input.fecha_fin_vigencia ?? null,
      newStart: input.fecha_inicio_vigencia,
      sedeId: input.sede_id,
    });
    const vigenciaId = await insertFocalizacionVigencia(client, {
      actorUserId,
      cargaId: null,
      contratoId: input.contrato_id,
      coberturaEstado: coverage.status,
      coberturaRequerida: coverage.manipuladores_requeridos,
      fechaFin: input.fecha_fin_vigencia ?? null,
      fechaInicio: input.fecha_inicio_vigencia,
      fechaRecepcion: new Date().toISOString().slice(0, 10),
      focalizacionPrimaria: input.focalizacion_primaria ?? null,
      focalizacionSecundaria: input.focalizacion_secundaria ?? null,
      focalizacionTotal: input.focalizacion_total,
      institucionId: toNumber(sedeRow.institucion_id),
      modalidadId: input.modalidad_id,
      motivo: input.motivo,
      municipioId: toNullableNumber(sedeRow.municipio_id),
      observacion: input.observacion ?? null,
      origin: 'MANUAL',
      preliminarId: null,
      previousVersionId: previousVersionId ?? (previous ? toNumber(previous.id) : null),
      reglaConfigId: rule?.id ?? null,
      sedeId: input.sede_id,
      soporteStorageBucket: supportUpload?.bucket ?? null,
      soporteStoragePath: supportUpload?.path ?? null,
      techoPrimaria: null,
      techoSecundaria: null,
      techoTotal: null,
    });
    await syncFocalizacionFinal(client, input.contrato_id, input.sede_id, input.modalidad_id, sedeModalidadId);

    await registerAuditEntry({
      accion: 'focalizacion.manual.create',
      after: {
        contrato_id: input.contrato_id,
        cobertura_estado: coverage.status,
        cobertura_requerida: coverage.manipuladores_requeridos,
        fecha_fin_vigencia: input.fecha_fin_vigencia ?? null,
        fecha_inicio_vigencia: input.fecha_inicio_vigencia,
        focalizacion_total: input.focalizacion_total,
        modalidad_id: input.modalidad_id,
        motivo: input.motivo,
        sede_id: input.sede_id,
        vigencia_id: vigenciaId,
      },
      client,
      descripcion: `Ajuste manual de focalizacion para sede ${input.sede_id} modalidad ${input.modalidad_id}`,
      registro_id: String(vigenciaId),
      tabla: 'focalizacion_vigencias',
      usuario_id: actorUserId,
    });

    await client.query('COMMIT');
    return {
      cobertura_estado: coverage.status,
      cobertura_requerida: coverage.manipuladores_requeridos,
      regla_config_id: rule?.id ?? null,
      vigencia_id: vigenciaId,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
