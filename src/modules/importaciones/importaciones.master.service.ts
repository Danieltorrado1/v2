import { createHash } from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';
import * as XLSX from 'xlsx';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  createPersonaWithClient,
  updatePersonaWithClient
} from '../personas/personas.service';
import {
  createPersonaCuentaBancariaWithClient,
  updatePersonaCuentaBancariaWithClient
} from '../personas/personas.master.service';
import {
  analyzeMasterImportHeaders,
  buildCanonicalIdentityKey,
  buildReportCsv,
  buildTemplateWorkbook,
  classifyBankingImportRow,
  classifyPersonalImportRow,
  mapRowWithColumnMappings,
  matchesMasterImportFilter,
  normalizeBankingMappedRow,
  normalizeComparableText,
  normalizeHeader,
  normalizeImportDocumentNumber,
  normalizePersonalMappedRow,
  validateColumnMappings,
  type BankingImportSnapshot,
  type ImportValidationIssue,
  type MasterImportAnalyzeResult,
  type MasterImportClassification,
  type MasterImportDiff,
  type MasterImportFilter,
  type MasterImportStatus,
  type MasterImportType,
  type PersonalImportSnapshot
} from './importaciones.master.domain';
import type {
  MasterImportAnalyzeInput,
  MasterImportListQuery,
  MasterImportPreviewQuery,
  MasterImportValidateInput
} from './importaciones.master.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface ContractRow extends QueryResultRow {
  id: number | string;
  empresa_id: number | string;
  empresa_nombre: string | null;
  numero_contrato: string | null;
  fecha_inicio: string | Date | null;
  fecha_finalizacion: string | Date | null;
}

interface LoteRow extends QueryResultRow {
  id: number | string;
  tipo: string;
  archivo_nombre: string;
  estado: string;
  total_filas: number;
  filas_validas: number;
  filas_con_error: number;
  resumen: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_by: number | string;
  confirmed_by: number | string | null;
  cancelado_por: number | string | null;
  created_at: Date;
  updated_at: Date;
  confirmed_at: Date | null;
  cancelado_at: Date | null;
  contrato_id: number | string | null;
  empresa_id: number | string | null;
  archivo_mime_type: string | null;
  archivo_sha256: string | null;
  archivo_bytes: Buffer | null;
}

interface StageRow extends QueryResultRow {
  id: number | string;
  lote_id: number | string;
  fila_numero: number;
  tipo: string;
  identidad_tipo_documento: string | null;
  identidad_numero_documento: string | null;
  nombre_referencia: string | null;
  data_cruda: Record<string, unknown>;
  mapping_aplicado: Record<string, string | null>;
  payload_normalizado: Record<string, unknown>;
  snapshot_actual: Record<string, unknown> | null;
  diff: MasterImportDiff[];
  errores: ImportValidationIssue[];
  advertencias: ImportValidationIssue[];
  clasificacion: MasterImportClassification;
  requiere_accion: boolean;
  procesado: boolean;
  resultado_aplicacion: string | null;
  mensaje_aplicacion: string | null;
  entidad_id: number | string | null;
  referencia_secundaria_id: number | string | null;
}

interface DocTypeRow extends QueryResultRow {
  id: number | string;
  codigo: string | null;
  nombre_documento: string;
}

interface MunicipioRow extends QueryResultRow {
  id: number | string;
  nombre_municipio: string;
}

interface PersonaLookupRow extends QueryResultRow {
  persona_id: number | string;
  tipo_documento_id: number | string;
  tipo_documento_codigo: string | null;
  tipo_documento_nombre: string | null;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | Date | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  barrio: string | null;
  municipio_residencia_nombre: string | null;
  pais_nacimiento: string | null;
}

interface BankingLookupRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
  entidad_bancaria: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  titular: string;
  nombre_titular: string | null;
  documento_titular: string | null;
  observaciones: string | null;
}

interface MasterImportLote {
  id: number;
  tipo: MasterImportType;
  estado: MasterImportStatus;
  archivo_nombre: string;
  archivo_sha256: string | null;
  total_filas: number;
  filas_validas: number;
  filas_con_error: number;
  resumen: Record<string, unknown> | null;
  contrato: {
    id: number;
    empresa_id: number;
    empresa_nombre: string | null;
    numero_contrato: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  } | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface MasterImportAnalyzeResponse {
  lote: MasterImportLote;
  analysis: MasterImportAnalyzeResult;
}

export interface MasterImportPreviewRow {
  fila: number;
  tipo_documento: string | null;
  numero_documento: string | null;
  nombre: string | null;
  clasificacion: MasterImportClassification;
  requiere_accion: boolean;
  diffs: MasterImportDiff[];
  errores: ImportValidationIssue[];
  advertencias: ImportValidationIssue[];
  entidad_id: number | null;
  referencia_secundaria_id: number | null;
  resultado_aplicacion: string | null;
  mensaje_aplicacion: string | null;
}

export interface MasterImportPreviewSummary {
  total_filas: number;
  nuevas: number;
  actualizaciones: number;
  sin_cambios: number;
  errores: number;
  posibles_duplicados: number;
}

export interface MasterImportPreviewResponse {
  lote: MasterImportLote;
  rows: MasterImportPreviewRow[];
  summary: MasterImportPreviewSummary;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    filter: MasterImportFilter;
  };
}

export interface MasterImportListResponse {
  items: MasterImportLote[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface MasterImportApplyResponse {
  lote: MasterImportLote;
  applied_rows: number;
  created_personas: number;
  updated_personas: number;
  created_bank_accounts: number;
  updated_bank_accounts: number;
  skipped_rows: number;
}

type ParsedWorkbook = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
};

const toNumber = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

const toRequiredNumber = (value: string | number | null | undefined, code = 'INVALID_NUMERIC_VALUE'): number => {
  const parsed = toNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, code);
  }

  return parsed;
};

const formatDate = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
};

const formatTimestamp = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const hasTenantContractAccess = (
  tenant: TenantAccessContext | undefined,
  contratoId: number,
  empresaId: number
): boolean => {
  if (!tenant || tenant.isGlobalAdmin) {
    return true;
  }

  if (tenant.contratoIds.length > 0) {
    return tenant.contratoIds.includes(contratoId);
  }

  return tenant.empresaIds.includes(empresaId);
};

const appendTenantScope = (
  conditions: string[],
  params: unknown[],
  tenant?: TenantAccessContext
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    conditions.push(`contrato_id = ANY($${params.length}::bigint[])`);
    return;
  }

  params.push(tenant.empresaIds);
  conditions.push(`empresa_id = ANY($${params.length}::bigint[])`);
};

const loadContractOrThrow = async (
  client: PoolClient,
  contratoId: number,
  tenant?: TenantAccessContext
): Promise<ContractRow> => {
  const result = await client.query<ContractRow>(
    `
      SELECT
        c.id,
        c.empresa_id,
        c.numero_contrato,
        c.fecha_inicio,
        c.fecha_finalizacion,
        e.nombre_empresa AS empresa_nombre
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Contrato no encontrado', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!hasTenantContractAccess(tenant, toRequiredNumber(row.id), toRequiredNumber(row.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  return row;
};

const getLoteRow = async (
  client: PoolClient,
  loteId: number,
  forUpdate = false
): Promise<LoteRow | null> => {
  const result = await client.query<LoteRow>(
    `
      SELECT
        id,
        tipo,
        archivo_nombre,
        estado,
        total_filas,
        filas_validas,
        filas_con_error,
        resumen,
        metadata,
        created_by,
        confirmed_by,
        cancelado_por,
        created_at,
        updated_at,
        confirmed_at,
        cancelado_at,
        contrato_id,
        empresa_id,
        archivo_mime_type,
        archivo_sha256,
        archivo_bytes
      FROM importacion_lotes
      WHERE id = $1::bigint
      ${forUpdate ? 'FOR UPDATE' : ''}
      LIMIT 1
    `,
    [loteId]
  );

  return result.rows[0] ?? null;
};

const mapLote = async (
  client: PoolClient,
  row: LoteRow
): Promise<MasterImportLote> => {
  const contrato =
    row.contrato_id === null
      ? null
      : await loadContractOrThrow(client, toRequiredNumber(row.contrato_id));

  return {
    id: toRequiredNumber(row.id),
    tipo: row.tipo as MasterImportType,
    estado: row.estado as MasterImportStatus,
    archivo_nombre: row.archivo_nombre,
    archivo_sha256: row.archivo_sha256,
    total_filas: row.total_filas,
    filas_validas: row.filas_validas,
    filas_con_error: row.filas_con_error,
    resumen: row.resumen,
    contrato: contrato
      ? {
          id: toRequiredNumber(contrato.id),
          empresa_id: toRequiredNumber(contrato.empresa_id),
          empresa_nombre: contrato.empresa_nombre,
          numero_contrato: contrato.numero_contrato,
          fecha_inicio: formatDate(contrato.fecha_inicio),
          fecha_finalizacion: formatDate(contrato.fecha_finalizacion)
        }
      : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    confirmed_at: formatTimestamp(row.confirmed_at)
  };
};

const parseWorkbook = (buffer: Buffer): ParsedWorkbook => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError('El archivo no contiene hojas para analizar', 400, 'IMPORT_EMPTY_WORKBOOK');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new AppError('No fue posible leer la hoja principal del archivo', 400, 'IMPORT_WORKSHEET_NOT_FOUND');
  }
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: null
  });

  const [headerRow, ...dataRows] = matrix;
  const headers = (headerRow ?? [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);

  if (headers.length === 0) {
    throw new AppError('No se detectaron encabezados en la primera fila del archivo', 400, 'IMPORT_HEADERS_REQUIRED');
  }

  const rows = dataRows
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? null;
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value !== null && String(value).trim() !== ''));

  return { headers, rows };
};

const loadDocTypes = async (client: PoolClient): Promise<Map<string, { id: number; code: string | null; name: string }>> => {
  const result = await client.query<DocTypeRow>(
    `
      SELECT id, codigo, nombre_documento
      FROM tipos_documentos
      WHERE COALESCE(es_identificacion_personal, FALSE) = TRUE
      ORDER BY nombre_documento ASC, id ASC
    `
  );

  const map = new Map<string, { id: number; code: string | null; name: string }>();
  for (const row of result.rows) {
    const value = { id: toRequiredNumber(row.id), code: row.codigo, name: row.nombre_documento };
    if (row.codigo) {
      map.set(normalizeComparableText(row.codigo), value);
    }
    map.set(normalizeComparableText(row.nombre_documento), value);
  }
  return map;
};

const loadMunicipios = async (client: PoolClient): Promise<Map<string, { id: number; name: string }>> => {
  const result = await client.query<MunicipioRow>(
    `
      SELECT id, nombre_municipio
      FROM municipios
      ORDER BY nombre_municipio ASC
    `
  );

  return new Map(
    result.rows.map((row) => [
      normalizeComparableText(row.nombre_municipio),
      { id: toRequiredNumber(row.id), name: row.nombre_municipio }
    ])
  );
};

const findPersonaSnapshotByIdentity = async (
  client: PoolClient,
  docTypeCode: string | null,
  documentNumber: string | null
): Promise<PersonalImportSnapshot | null> => {
  if (!docTypeCode || !documentNumber) {
    return null;
  }

  const result = await client.query<PersonaLookupRow>(
    `
      SELECT
        p.id AS persona_id,
        td.id AS tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        pi.numero_documento,
        p.primer_nombre,
        p.segundo_nombre,
        p.primer_apellido,
        p.segundo_apellido,
        p.fecha_nacimiento,
        p.telefono,
        p.correo,
        p.direccion,
        p.barrio,
        mu.nombre_municipio AS municipio_residencia_nombre,
        p.pais_nacimiento
      FROM persona_identificaciones pi
      INNER JOIN personas p ON p.id = pi.persona_id
      INNER JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
      LEFT JOIN municipios mu ON mu.id = p.municipio_residencia_id
      WHERE pi.es_vigente = TRUE
        AND pi.numero_documento = $1
        AND (
          LOWER(COALESCE(td.codigo, '')) = $2
          OR LOWER(td.nombre_documento) = $2
        )
      ORDER BY pi.vigente_desde DESC NULLS LAST, pi.id DESC
      LIMIT 1
    `,
    [normalizeImportDocumentNumber(documentNumber), normalizeComparableText(docTypeCode)]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    persona_id: toRequiredNumber(row.persona_id),
    tipo_documento: row.tipo_documento_codigo ?? row.tipo_documento_nombre,
    numero_documento: row.numero_documento,
    primer_nombre: row.primer_nombre,
    segundo_nombre: row.segundo_nombre,
    primer_apellido: row.primer_apellido,
    segundo_apellido: row.segundo_apellido,
    fecha_nacimiento: formatDate(row.fecha_nacimiento),
    telefono: row.telefono,
    correo: row.correo,
    direccion: row.direccion,
    barrio: row.barrio,
    municipio_residencia: row.municipio_residencia_nombre,
    pais_nacimiento: row.pais_nacimiento
  };
};

const findCurrentBankingSnapshot = async (
  client: PoolClient,
  personaId: number
): Promise<BankingImportSnapshot | null> => {
  const result = await client.query<BankingLookupRow>(
    `
      SELECT
        id,
        persona_id,
        entidad_bancaria,
        tipo_cuenta,
        numero_cuenta,
        titular,
        nombre_titular,
        documento_titular,
        observaciones
      FROM persona_cuentas_bancarias
      WHERE persona_id = $1::bigint
      ORDER BY es_vigente DESC, vigencia_desde DESC, id DESC
      LIMIT 1
    `,
    [personaId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    persona_id: toRequiredNumber(row.persona_id),
    cuenta_bancaria_id: toRequiredNumber(row.id),
    tipo_documento: null,
    numero_documento: null,
    entidad_bancaria: row.entidad_bancaria,
    tipo_cuenta: row.tipo_cuenta,
    numero_cuenta: row.numero_cuenta,
    titular: row.titular,
    nombre_titular: row.nombre_titular,
    documento_titular: row.documento_titular,
    observacion: row.observaciones
  };
};

const buildSummary = (
  classifications: MasterImportClassification[]
): MasterImportPreviewSummary => ({
  total_filas: classifications.length,
  nuevas: classifications.filter((item) => item === 'NUEVA' || item === 'CUENTA_NUEVA').length,
  actualizaciones: classifications.filter((item) => item === 'ACTUALIZACION' || item === 'CAMBIO_CUENTA').length,
  sin_cambios: classifications.filter((item) => item === 'SIN_CAMBIOS').length,
  errores: classifications.filter((item) => item === 'ERROR').length,
  posibles_duplicados: classifications.filter((item) => item === 'POSIBLE_DUPLICADO').length
});

const loadStagedRows = async (
  client: PoolClient,
  loteId: number
): Promise<StageRow[]> => {
  const result = await client.query<StageRow>(
    `
      SELECT
        id,
        lote_id,
        fila_numero,
        tipo,
        identidad_tipo_documento,
        identidad_numero_documento,
        nombre_referencia,
        data_cruda,
        mapping_aplicado,
        payload_normalizado,
        snapshot_actual,
        diff,
        errores,
        advertencias,
        clasificacion,
        requiere_accion,
        procesado,
        resultado_aplicacion,
        mensaje_aplicacion,
        entidad_id,
        referencia_secundaria_id
      FROM importacion_staging_maestro
      WHERE lote_id = $1::bigint
      ORDER BY fila_numero ASC
    `,
    [loteId]
  );

  return result.rows;
};

const mapPreviewRows = (rows: StageRow[]): MasterImportPreviewRow[] =>
  rows.map((row) => ({
    fila: row.fila_numero,
    tipo_documento: row.identidad_tipo_documento,
    numero_documento: row.identidad_numero_documento,
    nombre: row.nombre_referencia,
    clasificacion: row.clasificacion,
    requiere_accion: row.requiere_accion,
    diffs: row.diff ?? [],
    errores: row.errores ?? [],
    advertencias: row.advertencias ?? [],
    entidad_id: toNumber(row.entidad_id),
    referencia_secundaria_id: toNumber(row.referencia_secundaria_id),
    resultado_aplicacion: row.resultado_aplicacion,
    mensaje_aplicacion: row.mensaje_aplicacion
  }));

const buildDuplicateSet = (
  rows: Array<{ tipo_documento: string | null; numero_documento: string | null }>
): Set<number> => {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = buildCanonicalIdentityKey(row.tipo_documento, row.numero_documento);
    if (!key) {
      return;
    }
    const current = groups.get(key) ?? [];
    current.push(index);
    groups.set(key, current);
  });

  const duplicates = new Set<number>();
  groups.forEach((indices) => {
    if (indices.length > 1) {
      indices.forEach((index) => duplicates.add(index));
    }
  });
  return duplicates;
};

const buildAuditMeta = (
  metadata: Record<string, unknown> | null,
  entry: Record<string, unknown>
): Record<string, unknown> => ({
  ...(metadata ?? {}),
  audit_trail: [...(Array.isArray(metadata?.audit_trail) ? metadata.audit_trail : []), entry]
});

export const downloadMasterImportTemplate = (type: MasterImportType): { buffer: Buffer; fileName: string } => ({
  buffer: buildTemplateWorkbook(type),
  fileName: type === 'DATOS_PERSONALES' ? 'plantilla-datos-personales.xlsx' : 'plantilla-informacion-bancaria.xlsx'
});

export const analyzeMasterImportFile = async (
  fileBuffer: Buffer,
  fileOriginalName: string,
  fileMimeType: string | null,
  actorUserId: string,
  input: MasterImportAnalyzeInput,
  tenant?: TenantAccessContext
): Promise<MasterImportAnalyzeResponse> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const contrato = await loadContractOrThrow(client, input.contrato_id, tenant);
    const parsed = parseWorkbook(fileBuffer);
    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
    const analysis = analyzeMasterImportHeaders(parsed.headers, parsed.rows.length, input.tipo);
    const loteInsert = await client.query<LoteRow>(
      `
        INSERT INTO importacion_lotes (
          tipo,
          archivo_nombre,
          estado,
          total_filas,
          filas_validas,
          filas_con_error,
          resumen,
          metadata,
          created_by,
          contrato_id,
          empresa_id,
          archivo_mime_type,
          archivo_sha256,
          archivo_bytes
        )
        VALUES (
          $1,
          $2,
          'PREPARADO',
          $3::int,
          0,
          0,
          '{}'::jsonb,
          $4::jsonb,
          $5::bigint,
          $6::bigint,
          $7::bigint,
          $8,
          $9,
          $10
        )
        RETURNING
          id,
          tipo,
          archivo_nombre,
          estado,
          total_filas,
          filas_validas,
          filas_con_error,
          resumen,
          metadata,
          created_by,
          confirmed_by,
          cancelado_por,
          created_at,
          updated_at,
          confirmed_at,
          cancelado_at,
          contrato_id,
          empresa_id,
          archivo_mime_type,
          archivo_sha256,
          archivo_bytes
      `,
      [
        input.tipo,
        fileOriginalName,
        parsed.rows.length,
        JSON.stringify({
          contrato_id: input.contrato_id,
          analysis,
          detected_headers_normalized: parsed.headers.map(normalizeHeader)
        }),
        Number(actorUserId),
        toRequiredNumber(contrato.id),
        toRequiredNumber(contrato.empresa_id),
        fileMimeType,
        sha256,
        fileBuffer
      ]
    );

    const lote = loteInsert.rows[0];
    if (!lote) {
      throw new AppError('No fue posible crear el lote de importacion', 500, 'MASTER_IMPORT_LOTE_CREATE_FAILED');
    }

    await registerAuditEntry({
      client,
      accion: 'IMPORTACION_MAESTRA_ANALIZAR',
      tabla: 'importacion_lotes',
      registro_id: String(lote.id),
      descripcion: 'Analisis inicial de archivo para importacion maestra',
      usuario_id: actorUserId,
      after: {
        lote_id: toRequiredNumber(lote.id),
        tipo: input.tipo,
        archivo_nombre: fileOriginalName,
        archivo_sha256: sha256
      }
    });

    await client.query('COMMIT');
    return {
      lote: await mapLote(client, lote),
      analysis
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const validateMasterImportLote = async (
  loteId: number,
  actorUserId: string,
  input: MasterImportValidateInput,
  tenant?: TenantAccessContext
): Promise<MasterImportPreviewResponse> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const lote = await getLoteRow(client, loteId, true);
    if (!lote) {
      throw new AppError('Lote no encontrado', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
    }
    if (lote.estado === 'APLICADO') {
      throw new AppError('Un lote aplicado no puede revalidarse', 409, 'MASTER_IMPORT_ALREADY_APPLIED');
    }
    if (!lote.archivo_bytes) {
      throw new AppError('El lote no conserva el archivo original para validar', 409, 'MASTER_IMPORT_FILE_MISSING');
    }

    if (lote.contrato_id) {
      await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    }

    const parsed = parseWorkbook(lote.archivo_bytes);
    const mappingIssues = validateColumnMappings(
      lote.tipo as MasterImportType,
      parsed.headers,
      input.column_mappings as Record<string, string | null>
    );
    if (mappingIssues.length > 0) {
      throw new AppError(
        mappingIssues.map((issue) => issue.message).join(' | '),
        400,
        'MASTER_IMPORT_INVALID_MAPPING'
      );
    }

    await client.query(`DELETE FROM importacion_staging_maestro WHERE lote_id = $1::bigint`, [loteId]);

    const docTypes = await loadDocTypes(client);
    const municipios = await loadMunicipios(client);

    const normalizedRows = parsed.rows.map((row) => {
      const mapped = mapRowWithColumnMappings(
        row,
        input.column_mappings as Record<string, string | null>
      );
      return lote.tipo === 'DATOS_PERSONALES'
        ? normalizePersonalMappedRow(mapped)
        : normalizeBankingMappedRow(mapped);
    });

    const duplicateIndexes = buildDuplicateSet(
      normalizedRows.map((row) => ({
        tipo_documento: row.tipo_documento,
        numero_documento: row.numero_documento
      }))
    );

    const classifications: MasterImportClassification[] = [];

    for (let index = 0; index < parsed.rows.length; index += 1) {
      const rawRow = parsed.rows[index] ?? {};
      const normalizedBase = normalizedRows[index];
      if (!normalizedBase) {
        continue;
      }
      const duplicateInFile = duplicateIndexes.has(index);
      const rowNumber = index + 2;

      if (lote.tipo === 'DATOS_PERSONALES') {
        const normalized = normalizedBase as PersonalImportSnapshot;
        const current = await findPersonaSnapshotByIdentity(
          client,
          normalized.tipo_documento,
          normalized.numero_documento
        );

        const result = classifyPersonalImportRow(normalized, current, duplicateInFile);
        const municipalityValue = normalizeComparableText(normalized.municipio_residencia);
        if (normalized.municipio_residencia && municipalityValue && !municipios.has(municipalityValue)) {
          result.errors.push({
            field: 'municipio_residencia',
            code: 'MUNICIPIO_NOT_FOUND',
            message: `No existe un municipio exacto para ${normalized.municipio_residencia}.`,
            severity: 'ERROR'
          });
          result.classification = 'ERROR';
          result.requires_apply = false;
        }

        const documentTypeValue = normalized.tipo_documento
          ? docTypes.get(normalizeComparableText(normalized.tipo_documento))
          : null;
        if (normalized.tipo_documento && !documentTypeValue) {
          result.errors.push({
            field: 'tipo_documento',
            code: 'DOCUMENT_TYPE_NOT_FOUND',
            message: `No existe un tipo documental vigente para ${normalized.tipo_documento}.`,
            severity: 'ERROR'
          });
          result.classification = 'ERROR';
          result.requires_apply = false;
        }

        classifications.push(result.classification);
        await client.query(
          `
            INSERT INTO importacion_staging_maestro (
              lote_id,
              fila_numero,
              tipo,
              identidad_tipo_documento,
              identidad_numero_documento,
              nombre_referencia,
              data_cruda,
              mapping_aplicado,
              payload_normalizado,
              snapshot_actual,
              diff,
              errores,
              advertencias,
              clasificacion,
              requiere_accion,
              procesado,
              entidad_id,
              referencia_secundaria_id
            )
            VALUES (
              $1::bigint,
              $2::int,
              $3,
              $4,
              $5,
              $6,
              $7::jsonb,
              $8::jsonb,
              $9::jsonb,
              $10::jsonb,
              $11::jsonb,
              $12::jsonb,
              $13::jsonb,
              $14,
              $15,
              FALSE,
              $16::bigint,
              NULL
            )
          `,
          [
            loteId,
            rowNumber,
            lote.tipo,
            result.normalized.tipo_documento,
            result.normalized.numero_documento,
            result.name,
            JSON.stringify(rawRow),
            JSON.stringify(input.column_mappings),
            JSON.stringify(result.normalized),
            JSON.stringify(current),
            JSON.stringify(result.diffs),
            JSON.stringify(result.errors),
            JSON.stringify(result.warnings),
            result.classification,
            result.requires_apply,
            current?.persona_id ?? null
          ]
        );
      } else {
        const normalized = normalizedBase as BankingImportSnapshot;
        const currentPersona = await findPersonaSnapshotByIdentity(
          client,
          normalized.tipo_documento,
          normalized.numero_documento
        );
        const currentBanking = currentPersona?.persona_id
          ? await findCurrentBankingSnapshot(client, currentPersona.persona_id)
          : null;
        const result = classifyBankingImportRow(
          normalized,
          currentBanking,
          duplicateInFile,
          Boolean(currentPersona)
        );

        if (
          normalized.tipo_documento &&
          !docTypes.has(normalizeComparableText(normalized.tipo_documento))
        ) {
          result.errors.push({
            field: 'tipo_documento',
            code: 'DOCUMENT_TYPE_NOT_FOUND',
            message: `No existe un tipo documental vigente para ${normalized.tipo_documento}.`,
            severity: 'ERROR'
          });
          result.classification = 'ERROR';
          result.requires_apply = false;
        }

        classifications.push(result.classification);
        await client.query(
          `
            INSERT INTO importacion_staging_maestro (
              lote_id,
              fila_numero,
              tipo,
              identidad_tipo_documento,
              identidad_numero_documento,
              nombre_referencia,
              data_cruda,
              mapping_aplicado,
              payload_normalizado,
              snapshot_actual,
              diff,
              errores,
              advertencias,
              clasificacion,
              requiere_accion,
              procesado,
              entidad_id,
              referencia_secundaria_id
            )
            VALUES (
              $1::bigint,
              $2::int,
              $3,
              $4,
              $5,
              $6,
              $7::jsonb,
              $8::jsonb,
              $9::jsonb,
              $10::jsonb,
              $11::jsonb,
              $12::jsonb,
              $13::jsonb,
              $14,
              $15,
              FALSE,
              $16::bigint,
              $17::bigint
            )
          `,
          [
            loteId,
            rowNumber,
            lote.tipo,
            result.normalized.tipo_documento,
            result.normalized.numero_documento,
            normalizeComparableText(String(rawRow.NOMBRE ?? rawRow.Nombre ?? '')) ? String(rawRow.NOMBRE ?? rawRow.Nombre) : null,
            JSON.stringify(rawRow),
            JSON.stringify(input.column_mappings),
            JSON.stringify(result.normalized),
            JSON.stringify(currentBanking),
            JSON.stringify(result.diffs),
            JSON.stringify(result.errors),
            JSON.stringify(result.warnings),
            result.classification,
            result.requires_apply,
            currentPersona?.persona_id ?? null,
            currentBanking?.cuenta_bancaria_id ?? null
          ]
        );
      }
    }

    const summary = buildSummary(classifications);
    const nextStatus: MasterImportStatus =
      summary.errores === summary.total_filas ? 'ERROR' : 'VALIDADO';

    await client.query(
      `
        UPDATE importacion_lotes
        SET
          estado = $2,
          total_filas = $3::int,
          filas_validas = $4::int,
          filas_con_error = $5::int,
          resumen = $6::jsonb,
          metadata = $7::jsonb,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [
        loteId,
        nextStatus,
        summary.total_filas,
        summary.nuevas + summary.actualizaciones,
        summary.errores + summary.posibles_duplicados,
        JSON.stringify(summary),
        JSON.stringify(
          buildAuditMeta(lote.metadata, {
            action: 'VALIDATE',
            actor_user_id: Number(actorUserId),
            at: new Date().toISOString(),
            mappings: input.column_mappings,
            summary
          })
        )
      ]
    );

    await registerAuditEntry({
      client,
      accion: 'IMPORTACION_MAESTRA_VALIDAR',
      tabla: 'importacion_lotes',
      registro_id: String(loteId),
      descripcion: 'Validacion y dry-run de lote maestro',
      usuario_id: actorUserId,
      after: {
        lote_id: loteId,
        summary
      }
    });

    const saved = await getLoteRow(client, loteId);
    if (!saved) {
      throw new AppError('No fue posible recargar el lote validado', 500, 'MASTER_IMPORT_LOTE_RELOAD_FAILED');
    }

    const stagedRows = mapPreviewRows(await loadStagedRows(client, loteId));
    await client.query('COMMIT');
    const filteredRows = stagedRows.filter((row) => matchesMasterImportFilter(row.clasificacion, 'TODOS'));
    return {
      lote: await mapLote(client, saved),
      rows: filteredRows.slice(0, 100),
      summary,
      pagination: {
        page: 1,
        limit: 100,
        total: filteredRows.length,
        total_pages: filteredRows.length === 0 ? 0 : Math.ceil(filteredRows.length / 100),
        filter: 'TODOS'
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listMasterImportLotes = async (
  query: MasterImportListQuery,
  tenant?: TenantAccessContext
): Promise<MasterImportListResponse> => {
  const conditions: string[] = [
    `tipo IN ('DATOS_PERSONALES', 'INFORMACION_BANCARIA')`
  ];
  const params: unknown[] = [];
  appendTenantScope(conditions, params, tenant);

  if (query.tipo) {
    params.push(query.tipo);
    conditions.push(`tipo = $${params.length}`);
  }

  if (query.estado) {
    params.push(query.estado);
    conditions.push(`estado = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (query.page - 1) * query.limit;
  const total = (
    await dbQuery<CountRow>(`SELECT COUNT(*)::int AS total FROM importacion_lotes ${whereClause}`, params)
  ).rows[0]?.total ?? 0;
  const result = await dbQuery<LoteRow>(
    `
      SELECT
        id,
        tipo,
        archivo_nombre,
        estado,
        total_filas,
        filas_validas,
        filas_con_error,
        resumen,
        metadata,
        created_by,
        confirmed_by,
        cancelado_por,
        created_at,
        updated_at,
        confirmed_at,
        cancelado_at,
        contrato_id,
        empresa_id,
        archivo_mime_type,
        archivo_sha256,
        archivo_bytes
      FROM importacion_lotes
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}::int
      OFFSET $${params.length + 2}::int
    `,
    [...params, query.limit, offset]
  );

  const client = await dbPool.connect();
  try {
    return {
      items: await Promise.all(result.rows.map((row) => mapLote(client, row))),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / query.limit)
      }
    };
  } finally {
    client.release();
  }
};

export const getMasterImportLote = async (
  loteId: number,
  tenant?: TenantAccessContext
): Promise<MasterImportLote | null> => {
  const client = await dbPool.connect();
  try {
    const lote = await getLoteRow(client, loteId);
    if (!lote) {
      return null;
    }

    if (lote.contrato_id) {
      await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    }

    return mapLote(client, lote);
  } finally {
    client.release();
  }
};

export const getMasterImportPreview = async (
  loteId: number,
  query: MasterImportPreviewQuery,
  tenant?: TenantAccessContext
): Promise<MasterImportPreviewResponse> => {
  const client = await dbPool.connect();

  try {
    const lote = await getLoteRow(client, loteId);
    if (!lote) {
      throw new AppError('Lote no encontrado', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
    }

    if (lote.contrato_id) {
      await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    }

    const previewRows = mapPreviewRows(await loadStagedRows(client, loteId));
    const filteredRows = previewRows.filter((row) =>
      matchesMasterImportFilter(row.clasificacion, query.filter)
    );
    const offset = (query.page - 1) * query.limit;
    const classifications = previewRows.map((row) => row.clasificacion);

    return {
      lote: await mapLote(client, lote),
      rows: filteredRows.slice(offset, offset + query.limit),
      summary: buildSummary(classifications),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filteredRows.length,
        total_pages: filteredRows.length === 0 ? 0 : Math.ceil(filteredRows.length / query.limit),
        filter: query.filter
      }
    };
  } finally {
    client.release();
  }
};

export const downloadMasterImportReport = async (
  loteId: number,
  tenant?: TenantAccessContext
): Promise<{ content: string; fileName: string }> => {
  const preview = await getMasterImportPreview(
    loteId,
    { page: 1, limit: 50000, filter: 'TODOS' },
    tenant
  );

  return {
    content: buildReportCsv(
      preview.rows.map((row) => ({
        fila: row.fila,
        documento: row.numero_documento,
        nombre: row.nombre,
        resultado: row.clasificacion,
        diffs: row.diffs,
        errors: row.errores
      }))
    ),
    fileName: `importacion-maestra-${loteId}.csv`
  };
};

const buildPersonaUpdatePayload = (
  row: PersonalImportSnapshot,
  municipios: Map<string, { id: number; name: string }>,
  loteId: number,
  fila: number
) => {
  const payload: Record<string, unknown> = {
    motivo_cambio: `Importacion maestra lote ${loteId} fila ${fila}`
  };

  if (row.primer_nombre) payload.primer_nombre = row.primer_nombre;
  if (row.segundo_nombre) payload.segundo_nombre = row.segundo_nombre;
  if (row.primer_apellido) payload.primer_apellido = row.primer_apellido;
  if (row.segundo_apellido) payload.segundo_apellido = row.segundo_apellido;
  if (row.fecha_nacimiento) payload.fecha_nacimiento = row.fecha_nacimiento;
  if (row.telefono) payload.telefono = row.telefono;
  if (row.correo) payload.correo = row.correo;
  if (row.direccion) payload.direccion = row.direccion;
  if (row.barrio) payload.barrio = row.barrio;
  if (row.pais_nacimiento) payload.pais_nacimiento = row.pais_nacimiento;
  if (row.municipio_residencia) {
    const municipality = municipios.get(normalizeComparableText(row.municipio_residencia));
    if (municipality) {
      payload.municipio_residencia_id = municipality.id;
    }
  }

  return payload;
};

export const applyMasterImportLote = async (
  loteId: number,
  actorUserId: string,
  tenant?: TenantAccessContext
): Promise<MasterImportApplyResponse> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const lote = await getLoteRow(client, loteId, true);
    if (!lote) {
      throw new AppError('Lote no encontrado', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
    }
    if (lote.contrato_id) {
      await loadContractOrThrow(client, toRequiredNumber(lote.contrato_id), tenant);
    }

    if (lote.estado === 'APLICADO') {
      const saved = await mapLote(client, lote);
      const confirmSummary = lote.resumen?.confirmacion as Record<string, unknown> | undefined;
      await client.query('COMMIT');
      return {
        lote: saved,
        applied_rows: Number(confirmSummary?.applied_rows ?? 0),
        created_personas: Number(confirmSummary?.created_personas ?? 0),
        updated_personas: Number(confirmSummary?.updated_personas ?? 0),
        created_bank_accounts: Number(confirmSummary?.created_bank_accounts ?? 0),
        updated_bank_accounts: Number(confirmSummary?.updated_bank_accounts ?? 0),
        skipped_rows: Number(confirmSummary?.skipped_rows ?? 0)
      };
    }

    const stagedRows = await loadStagedRows(client, loteId);
    const actionable = stagedRows.filter((row) => row.requiere_accion);
    if (actionable.length === 0) {
      throw new AppError('El lote no tiene filas aplicables', 409, 'MASTER_IMPORT_WITHOUT_ACTIONABLE_ROWS');
    }

    const municipios = await loadMunicipios(client);
    let createdPersonas = 0;
    let updatedPersonas = 0;
    let createdBankAccounts = 0;
    let updatedBankAccounts = 0;
    let skippedRows = 0;

    for (const row of stagedRows) {
      if (!row.requiere_accion) {
        skippedRows += 1;
        await client.query(
          `
            UPDATE importacion_staging_maestro
            SET
              procesado = TRUE,
              resultado_aplicacion = $3,
              mensaje_aplicacion = $4,
              updated_at = NOW()
            WHERE lote_id = $1::bigint
              AND fila_numero = $2::int
          `,
          [loteId, row.fila_numero, 'OMITIDA', 'Fila sin cambios aplicables']
        );
        continue;
      }

      if (row.tipo === 'DATOS_PERSONALES') {
        const payload = row.payload_normalizado as unknown as PersonalImportSnapshot;
        if (row.clasificacion === 'NUEVA') {
          const created = await createPersonaWithClient(
            client,
            {
              tipo_documento_id: toRequiredNumber(
                (
                  await client.query<DocTypeRow>(
                    `
                      SELECT id, codigo, nombre_documento
                      FROM tipos_documentos
                      WHERE LOWER(COALESCE(codigo, '')) = $1
                         OR LOWER(nombre_documento) = $1
                      LIMIT 1
                    `,
                    [normalizeComparableText(payload.tipo_documento)]
                  )
                ).rows[0]?.id ?? null,
                'MASTER_IMPORT_DOCUMENT_TYPE_REQUIRED'
              ),
              numero_documento: payload.numero_documento ?? '',
              primer_nombre: payload.primer_nombre ?? '',
              segundo_nombre: payload.segundo_nombre,
              primer_apellido: payload.primer_apellido ?? '',
              segundo_apellido: payload.segundo_apellido,
              fecha_nacimiento: payload.fecha_nacimiento,
              municipio_nacimiento_id: null,
              municipio_residencia_id: payload.municipio_residencia
                ? municipios.get(normalizeComparableText(payload.municipio_residencia))?.id ?? null
                : null,
              sexo_id: null,
              estado_civil_id: null,
              tipo_sangre_id: null,
              estatura: null,
              telefono: payload.telefono,
              correo: payload.correo,
              direccion: payload.direccion,
              barrio: payload.barrio,
              zona_id: null,
              pais_nacimiento: payload.pais_nacimiento,
              nacimiento_extranjero: false,
              ciudad_nacimiento_extranjero: null,
              fecha_expedicion_documento: null,
              motivo_cambio_identificacion: `Importacion maestra lote ${loteId} fila ${row.fila_numero}`,
              municipio_expedicion_id: null
            },
            { actorUserId }
          );

          createdPersonas += 1;
          await client.query(
            `
              UPDATE importacion_staging_maestro
              SET
                procesado = TRUE,
                entidad_id = $3::bigint,
                resultado_aplicacion = 'CREADA',
                mensaje_aplicacion = $4,
                updated_at = NOW()
              WHERE lote_id = $1::bigint
                AND fila_numero = $2::int
            `,
            [loteId, row.fila_numero, created.id, `Persona creada #${created.id}`]
          );
          continue;
        }

        if (row.clasificacion === 'ACTUALIZACION') {
          const personaId = toRequiredNumber(row.entidad_id, 'MASTER_IMPORT_PERSON_REQUIRED');
          await updatePersonaWithClient(
            client,
            String(personaId),
            buildPersonaUpdatePayload(payload, municipios, loteId, row.fila_numero),
            {
              actorUserId,
              reason: `Importacion maestra lote ${loteId} fila ${row.fila_numero}`
            },
            tenant
          );
          updatedPersonas += 1;
          await client.query(
            `
              UPDATE importacion_staging_maestro
              SET
                procesado = TRUE,
                resultado_aplicacion = 'ACTUALIZADA',
                mensaje_aplicacion = $3,
                updated_at = NOW()
              WHERE lote_id = $1::bigint
                AND fila_numero = $2::int
            `,
            [loteId, row.fila_numero, `Persona actualizada #${personaId}`]
          );
        }
        continue;
      }

      const payload = row.payload_normalizado as unknown as BankingImportSnapshot;
      const personaId = toRequiredNumber(row.entidad_id, 'MASTER_IMPORT_PERSON_REQUIRED');

      if (row.clasificacion === 'CUENTA_NUEVA') {
        const createdAccount = await createPersonaCuentaBancariaWithClient(
          client,
          personaId,
          {
            entidad_bancaria: payload.entidad_bancaria ?? '',
            tipo_cuenta: (payload.tipo_cuenta ?? 'AHORROS') as 'AHORROS' | 'CORRIENTE' | 'OTRA',
            numero_cuenta: payload.numero_cuenta ?? '',
            titular: payload.titular ?? 'PERSONA',
            nombre_titular: payload.nombre_titular,
            documento_titular: payload.documento_titular,
            estado: 'PENDIENTE',
            fecha_verificacion: null,
            observaciones: payload.observacion,
            soporte_documento_persona_id: null,
            vigencia_desde: null,
            motivo_cambio: `Importacion maestra lote ${loteId} fila ${row.fila_numero}`,
            marcar_como_vigente: true
          },
          { actorUserId },
          tenant
        );
        createdBankAccounts += 1;
        await client.query(
          `
            UPDATE importacion_staging_maestro
            SET
              procesado = TRUE,
              referencia_secundaria_id = $3::bigint,
              resultado_aplicacion = 'CUENTA_CREADA',
              mensaje_aplicacion = $4,
              updated_at = NOW()
            WHERE lote_id = $1::bigint
              AND fila_numero = $2::int
          `,
          [loteId, row.fila_numero, createdAccount.id, `Cuenta bancaria creada #${createdAccount.id}`]
        );
        continue;
      }

      if (row.clasificacion === 'CAMBIO_CUENTA') {
        const cuentaId = toRequiredNumber(
          row.referencia_secundaria_id,
          'MASTER_IMPORT_BANK_ACCOUNT_REQUIRED'
        );
        const updatedAccount = await updatePersonaCuentaBancariaWithClient(
          client,
          personaId,
          cuentaId,
          {
            entidad_bancaria: payload.entidad_bancaria ?? undefined,
            tipo_cuenta: payload.tipo_cuenta as 'AHORROS' | 'CORRIENTE' | 'OTRA' | undefined,
            numero_cuenta: payload.numero_cuenta ?? undefined,
            titular: payload.titular ?? undefined,
            nombre_titular: payload.nombre_titular,
            documento_titular: payload.documento_titular,
            observaciones: payload.observacion,
            motivo_cambio: `Importacion maestra lote ${loteId} fila ${row.fila_numero}`
          },
          { actorUserId },
          tenant
        );
        updatedBankAccounts += 1;
        await client.query(
          `
            UPDATE importacion_staging_maestro
            SET
              procesado = TRUE,
              referencia_secundaria_id = $3::bigint,
              resultado_aplicacion = 'CUENTA_ACTUALIZADA',
              mensaje_aplicacion = $4,
              updated_at = NOW()
            WHERE lote_id = $1::bigint
              AND fila_numero = $2::int
          `,
          [loteId, row.fila_numero, updatedAccount.id, `Cuenta bancaria actualizada #${updatedAccount.id}`]
        );
      }
    }

    const rows = mapPreviewRows(await loadStagedRows(client, loteId));
    const summary = buildSummary(rows.map((item) => item.clasificacion));
    const confirmacion = {
      applied_rows: createdPersonas + updatedPersonas + createdBankAccounts + updatedBankAccounts,
      created_personas: createdPersonas,
      updated_personas: updatedPersonas,
      created_bank_accounts: createdBankAccounts,
      updated_bank_accounts: updatedBankAccounts,
      skipped_rows: skippedRows
    };

    await client.query(
      `
        UPDATE importacion_lotes
        SET
          estado = 'APLICADO',
          confirmed_by = $2::bigint,
          confirmed_at = NOW(),
          resumen = $3::jsonb,
          metadata = $4::jsonb,
          updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [
        loteId,
        Number(actorUserId),
        JSON.stringify({ ...summary, confirmacion }),
        JSON.stringify(
          buildAuditMeta(lote.metadata, {
            action: 'APPLY',
            actor_user_id: Number(actorUserId),
            at: new Date().toISOString(),
            confirmacion
          })
        )
      ]
    );

    await registerAuditEntry({
      client,
      accion: 'IMPORTACION_MAESTRA_APLICAR',
      tabla: 'importacion_lotes',
      registro_id: String(loteId),
      descripcion: 'Aplicacion transaccional de importacion maestra',
      usuario_id: actorUserId,
      after: {
        lote_id: loteId,
        confirmacion
      }
    });

    const saved = await getLoteRow(client, loteId);
    if (!saved) {
      throw new AppError('No fue posible recargar el lote aplicado', 500, 'MASTER_IMPORT_LOTE_RELOAD_FAILED');
    }

    await client.query('COMMIT');
    return {
      lote: await mapLote(client, saved),
      ...confirmacion
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
