import type { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEvent } from '../auditoria/auditoria.service';
import type {
  RepositorioDocumentosExportQuery,
  RepositorioDocumentosIndicadoresQuery,
  RepositorioDocumentosQuery
} from './repositorioDocumental.schemas';
import type {
  EstadoDocumental,
  RepositorioAuditMeta,
  RepositorioContratoResumen,
  RepositorioDocumento,
  RepositorioDocumentoDetalle,
  RepositorioDocumentosExportResult,
  RepositorioDocumentosIndicadoresResult,
  RepositorioDocumentosListResult,
  RepositorioDocumentosVersionesResult,
  RepositorioDownloadUrlResult,
  RepositorioEmpresaResumen,
  RepositorioOrigen,
  RepositorioPersonaResumen
} from './repositorioDocumental.types';

interface CountRow extends QueryResultRow {
  total: number;
}

interface AlertasIndicadoresRow extends QueryResultRow {
  alertas_criticas: number;
  total_alertas_activas: number;
}

interface UnifiedDocumentRow extends QueryResultRow {
  activo_origen: boolean;
  archivo_path: string | null;
  contenido_generado: string | null;
  contrato_entidad_contratante: string | null;
  contrato_fecha_finalizacion: Date | string | null;
  contrato_fecha_inicio: Date | string | null;
  contrato_id: string | null;
  contrato_numero_contrato: string | null;
  contrato_numero_licitacion: string | null;
  contrato_objeto_contractual: string | null;
  documento_id: string;
  documento_reemplaza_id: string | null;
  empresa_ciudad: string | null;
  empresa_correo: string | null;
  empresa_id: string | null;
  empresa_nit: string | null;
  empresa_nombre_empresa: string | null;
  empresa_representante_legal: string | null;
  empresa_telefono: string | null;
  empresa_tipo_empresa: string | null;
  es_vigente: boolean | null;
  estado_documental: EstadoDocumental;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_generacion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  generado_por: string | null;
  mime_type: string | null;
  nombre_archivo: string | null;
  nombre_tipo_documento: string | null;
  origen: RepositorioOrigen;
  persona_id: string | null;
  persona_numero_documento: string | null;
  persona_primer_apellido: string | null;
  persona_primer_nombre: string | null;
  persona_segundo_apellido: string | null;
  persona_segundo_nombre: string | null;
  plantilla_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: string | number | null;
  tipo_documento_id: string | null;
  version: string | number | null;
  vinculacion_id: string | null;
}

interface SqlBuildResult {
  params: unknown[];
  sql: string;
}

interface UnifiedQueryFilters extends RepositorioDocumentosExportQuery {
  documento_id?: number;
  incluir_generados?: boolean;
}

const PERSONA_STATE_SQL = `
  CASE
    WHEN COALESCE(dp.activo, TRUE) = FALSE OR COALESCE(dp.es_vigente, FALSE) = FALSE
      THEN 'reemplazado'
    WHEN dp.fecha_vencimiento IS NULL
      THEN 'sin_vencimiento'
    WHEN dp.fecha_vencimiento < CURRENT_DATE
      THEN 'vencido'
    ELSE 'vigente'
  END
`;

const PERSONA_IS_CURRENT_SQL = `
  CASE
    WHEN COALESCE(dp.activo, TRUE) = FALSE
      THEN FALSE
    ELSE COALESCE(dp.es_vigente, FALSE)
  END
`;

const VINCULACION_STATE_SQL = `
  CASE
    WHEN COALESCE(dv.activo, TRUE) = FALSE
      THEN 'reemplazado'
    WHEN dv.fecha_vencimiento IS NULL
      THEN 'sin_vencimiento'
    WHEN dv.fecha_vencimiento < CURRENT_DATE
      THEN 'vencido'
    ELSE 'vigente'
  END
`;

const VINCULACION_IS_CURRENT_SQL = `
  CASE
    WHEN COALESCE(dv.activo, TRUE) = FALSE
      THEN FALSE
    WHEN dv.fecha_vencimiento IS NULL
      THEN TRUE
    WHEN dv.fecha_vencimiento < CURRENT_DATE
      THEN FALSE
    ELSE TRUE
  END
`;

const GENERADO_STATE_SQL = `
  CASE
    WHEN COALESCE(dg.activo, TRUE) = FALSE
      THEN 'reemplazado'
    ELSE 'sin_vencimiento'
  END
`;

const GENERADO_IS_CURRENT_SQL = `COALESCE(dg.activo, TRUE)`;

const DOCUMENT_DOWNLOAD_URL_EXPIRATION_SECONDS = 300;
const REPOSITORIO_MODULO = 'REPOSITORIO_DOCUMENTAL';
const COLLECTION_ENTITY_ID = 'repositorio:0';
const DOCUMENT_STORAGE_NOT_AVAILABLE_MESSAGE =
  'El documento existe en base de datos, pero no tiene archivo fisico disponible en Storage.';

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return toNumber(value);
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toTimestampString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const normalizeSearch = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildEntityId = (origen: RepositorioOrigen, documentoId: number): string => {
  return `${origen}:${documentoId}`;
};

const mapPersona = (row: UnifiedDocumentRow): RepositorioPersonaResumen | null => {
  const personaId = toNullableNumber(row.persona_id);

  if (personaId === null) {
    return null;
  }

  return {
    id: personaId,
    numero_documento: row.persona_numero_documento,
    primer_nombre: row.persona_primer_nombre,
    segundo_nombre: row.persona_segundo_nombre,
    primer_apellido: row.persona_primer_apellido,
    segundo_apellido: row.persona_segundo_apellido
  };
};

const mapEmpresa = (row: UnifiedDocumentRow): RepositorioEmpresaResumen | null => {
  const empresaId = toNullableNumber(row.empresa_id);

  if (empresaId === null) {
    return null;
  }

  return {
    id: empresaId,
    tipo_empresa: row.empresa_tipo_empresa,
    nombre_empresa: row.empresa_nombre_empresa,
    nit: row.empresa_nit,
    representante_legal: row.empresa_representante_legal,
    correo: row.empresa_correo,
    telefono: row.empresa_telefono,
    ciudad: row.empresa_ciudad
  };
};

const mapContrato = (row: UnifiedDocumentRow): RepositorioContratoResumen | null => {
  const contratoId = toNullableNumber(row.contrato_id);

  if (contratoId === null) {
    return null;
  }

  return {
    id: contratoId,
    numero_contrato: row.contrato_numero_contrato,
    numero_licitacion: row.contrato_numero_licitacion,
    entidad_contratante: row.contrato_entidad_contratante,
    fecha_inicio: toDateString(row.contrato_fecha_inicio),
    fecha_finalizacion: toDateString(row.contrato_fecha_finalizacion),
    objeto_contractual: row.contrato_objeto_contractual
  };
};

const mapUnifiedDocument = (row: UnifiedDocumentRow): RepositorioDocumento => {
  return {
    origen: row.origen,
    documento_id: toNumber(row.documento_id),
    persona_id: toNullableNumber(row.persona_id),
    vinculacion_id: toNullableNumber(row.vinculacion_id),
    empresa_id: toNullableNumber(row.empresa_id),
    contrato_id: toNullableNumber(row.contrato_id),
    tipo_documento_id: toNullableNumber(row.tipo_documento_id),
    nombre_tipo_documento: row.nombre_tipo_documento,
    nombre_archivo: row.nombre_archivo,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    archivo_path: row.archivo_path,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes),
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    fecha_carga: toTimestampString(row.fecha_carga),
    version: row.version === null ? null : toNumber(row.version),
    documento_reemplaza_id: toNullableNumber(row.documento_reemplaza_id),
    es_vigente: row.es_vigente,
    estado_documental: row.estado_documental,
    persona: mapPersona(row),
    empresa: mapEmpresa(row),
    contrato: mapContrato(row)
  };
};

const daysUntil = (isoDate: string): number => {
  const now = new Date();
  const current = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetDate = new Date(`${isoDate}T00:00:00.000Z`);
  const target = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate()
  );

  return Math.round((target - current) / 86400000);
};

const escapeCsv = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);

  if (/["\n,;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const hasStoragePath = (value: string | null): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const filterDuplicateGeneratedDocuments = (
  items: RepositorioDocumento[]
): RepositorioDocumento[] => {
  const registeredStoragePaths = new Set(
    items.flatMap((item) => {
      if (item.origen === 'generado' || !hasStoragePath(item.storage_path)) {
        return [];
      }

      return [item.storage_path.trim()];
    })
  );

  return items.filter((item) => {
    if (item.origen !== 'generado') {
      return true;
    }

    if (!hasStoragePath(item.storage_path)) {
      return true;
    }

    const storagePath = item.storage_path;
    return !registeredStoragePaths.has(storagePath.trim());
  });
};

const pushParam = (params: unknown[], value: unknown): string => {
  params.push(value);
  return `$${params.length}`;
};

const applyTenantDirectScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext,
  contractColumn: string,
  companyColumn: string
): void => {
  if (tenant.isGlobalAdmin) {
    return;
  }

  const tenantConditions: string[] = [];

  if (tenant.contratoIds.length > 0) {
    const placeholder = pushParam(params, tenant.contratoIds);
    tenantConditions.push(`${contractColumn} = ANY(${placeholder}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    const placeholder = pushParam(params, tenant.empresaIds);
    tenantConditions.push(`${companyColumn} = ANY(${placeholder}::bigint[])`);
  }

  if (tenantConditions.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  conditions.push(`(${tenantConditions.join(' OR ')})`);
};

const applyTenantPersonaScope = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext
): void => {
  if (tenant.isGlobalAdmin) {
    return;
  }

  const tenantConditions: string[] = [];

  if (tenant.contratoIds.length > 0) {
    const placeholder = pushParam(params, tenant.contratoIds);
    tenantConditions.push(`v_tenant.contrato_id = ANY(${placeholder}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    const placeholder = pushParam(params, tenant.empresaIds);
    tenantConditions.push(`c_tenant.empresa_id = ANY(${placeholder}::bigint[])`);
  }

  if (tenantConditions.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  conditions.push(`
    EXISTS (
      SELECT 1
      FROM vinculaciones v_tenant
      INNER JOIN contratos c_tenant ON c_tenant.id = v_tenant.contrato_id
      WHERE v_tenant.persona_id = dp.persona_id
        AND (${tenantConditions.join(' OR ')})
    )
  `);
};

const buildPersonaSelect = (
  filters: UnifiedQueryFilters,
  tenant: TenantAccessContext
): SqlBuildResult => {
  const params: unknown[] = [];
  const conditions: string[] = [];
  const search = normalizeSearch(filters.search);

  applyTenantPersonaScope(conditions, params, tenant);

  if (filters.documento_id !== undefined) {
    const placeholder = pushParam(params, filters.documento_id);
    conditions.push(`dp.id = ${placeholder}::bigint`);
  }

  if (filters.persona_id !== undefined) {
    const placeholder = pushParam(params, filters.persona_id);
    conditions.push(`dp.persona_id = ${placeholder}::bigint`);
  }

  if (filters.vinculacion_id !== undefined) {
    const placeholder = pushParam(params, filters.vinculacion_id);
    conditions.push(`dp.vinculacion_id = ${placeholder}::bigint`);
  }

  if (filters.empresa_id !== undefined) {
    const placeholder = pushParam(params, filters.empresa_id);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM vinculaciones v_filter
        INNER JOIN contratos c_filter ON c_filter.id = v_filter.contrato_id
        WHERE v_filter.persona_id = dp.persona_id
          AND c_filter.empresa_id = ${placeholder}::bigint
      )
    `);
  }

  if (filters.contrato_id !== undefined) {
    const placeholder = pushParam(params, filters.contrato_id);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM vinculaciones v_filter
        WHERE v_filter.persona_id = dp.persona_id
          AND v_filter.contrato_id = ${placeholder}::bigint
      )
    `);
  }

  if (filters.tipo_documento_id !== undefined) {
    const placeholder = pushParam(params, filters.tipo_documento_id);
    conditions.push(`dp.tipo_documento_id = ${placeholder}::bigint`);
  }

  if (filters.estado_documental) {
    const placeholder = pushParam(params, filters.estado_documental);
    conditions.push(`${PERSONA_STATE_SQL} = ${placeholder}`);
  }

  if (filters.es_vigente !== undefined) {
    const placeholder = pushParam(params, filters.es_vigente);
    conditions.push(`${PERSONA_IS_CURRENT_SQL} = ${placeholder}::boolean`);
  }

  if (filters.fecha_desde) {
    const placeholder = pushParam(params, filters.fecha_desde);
    conditions.push(`dp.fecha_carga::date >= ${placeholder}::date`);
  }

  if (filters.fecha_hasta) {
    const placeholder = pushParam(params, filters.fecha_hasta);
    conditions.push(`dp.fecha_carga::date <= ${placeholder}::date`);
  }

  if (search) {
    const placeholder = pushParam(params, `%${search}%`);
    conditions.push(`
      (
        dp.nombre_original ILIKE ${placeholder}
        OR COALESCE(td.nombre_documento, '') ILIKE ${placeholder}
        OR COALESCE(p.numero_documento, '') ILIKE ${placeholder}
        OR CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) ILIKE ${placeholder}
        OR EXISTS (
          SELECT 1
          FROM vinculaciones v_search
          INNER JOIN contratos c_search ON c_search.id = v_search.contrato_id
          INNER JOIN empresas e_search ON e_search.id = c_search.empresa_id
          WHERE v_search.persona_id = dp.persona_id
            AND (
              COALESCE(c_search.numero_contrato, '') ILIKE ${placeholder}
              OR COALESCE(e_search.nombre_empresa, '') ILIKE ${placeholder}
            )
        )
      )
    `);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    params,
    sql: `
      SELECT
        'persona'::text AS origen,
        dp.id::text AS documento_id,
        dp.persona_id::text AS persona_id,
        dp.vinculacion_id::text AS vinculacion_id,
        c_link.empresa_id::text AS empresa_id,
        v_link.contrato_id::text AS contrato_id,
        dp.tipo_documento_id::text AS tipo_documento_id,
        td.nombre_documento AS nombre_tipo_documento,
        dp.nombre_original AS nombre_archivo,
        dp.storage_bucket,
        dp.storage_path,
        dp.archivo_path,
        dp.mime_type,
        dp.tamano_bytes,
        dp.fecha_expedicion,
        dp.fecha_vencimiento,
        dp.fecha_carga,
        dp.version,
        dp.documento_reemplaza_id::text AS documento_reemplaza_id,
        ${PERSONA_IS_CURRENT_SQL} AS es_vigente,
        ${PERSONA_STATE_SQL} AS estado_documental,
        p.numero_documento AS persona_numero_documento,
        p.primer_nombre AS persona_primer_nombre,
        p.segundo_nombre AS persona_segundo_nombre,
        p.primer_apellido AS persona_primer_apellido,
        p.segundo_apellido AS persona_segundo_apellido,
        e_link.tipo_empresa AS empresa_tipo_empresa,
        e_link.nombre_empresa AS empresa_nombre_empresa,
        e_link.nit AS empresa_nit,
        e_link.representante_legal AS empresa_representante_legal,
        e_link.correo AS empresa_correo,
        e_link.telefono AS empresa_telefono,
        e_link.ciudad AS empresa_ciudad,
        c_link.numero_contrato AS contrato_numero_contrato,
        c_link.numero_licitacion AS contrato_numero_licitacion,
        c_link.entidad_contratante AS contrato_entidad_contratante,
        c_link.fecha_inicio AS contrato_fecha_inicio,
        c_link.fecha_finalizacion AS contrato_fecha_finalizacion,
        c_link.objeto_contractual AS contrato_objeto_contractual,
        NULL::text AS plantilla_id,
        NULL::text AS generado_por,
        NULL::timestamp AS fecha_generacion,
        COALESCE(dp.activo, TRUE) AS activo_origen,
        NULL::text AS contenido_generado
      FROM documentos_persona dp
      INNER JOIN personas p ON p.id = dp.persona_id
      LEFT JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
      LEFT JOIN vinculaciones v_link ON v_link.id = dp.vinculacion_id
      LEFT JOIN contratos c_link ON c_link.id = v_link.contrato_id
      LEFT JOIN empresas e_link ON e_link.id = c_link.empresa_id
      ${whereClause}
    `
  };
};

const buildVinculacionSelect = (
  filters: UnifiedQueryFilters,
  tenant: TenantAccessContext
): SqlBuildResult => {
  const params: unknown[] = [];
  const conditions: string[] = [];
  const search = normalizeSearch(filters.search);

  applyTenantDirectScope(conditions, params, tenant, 'v.contrato_id', 'c.empresa_id');

  if (filters.documento_id !== undefined) {
    const placeholder = pushParam(params, filters.documento_id);
    conditions.push(`dv.id = ${placeholder}::bigint`);
  }

  if (filters.persona_id !== undefined) {
    const placeholder = pushParam(params, filters.persona_id);
    conditions.push(`v.persona_id = ${placeholder}::bigint`);
  }

  if (filters.vinculacion_id !== undefined) {
    const placeholder = pushParam(params, filters.vinculacion_id);
    conditions.push(`dv.vinculacion_id = ${placeholder}::bigint`);
  }

  if (filters.empresa_id !== undefined) {
    const placeholder = pushParam(params, filters.empresa_id);
    conditions.push(`c.empresa_id = ${placeholder}::bigint`);
  }

  if (filters.contrato_id !== undefined) {
    const placeholder = pushParam(params, filters.contrato_id);
    conditions.push(`v.contrato_id = ${placeholder}::bigint`);
  }

  if (filters.tipo_documento_id !== undefined) {
    const placeholder = pushParam(params, filters.tipo_documento_id);
    conditions.push(`dv.tipo_documento_id = ${placeholder}::bigint`);
  }

  if (filters.estado_documental) {
    const placeholder = pushParam(params, filters.estado_documental);
    conditions.push(`${VINCULACION_STATE_SQL} = ${placeholder}`);
  }

  if (filters.es_vigente !== undefined) {
    const placeholder = pushParam(params, filters.es_vigente);
    conditions.push(`${VINCULACION_IS_CURRENT_SQL} = ${placeholder}::boolean`);
  }

  if (filters.fecha_desde) {
    const placeholder = pushParam(params, filters.fecha_desde);
    conditions.push(`dv.fecha_carga::date >= ${placeholder}::date`);
  }

  if (filters.fecha_hasta) {
    const placeholder = pushParam(params, filters.fecha_hasta);
    conditions.push(`dv.fecha_carga::date <= ${placeholder}::date`);
  }

  if (search) {
    const placeholder = pushParam(params, `%${search}%`);
    conditions.push(`
      (
        dv.nombre_original ILIKE ${placeholder}
        OR COALESCE(td.nombre_documento, '') ILIKE ${placeholder}
        OR COALESCE(p.numero_documento, '') ILIKE ${placeholder}
        OR CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) ILIKE ${placeholder}
        OR COALESCE(c.numero_contrato, '') ILIKE ${placeholder}
        OR COALESCE(e.nombre_empresa, '') ILIKE ${placeholder}
      )
    `);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    params,
    sql: `
      SELECT
        'vinculacion'::text AS origen,
        dv.id::text AS documento_id,
        v.persona_id::text AS persona_id,
        dv.vinculacion_id::text AS vinculacion_id,
        c.empresa_id::text AS empresa_id,
        v.contrato_id::text AS contrato_id,
        dv.tipo_documento_id::text AS tipo_documento_id,
        td.nombre_documento AS nombre_tipo_documento,
        dv.nombre_original AS nombre_archivo,
        dv.storage_bucket,
        dv.storage_path,
        dv.archivo_path,
        dv.mime_type,
        dv.tamano_bytes,
        dv.fecha_expedicion,
        dv.fecha_vencimiento,
        dv.fecha_carga,
        NULL::int AS version,
        NULL::text AS documento_reemplaza_id,
        ${VINCULACION_IS_CURRENT_SQL} AS es_vigente,
        ${VINCULACION_STATE_SQL} AS estado_documental,
        p.numero_documento AS persona_numero_documento,
        p.primer_nombre AS persona_primer_nombre,
        p.segundo_nombre AS persona_segundo_nombre,
        p.primer_apellido AS persona_primer_apellido,
        p.segundo_apellido AS persona_segundo_apellido,
        e.tipo_empresa AS empresa_tipo_empresa,
        e.nombre_empresa AS empresa_nombre_empresa,
        e.nit AS empresa_nit,
        e.representante_legal AS empresa_representante_legal,
        e.correo AS empresa_correo,
        e.telefono AS empresa_telefono,
        e.ciudad AS empresa_ciudad,
        c.numero_contrato AS contrato_numero_contrato,
        c.numero_licitacion AS contrato_numero_licitacion,
        c.entidad_contratante AS contrato_entidad_contratante,
        c.fecha_inicio AS contrato_fecha_inicio,
        c.fecha_finalizacion AS contrato_fecha_finalizacion,
        c.objeto_contractual AS contrato_objeto_contractual,
        NULL::text AS plantilla_id,
        NULL::text AS generado_por,
        NULL::timestamp AS fecha_generacion,
        COALESCE(dv.activo, TRUE) AS activo_origen,
        NULL::text AS contenido_generado
      FROM documentos_vinculacion dv
      INNER JOIN vinculaciones v ON v.id = dv.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN contratos c ON c.id = v.contrato_id
      INNER JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
      ${whereClause}
    `
  };
};

const buildGeneradoSelect = (
  filters: UnifiedQueryFilters,
  tenant: TenantAccessContext
): SqlBuildResult => {
  const params: unknown[] = [];
  const conditions: string[] = [];
  const search = normalizeSearch(filters.search);

  applyTenantDirectScope(conditions, params, tenant, 'v.contrato_id', 'c.empresa_id');

  if (filters.documento_id !== undefined) {
    const placeholder = pushParam(params, filters.documento_id);
    conditions.push(`dg.id = ${placeholder}::bigint`);
  }

  if (filters.persona_id !== undefined) {
    const placeholder = pushParam(params, filters.persona_id);
    conditions.push(`v.persona_id = ${placeholder}::bigint`);
  }

  if (filters.vinculacion_id !== undefined) {
    const placeholder = pushParam(params, filters.vinculacion_id);
    conditions.push(`dg.vinculacion_id = ${placeholder}::bigint`);
  }

  if (filters.empresa_id !== undefined) {
    const placeholder = pushParam(params, filters.empresa_id);
    conditions.push(`c.empresa_id = ${placeholder}::bigint`);
  }

  if (filters.contrato_id !== undefined) {
    const placeholder = pushParam(params, filters.contrato_id);
    conditions.push(`v.contrato_id = ${placeholder}::bigint`);
  }

  if (filters.tipo_documento_id !== undefined) {
    conditions.push('1 = 0');
  }

  if (filters.estado_documental) {
    const placeholder = pushParam(params, filters.estado_documental);
    conditions.push(`${GENERADO_STATE_SQL} = ${placeholder}`);
  }

  if (filters.es_vigente !== undefined) {
    const placeholder = pushParam(params, filters.es_vigente);
    conditions.push(`${GENERADO_IS_CURRENT_SQL} = ${placeholder}::boolean`);
  }

  if (filters.fecha_desde) {
    const placeholder = pushParam(params, filters.fecha_desde);
    conditions.push(`dg.fecha_generacion::date >= ${placeholder}::date`);
  }

  if (filters.fecha_hasta) {
    const placeholder = pushParam(params, filters.fecha_hasta);
    conditions.push(`dg.fecha_generacion::date <= ${placeholder}::date`);
  }

  if (search) {
    const placeholder = pushParam(params, `%${search}%`);
    conditions.push(`
      (
        dg.nombre_archivo ILIKE ${placeholder}
        OR COALESCE(p.numero_documento, '') ILIKE ${placeholder}
        OR CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) ILIKE ${placeholder}
        OR COALESCE(c.numero_contrato, '') ILIKE ${placeholder}
        OR COALESCE(e.nombre_empresa, '') ILIKE ${placeholder}
      )
    `);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    params,
    sql: `
      SELECT
        'generado'::text AS origen,
        dg.id::text AS documento_id,
        v.persona_id::text AS persona_id,
        dg.vinculacion_id::text AS vinculacion_id,
        c.empresa_id::text AS empresa_id,
        v.contrato_id::text AS contrato_id,
        NULL::text AS tipo_documento_id,
        NULL::text AS nombre_tipo_documento,
        dg.nombre_archivo,
        dg.storage_bucket,
        dg.storage_path,
        NULL::text AS archivo_path,
        dg.mime_type,
        dg.tamano_bytes,
        NULL::date AS fecha_expedicion,
        NULL::date AS fecha_vencimiento,
        dg.fecha_generacion AS fecha_carga,
        NULL::int AS version,
        NULL::text AS documento_reemplaza_id,
        ${GENERADO_IS_CURRENT_SQL} AS es_vigente,
        ${GENERADO_STATE_SQL} AS estado_documental,
        p.numero_documento AS persona_numero_documento,
        p.primer_nombre AS persona_primer_nombre,
        p.segundo_nombre AS persona_segundo_nombre,
        p.primer_apellido AS persona_primer_apellido,
        p.segundo_apellido AS persona_segundo_apellido,
        e.tipo_empresa AS empresa_tipo_empresa,
        e.nombre_empresa AS empresa_nombre_empresa,
        e.nit AS empresa_nit,
        e.representante_legal AS empresa_representante_legal,
        e.correo AS empresa_correo,
        e.telefono AS empresa_telefono,
        e.ciudad AS empresa_ciudad,
        c.numero_contrato AS contrato_numero_contrato,
        c.numero_licitacion AS contrato_numero_licitacion,
        c.entidad_contratante AS contrato_entidad_contratante,
        c.fecha_inicio AS contrato_fecha_inicio,
        c.fecha_finalizacion AS contrato_fecha_finalizacion,
        c.objeto_contractual AS contrato_objeto_contractual,
        dg.plantilla_id::text AS plantilla_id,
        dg.generado_por::text AS generado_por,
        dg.fecha_generacion,
        COALESCE(dg.activo, TRUE) AS activo_origen,
        dg.contenido_generado
      FROM documentos_generados dg
      INNER JOIN vinculaciones v ON v.id = dg.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN contratos c ON c.id = v.contrato_id
      INNER JOIN empresas e ON e.id = c.empresa_id
      ${whereClause}
    `
  };
};

const buildUnifiedQuery = (
  filters: UnifiedQueryFilters,
  tenant: TenantAccessContext
): SqlBuildResult => {
  const selects: string[] = [];
  const params: unknown[] = [];

  const includePersona = !filters.origen || filters.origen === 'persona';
  const includeVinculacion = !filters.origen || filters.origen === 'vinculacion';
  const includeGenerado = !filters.origen || filters.origen === 'generado';

  if (includePersona) {
    const personaSelect = buildPersonaSelect(filters, tenant);
    const rebasedSql = personaSelect.sql.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
      return `$${Number(rawIndex) + params.length}`;
    });

    params.push(...personaSelect.params);
    selects.push(rebasedSql);
  }

  if (includeVinculacion) {
    const vinculacionSelect = buildVinculacionSelect(filters, tenant);
    const rebasedSql = vinculacionSelect.sql.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
      return `$${Number(rawIndex) + params.length}`;
    });

    params.push(...vinculacionSelect.params);
    selects.push(rebasedSql);
  }

  if (includeGenerado) {
    const generadoSelect = buildGeneradoSelect(filters, tenant);
    const rebasedSql = generadoSelect.sql.replace(/\$(\d+)/g, (_match, rawIndex: string) => {
      return `$${Number(rawIndex) + params.length}`;
    });

    params.push(...generadoSelect.params);
    selects.push(rebasedSql);
  }

  if (selects.length === 0) {
    return {
      params: [],
      sql: `
        SELECT *
        FROM (
          SELECT
            'persona'::text AS origen,
            '0'::text AS documento_id,
            NULL::text AS persona_id,
            NULL::text AS vinculacion_id,
            NULL::text AS empresa_id,
            NULL::text AS contrato_id,
            NULL::text AS tipo_documento_id,
            NULL::text AS nombre_tipo_documento,
            NULL::text AS nombre_archivo,
            NULL::text AS storage_bucket,
            NULL::text AS storage_path,
            NULL::text AS archivo_path,
            NULL::text AS mime_type,
            NULL::bigint AS tamano_bytes,
            NULL::date AS fecha_expedicion,
            NULL::date AS fecha_vencimiento,
            NULL::timestamp AS fecha_carga,
            NULL::int AS version,
            NULL::text AS documento_reemplaza_id,
            NULL::boolean AS es_vigente,
            'vigente'::text AS estado_documental,
            NULL::text AS persona_numero_documento,
            NULL::text AS persona_primer_nombre,
            NULL::text AS persona_segundo_nombre,
            NULL::text AS persona_primer_apellido,
            NULL::text AS persona_segundo_apellido,
            NULL::text AS empresa_tipo_empresa,
            NULL::text AS empresa_nombre_empresa,
            NULL::text AS empresa_nit,
            NULL::text AS empresa_representante_legal,
            NULL::text AS empresa_correo,
            NULL::text AS empresa_telefono,
            NULL::text AS empresa_ciudad,
            NULL::text AS contrato_numero_contrato,
            NULL::text AS contrato_numero_licitacion,
            NULL::text AS contrato_entidad_contratante,
            NULL::date AS contrato_fecha_inicio,
            NULL::date AS contrato_fecha_finalizacion,
            NULL::text AS contrato_objeto_contractual,
            NULL::text AS plantilla_id,
            NULL::text AS generado_por,
            NULL::timestamp AS fecha_generacion,
            TRUE AS activo_origen,
            NULL::text AS contenido_generado
        ) empty_result
        WHERE 1 = 0
      `
    };
  }

  return {
    params,
    sql: selects.join('\nUNION ALL\n')
  };
};

const loadUnifiedDocuments = async (
  filters: UnifiedQueryFilters,
  tenant: TenantAccessContext,
  pagination?: { limit: number; page: number },
  options?: {
    excludeDuplicateGenerated?: boolean;
  }
): Promise<{ items: RepositorioDocumento[]; total: number }> => {
  const built = buildUnifiedQuery(filters, tenant);

  if (options?.excludeDuplicateGenerated) {
    const result = await dbQuery<UnifiedDocumentRow>(
      `
        SELECT *
        FROM (${built.sql}) unified
        ORDER BY unified.fecha_carga DESC NULLS LAST, unified.documento_id::bigint DESC
      `,
      built.params
    );

    const deduplicatedItems = filterDuplicateGeneratedDocuments(result.rows.map(mapUnifiedDocument));
    const total = deduplicatedItems.length;

    if (!pagination) {
      return {
        items: deduplicatedItems,
        total
      };
    }

    const offset = (pagination.page - 1) * pagination.limit;

    return {
      items: deduplicatedItems.slice(offset, offset + pagination.limit),
      total
    };
  }

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM (${built.sql}) unified
    `,
    built.params
  );

  const total = countResult.rows[0]?.total ?? 0;
  let rows: UnifiedDocumentRow[] = [];

  if (pagination) {
    const offset = (pagination.page - 1) * pagination.limit;
    const listParams = [...built.params, pagination.limit, offset];
    const result = await dbQuery<UnifiedDocumentRow>(
      `
        SELECT *
        FROM (${built.sql}) unified
        ORDER BY unified.fecha_carga DESC NULLS LAST, unified.documento_id::bigint DESC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );

    rows = result.rows;
  } else if (total > 0) {
    const result = await dbQuery<UnifiedDocumentRow>(
      `
        SELECT *
        FROM (${built.sql}) unified
        ORDER BY unified.fecha_carga DESC NULLS LAST, unified.documento_id::bigint DESC
      `,
      built.params
    );

    rows = result.rows;
  }

  return {
    items: rows.map(mapUnifiedDocument),
    total
  };
};

const requireTenant = (tenant: TenantAccessContext | undefined): TenantAccessContext => {
  if (!tenant) {
    throw new AppError('Tenant context is required', 500, 'TENANT_CONTEXT_MISSING');
  }

  return tenant;
};

const requireUnifiedDocumentRow = async (
  origen: RepositorioOrigen,
  documentoId: number,
  tenant: TenantAccessContext
): Promise<UnifiedDocumentRow> => {
  const built = buildUnifiedQuery(
    {
      origen,
      documento_id: documentoId
    },
    tenant
  );

  const result = await dbQuery<UnifiedDocumentRow>(
    `
      SELECT *
      FROM (${built.sql}) unified
      LIMIT 1
    `,
    built.params
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Documento no encontrado', 404, 'REPOSITORIO_DOCUMENTO_NOT_FOUND');
  }

  return row;
};

const recordRepositorioAudit = async (input: {
  accion: string;
  descripcion: string;
  entidad_id: string;
  usuario_id: string;
  empresa_id?: number | null;
  contrato_id?: number | null;
  datos_nuevos?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
}): Promise<void> => {
  await registerAuditEvent({
    accion: input.accion,
    contrato_id: input.contrato_id ?? null,
    datos_nuevos: input.datos_nuevos,
    descripcion: input.descripcion,
    entidad: 'documento',
    entidad_id: input.entidad_id,
    empresa_id: input.empresa_id ?? null,
    ip_address: input.ip_address ?? null,
    modulo: REPOSITORIO_MODULO,
    user_agent: input.user_agent ?? null,
    usuario_id: input.usuario_id
  });
};

const toMetadata = (row: UnifiedDocumentRow) => {
  return {
    activo: row.activo_origen,
    contenido_generado: row.contenido_generado,
    fecha_generacion: toTimestampString(row.fecha_generacion),
    generado_por: toNullableNumber(row.generado_por),
    plantilla_id: toNullableNumber(row.plantilla_id)
  };
};

const fetchRelatedPersonaDocument = async (
  personaId: number,
  tipoDocumentoId: number,
  tenant: TenantAccessContext,
  options: {
    documentoId?: number;
    documentoReemplazaId?: number;
    vigente?: boolean;
  }
): Promise<RepositorioDocumento | null> => {
  const filters: UnifiedQueryFilters = {
    origen: 'persona',
    persona_id: personaId,
    tipo_documento_id: tipoDocumentoId
  };

  if (options.documentoId !== undefined) {
    filters.documento_id = options.documentoId;
  }

  const built = buildUnifiedQuery(filters, tenant);
  const conditions: string[] = [];
  const params = [...built.params];

  if (options.documentoReemplazaId !== undefined) {
    const placeholder = `$${params.length + 1}`;
    params.push(options.documentoReemplazaId);
    conditions.push(`unified.documento_reemplaza_id::bigint = ${placeholder}::bigint`);
  }

  if (options.vigente !== undefined) {
    const placeholder = `$${params.length + 1}`;
    params.push(options.vigente);
    conditions.push(`unified.es_vigente = ${placeholder}::boolean`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<UnifiedDocumentRow>(
    `
      SELECT *
      FROM (${built.sql}) unified
      ${whereClause}
      ORDER BY unified.fecha_carga DESC NULLS LAST, unified.version DESC NULLS LAST, unified.documento_id::bigint DESC
      LIMIT 1
    `,
    params
  );

  const row = result.rows[0];
  return row ? mapUnifiedDocument(row) : null;
};

const buildDetailRelations = async (
  row: UnifiedDocumentRow,
  tenant: TenantAccessContext
): Promise<RepositorioDocumentoDetalle['relaciones']> => {
  const currentDocument = mapUnifiedDocument(row);

  if (row.origen === 'persona') {
    const personaId = toNullableNumber(row.persona_id);
    const tipoDocumentoId = toNullableNumber(row.tipo_documento_id);

    if (personaId === null || tipoDocumentoId === null) {
      return {
        documento_reemplaza: null,
        documento_reemplazado_por: null,
        documento_vigente: null
      };
    }

    const [documentoReemplaza, documentoReemplazadoPor, documentoVigente] = await Promise.all([
      row.documento_reemplaza_id
        ? fetchRelatedPersonaDocument(personaId, tipoDocumentoId, tenant, {
            documentoId: toNumber(row.documento_reemplaza_id)
          })
        : Promise.resolve(null),
      fetchRelatedPersonaDocument(personaId, tipoDocumentoId, tenant, {
        documentoReemplazaId: toNumber(row.documento_id)
      }),
      row.es_vigente
        ? Promise.resolve(currentDocument)
        : fetchRelatedPersonaDocument(personaId, tipoDocumentoId, tenant, {
            vigente: true
          })
    ]);

    return {
      documento_reemplaza: documentoReemplaza,
      documento_reemplazado_por: documentoReemplazadoPor,
      documento_vigente: documentoVigente
    };
  }

  if (row.origen === 'generado') {
    const plantillaId = toNullableNumber(row.plantilla_id);
    const vinculacionId = toNullableNumber(row.vinculacion_id);

    if (plantillaId === null || vinculacionId === null) {
      return {
        documento_reemplaza: null,
        documento_reemplazado_por: null,
        documento_vigente: row.es_vigente ? currentDocument : null
      };
    }

    const built = buildUnifiedQuery({ origen: 'generado', vinculacion_id: vinculacionId }, tenant);
    const result = await dbQuery<UnifiedDocumentRow>(
      `
        SELECT *
        FROM (${built.sql}) unified
        WHERE unified.plantilla_id::bigint = $${built.params.length + 1}::bigint
          AND unified.es_vigente = TRUE
        ORDER BY unified.fecha_generacion DESC NULLS LAST, unified.documento_id::bigint DESC
        LIMIT 1
      `,
      [...built.params, plantillaId]
    );

    const vigente = result.rows[0];

    return {
      documento_reemplaza: null,
      documento_reemplazado_por: null,
      documento_vigente: vigente ? mapUnifiedDocument(vigente) : row.es_vigente ? currentDocument : null
    };
  }

  return {
    documento_reemplaza: null,
    documento_reemplazado_por: null,
    documento_vigente: row.es_vigente ? currentDocument : null
  };
};

const buildAlertasIndicators = async (
  filters: RepositorioDocumentosIndicadoresQuery,
  tenant: TenantAccessContext
): Promise<{ alertas_criticas: number; total_alertas_activas: number }> => {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (!tenant.isGlobalAdmin) {
    const tenantConditions: string[] = [];

    if (tenant.contratoIds.length > 0) {
      const placeholder = pushParam(params, tenant.contratoIds);
      tenantConditions.push(`ad.contrato_id = ANY(${placeholder}::bigint[])`);
    }

    if (tenant.empresaIds.length > 0) {
      const placeholder = pushParam(params, tenant.empresaIds);
      tenantConditions.push(`ad.empresa_id = ANY(${placeholder}::bigint[])`);
    }

    if (tenantConditions.length === 0) {
      return {
        total_alertas_activas: 0,
        alertas_criticas: 0
      };
    }

    conditions.push(`(${tenantConditions.join(' OR ')})`);
  }

  if (filters.empresa_id !== undefined) {
    const placeholder = pushParam(params, filters.empresa_id);
    conditions.push(`ad.empresa_id = ${placeholder}::bigint`);
  }

  if (filters.contrato_id !== undefined) {
    const placeholder = pushParam(params, filters.contrato_id);
    conditions.push(`ad.contrato_id = ${placeholder}::bigint`);
  }

  if (filters.persona_id !== undefined) {
    const placeholder = pushParam(params, filters.persona_id);
    conditions.push(`ad.persona_id = ${placeholder}::bigint`);
  }

  if (filters.vinculacion_id !== undefined) {
    const placeholder = pushParam(params, filters.vinculacion_id);
    conditions.push(`ad.vinculacion_id = ${placeholder}::bigint`);
  }

  if (filters.tipo_documento_id !== undefined) {
    const placeholder = pushParam(params, filters.tipo_documento_id);
    conditions.push(`ad.tipo_documento_id = ${placeholder}::bigint`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<AlertasIndicadoresRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE ad.activo = TRUE)::int AS total_alertas_activas,
        COUNT(*) FILTER (WHERE ad.activo = TRUE AND ad.severidad = 'CRITICA')::int AS alertas_criticas
      FROM alertas_documentales ad
      ${whereClause}
    `,
    params
  );

  return {
    total_alertas_activas: result.rows[0]?.total_alertas_activas ?? 0,
    alertas_criticas: result.rows[0]?.alertas_criticas ?? 0
  };
};

export const listRepositorioDocumentos = async (
  filters: RepositorioDocumentosQuery,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDocumentosListResult> => {
  const tenant = requireTenant(tenantInput);
  const { items, total } = await loadUnifiedDocuments(filters, tenant, {
    page: filters.page,
    limit: filters.limit
  }, {
    excludeDuplicateGenerated: filters.incluir_generados !== true
  });

  await recordRepositorioAudit({
    accion: 'CONSULTA_REPOSITORIO_DOCUMENTAL',
    descripcion: 'Consulta del listado unificado del repositorio documental',
    entidad_id: COLLECTION_ENTITY_ID,
    usuario_id: actorUserId,
    datos_nuevos: {
      filtros: filters,
      limit: filters.limit,
      page: filters.page,
      total
    },
    ip_address: auditMeta?.ip_address ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return {
    items,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getRepositorioDocumentoDetalle = async (
  origen: RepositorioOrigen,
  documentoId: number,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDocumentoDetalle> => {
  const tenant = requireTenant(tenantInput);
  const row = await requireUnifiedDocumentRow(origen, documentoId, tenant);
  const documento = mapUnifiedDocument(row);
  const relaciones = await buildDetailRelations(row, tenant);

  await recordRepositorioAudit({
    accion: 'CONSULTA_DETALLE_DOCUMENTO',
    descripcion: 'Consulta del detalle del documento en el repositorio documental',
    entidad_id: buildEntityId(origen, documentoId),
    usuario_id: actorUserId,
    empresa_id: documento.empresa_id,
    contrato_id: documento.contrato_id,
    datos_nuevos: {
      origen,
      documento_id: documentoId
    },
    ip_address: auditMeta?.ip_address ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return {
    documento,
    metadata: toMetadata(row),
    relaciones
  };
};

export const getRepositorioDocumentoVersiones = async (
  origen: RepositorioOrigen,
  documentoId: number,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDocumentosVersionesResult> => {
  const tenant = requireTenant(tenantInput);
  const row = await requireUnifiedDocumentRow(origen, documentoId, tenant);
  const documento = mapUnifiedDocument(row);
  let note: string | null = null;
  let versiones: RepositorioDocumento[] = [documento];

  if (origen === 'persona') {
    const personaId = toNullableNumber(row.persona_id);
    const tipoDocumentoId = toNullableNumber(row.tipo_documento_id);

    if (personaId !== null && tipoDocumentoId !== null) {
      const { items } = await loadUnifiedDocuments(
        {
          origen: 'persona',
          persona_id: personaId,
          tipo_documento_id: tipoDocumentoId
        },
        tenant
      );

      versiones = items.sort((left, right) => {
        const versionDelta = (right.version ?? 0) - (left.version ?? 0);

        if (versionDelta !== 0) {
          return versionDelta;
        }

        return right.documento_id - left.documento_id;
      });
    }
  } else if (origen === 'vinculacion') {
    note = 'documentos_vinculacion no tiene columnas de versionamiento validadas';
  } else {
    const vinculacionId = toNullableNumber(row.vinculacion_id);
    const plantillaId = toNullableNumber(row.plantilla_id);

    note = 'documentos_generados no tiene columnas de versionamiento validadas; se agrupa por plantilla_id y vinculacion_id';

    if (vinculacionId !== null && plantillaId !== null) {
      const built = buildUnifiedQuery({ origen: 'generado', vinculacion_id: vinculacionId }, tenant);
      const result = await dbQuery<UnifiedDocumentRow>(
        `
          SELECT *
          FROM (${built.sql}) unified
          WHERE unified.plantilla_id::bigint = $${built.params.length + 1}::bigint
          ORDER BY unified.fecha_generacion DESC NULLS LAST, unified.documento_id::bigint DESC
        `,
        [...built.params, plantillaId]
      );

      versiones = result.rows.map(mapUnifiedDocument);
    }
  }

  await recordRepositorioAudit({
    accion: 'CONSULTA_HISTORIAL_DOCUMENTO',
    descripcion: 'Consulta del historial de versiones de un documento del repositorio documental',
    entidad_id: buildEntityId(origen, documentoId),
    usuario_id: actorUserId,
    empresa_id: documento.empresa_id,
    contrato_id: documento.contrato_id,
    datos_nuevos: {
      origen,
      documento_id: documentoId,
      total_versiones: versiones.length
    },
    ip_address: auditMeta?.ip_address ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return {
    documento,
    versiones,
    note
  };
};

export const generateRepositorioDocumentoDownloadUrl = async (
  origen: RepositorioOrigen,
  documentoId: number,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDownloadUrlResult> => {
  const tenant = requireTenant(tenantInput);
  const row = await requireUnifiedDocumentRow(origen, documentoId, tenant);
  const documento = mapUnifiedDocument(row);

  try {
    if (!documento.storage_bucket || !hasStoragePath(documento.storage_path)) {
      throw new AppError(
        DOCUMENT_STORAGE_NOT_AVAILABLE_MESSAGE,
        404,
        'DOCUMENT_STORAGE_NOT_AVAILABLE'
      );
    }

    const signedUrl = await createDocumentSignedUrlForBucket(
      documento.storage_bucket,
      documento.storage_path,
      DOCUMENT_DOWNLOAD_URL_EXPIRATION_SECONDS
    );

    await recordRepositorioAudit({
      accion: 'DOCUMENT_DOWNLOAD_URL_GENERATED',
      descripcion: 'Generacion de URL firmada para descarga segura de documento',
      entidad_id: buildEntityId(origen, documentoId),
      usuario_id: actorUserId,
      empresa_id: documento.empresa_id,
      contrato_id: documento.contrato_id,
      datos_nuevos: {
        expires_in: DOCUMENT_DOWNLOAD_URL_EXPIRATION_SECONDS,
        origen,
        documento_id: documentoId
      },
      ip_address: auditMeta?.ip_address ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    return {
      signed_url: signedUrl,
      expires_in: DOCUMENT_DOWNLOAD_URL_EXPIRATION_SECONDS,
      documento: {
        origen,
        documento_id: documentoId
      }
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'DOCUMENT_STORAGE_NOT_AVAILABLE') {
      await recordRepositorioAudit({
        accion: 'DOCUMENT_DOWNLOAD_URL_FAILED',
        descripcion: 'No fue posible generar URL firmada porque el archivo no existe en Storage',
        entidad_id: buildEntityId(origen, documentoId),
        usuario_id: actorUserId,
        empresa_id: documento.empresa_id,
        contrato_id: documento.contrato_id,
        datos_nuevos: {
          error_code: error.code,
          origen,
          documento_id: documentoId
        },
        ip_address: auditMeta?.ip_address ?? null,
        user_agent: auditMeta?.user_agent ?? null
      });
    }

    throw error;
  }
};

export const exportRepositorioDocumentosCsv = async (
  filters: RepositorioDocumentosExportQuery,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDocumentosExportResult> => {
  const tenant = requireTenant(tenantInput);
  const { items, total } = await loadUnifiedDocuments(filters, tenant);
  const headers = [
    'origen',
    'documento_id',
    'empresa_id',
    'contrato_id',
    'persona_id',
    'vinculacion_id',
    'tipo_documento_id',
    'nombre_tipo_documento',
    'nombre_archivo',
    'mime_type',
    'tamano_bytes',
    'fecha_expedicion',
    'fecha_vencimiento',
    'fecha_carga',
    'version',
    'es_vigente',
    'estado_documental'
  ];

  const lines = [
    headers.join(','),
    ...items.map((item) =>
      [
        item.origen,
        item.documento_id,
        item.empresa_id,
        item.contrato_id,
        item.persona_id,
        item.vinculacion_id,
        item.tipo_documento_id,
        item.nombre_tipo_documento,
        item.nombre_archivo,
        item.mime_type,
        item.tamano_bytes,
        item.fecha_expedicion,
        item.fecha_vencimiento,
        item.fecha_carga,
        item.version,
        item.es_vigente,
        item.estado_documental
      ]
        .map(escapeCsv)
        .join(',')
    )
  ];

  await recordRepositorioAudit({
    accion: 'EXPORTACION_REPOSITORIO_DOCUMENTAL',
    descripcion: 'Exportacion CSV del repositorio documental unificado',
    entidad_id: COLLECTION_ENTITY_ID,
    usuario_id: actorUserId,
    datos_nuevos: {
      filtros: filters,
      total
    },
    ip_address: auditMeta?.ip_address ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return {
    csv: `${lines.join('\n')}\n`,
    total
  };
};

export const getRepositorioDocumentosIndicadores = async (
  filters: RepositorioDocumentosIndicadoresQuery,
  tenantInput: TenantAccessContext | undefined,
  actorUserId: string,
  auditMeta?: RepositorioAuditMeta
): Promise<RepositorioDocumentosIndicadoresResult> => {
  const tenant = requireTenant(tenantInput);
  const { items } = await loadUnifiedDocuments(filters, tenant);
  const alertas = await buildAlertasIndicators(filters, tenant);
  const tipoMap = new Map<string, { nombre_tipo_documento: string | null; tipo_documento_id: number | null; total: number }>();
  const empresaMap = new Map<string, { empresa_id: number | null; nombre_empresa: string | null; total: number }>();
  const contratoMap = new Map<string, { contrato_id: number | null; numero_contrato: string | null; total: number }>();

  let totalPersona = 0;
  let totalVinculacion = 0;
  let totalGenerados = 0;
  let vigentes = 0;
  let vencidos = 0;
  let reemplazados = 0;
  let sinVencimiento = 0;
  let porVencer30Dias = 0;

  for (const item of items) {
    if (item.origen === 'persona') {
      totalPersona += 1;
    } else if (item.origen === 'vinculacion') {
      totalVinculacion += 1;
    } else {
      totalGenerados += 1;
    }

    if (item.estado_documental === 'vigente') {
      vigentes += 1;
    } else if (item.estado_documental === 'vencido') {
      vencidos += 1;
    } else if (item.estado_documental === 'reemplazado') {
      reemplazados += 1;
    } else {
      sinVencimiento += 1;
    }

    if (item.fecha_vencimiento && item.estado_documental !== 'reemplazado') {
      const remainingDays = daysUntil(item.fecha_vencimiento);

      if (remainingDays >= 0 && remainingDays <= 30) {
        porVencer30Dias += 1;
      }
    }

    const tipoKey = `${item.tipo_documento_id ?? 'null'}|${item.nombre_tipo_documento ?? ''}`;
    if (!tipoMap.has(tipoKey)) {
      tipoMap.set(tipoKey, {
        tipo_documento_id: item.tipo_documento_id,
        nombre_tipo_documento: item.nombre_tipo_documento,
        total: 0
      });
    }

    const tipoEntry = tipoMap.get(tipoKey);
    if (tipoEntry) {
      tipoEntry.total += 1;
    }

    const empresaKey = `${item.empresa_id ?? 'null'}|${item.empresa?.nombre_empresa ?? ''}`;
    if (!empresaMap.has(empresaKey)) {
      empresaMap.set(empresaKey, {
        empresa_id: item.empresa_id,
        nombre_empresa: item.empresa?.nombre_empresa ?? null,
        total: 0
      });
    }

    const empresaEntry = empresaMap.get(empresaKey);
    if (empresaEntry) {
      empresaEntry.total += 1;
    }

    const contratoKey = `${item.contrato_id ?? 'null'}|${item.contrato?.numero_contrato ?? ''}`;
    if (!contratoMap.has(contratoKey)) {
      contratoMap.set(contratoKey, {
        contrato_id: item.contrato_id,
        numero_contrato: item.contrato?.numero_contrato ?? null,
        total: 0
      });
    }

    const contratoEntry = contratoMap.get(contratoKey);
    if (contratoEntry) {
      contratoEntry.total += 1;
    }
  }

  const indicadores: RepositorioDocumentosIndicadoresResult = {
    total_documentos: items.length,
    total_persona: totalPersona,
    total_vinculacion: totalVinculacion,
    total_generados: totalGenerados,
    vigentes,
    vencidos,
    reemplazados,
    sin_vencimiento: sinVencimiento,
    por_vencer_30_dias: porVencer30Dias,
    total_alertas_activas: alertas.total_alertas_activas,
    alertas_criticas: alertas.alertas_criticas,
    documentos_por_tipo: Array.from(tipoMap.values()).sort((left, right) => right.total - left.total),
    documentos_por_empresa: Array.from(empresaMap.values()).sort((left, right) => right.total - left.total),
    documentos_por_contrato: Array.from(contratoMap.values()).sort((left, right) => right.total - left.total)
  };

  await recordRepositorioAudit({
    accion: 'CONSULTA_INDICADORES_DOCUMENTALES',
    descripcion: 'Consulta de indicadores del repositorio documental',
    entidad_id: COLLECTION_ENTITY_ID,
    usuario_id: actorUserId,
    datos_nuevos: {
      filtros: filters,
      total_documentos: indicadores.total_documentos
    },
    ip_address: auditMeta?.ip_address ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return indicadores;
};
