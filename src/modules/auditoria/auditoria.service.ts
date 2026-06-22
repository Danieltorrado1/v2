import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import {
  ListAuditoriaQuery,
  ListHistorialCambiosQuery,
  AuditoriaExportQuery
} from './auditoria.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface AuditEventRow extends QueryResultRow {
  accion: string;
  algoritmo?: string | null;
  created_at: Date;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  descripcion: string;
  entidad: string;
  entidad_id: string;
  empresa_id: string | null;
  contrato_id: string | null;
  fecha_evento: Date;
  id: string;
  ip_address: string | null;
  modulo: string;
  user_agent: string | null;
  usuario_email: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
}

export interface AuditoriaItem {
  accion: string;
  after: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  contrato_id: string | null;
  created_at: string;
  descripcion: string;
  entidad: string;
  entidad_id: string;
  empresa_id: string | null;
  fecha_evento: string;
  id: string;
  ip: string | null;
  ip_address: string | null;
  modulo: string;
  registro_id: string;
  tabla: string;
  user_agent: string | null;
  usuario: {
    email: string | null;
    id: string | null;
    nombre: string | null;
  };
}

export interface PaginatedAuditoria {
  items: AuditoriaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface AuditoriaExportResult {
  csv?: string;
  items: AuditoriaItem[];
}

export interface RegisterAuditEventInput {
  accion: string;
  client?: PoolClient;
  contrato_id?: string | number | null;
  datos_anteriores?: unknown;
  datos_nuevos?: unknown;
  descripcion: string;
  entidad: string;
  entidad_id: string | number;
  empresa_id?: string | number | null;
  ip_address?: string | null;
  modulo: string;
  user_agent?: string | null;
  usuario_id?: string | number | null;
}

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
};

const toDateString = (value: Date | string | null): string => {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const extractNumericLike = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
};

const extractTenantFromObject = (
  value: unknown
): { contrato_id: number | null; empresa_id: number | null } => {
  if (!isPlainObject(value)) {
    return { contrato_id: null, empresa_id: null };
  }

  return {
    contrato_id: extractNumericLike(value.contrato_id),
    empresa_id: extractNumericLike(value.empresa_id)
  };
};

const deriveModuleFromEntity = (entity: string): string => {
  const normalized = entity.trim().toLowerCase();

  if (normalized.startsWith('documentos')) {
    return 'DOCUMENTOS';
  }

  if (normalized.startsWith('plantillas')) {
    return 'PLANTILLAS';
  }

  if (normalized.startsWith('nomina')) {
    return 'NOMINA';
  }

  if (normalized.startsWith('sst')) {
    return 'SST';
  }

  if (normalized.startsWith('vincul')) {
    return 'VINCULACIONES';
  }

  if (normalized.startsWith('auditoria')) {
    return 'AUDITORIA';
  }

  return entity.toUpperCase();
};

const buildEventContext = async (
  client: PoolClient | undefined,
  input: RegisterAuditEventInput
): Promise<{
  contrato_id: number | null;
  empresa_id: number | null;
}> => {
  const explicitContratoId = input.contrato_id !== undefined ? extractNumericLike(input.contrato_id) : null;
  const explicitEmpresaId = input.empresa_id !== undefined ? extractNumericLike(input.empresa_id) : null;

  if (explicitContratoId !== null || explicitEmpresaId !== null) {
    return {
      contrato_id: explicitContratoId,
      empresa_id: explicitEmpresaId
    };
  }

  const fromNewData = extractTenantFromObject(input.datos_nuevos);
  const fromBeforeData = extractTenantFromObject(input.datos_anteriores);
  const mergedContratoId = fromNewData.contrato_id ?? fromBeforeData.contrato_id;
  const mergedEmpresaId = fromNewData.empresa_id ?? fromBeforeData.empresa_id;

  if (mergedContratoId !== null || mergedEmpresaId !== null) {
    return {
      contrato_id: mergedContratoId,
      empresa_id: mergedEmpresaId
    };
  }

  const targetVinculacionId = (() => {
    if (isPlainObject(input.datos_nuevos)) {
      const candidate = extractNumericLike(input.datos_nuevos.vinculacion_id);
      if (candidate !== null) {
        return candidate;
      }
    }

    if (isPlainObject(input.datos_anteriores)) {
      const candidate = extractNumericLike(input.datos_anteriores.vinculacion_id);
      if (candidate !== null) {
        return candidate;
      }
    }

    return null;
  })();

  if (targetVinculacionId === null) {
    return { contrato_id: null, empresa_id: null };
  }

  const runner = client ?? dbPool;
  const result = await runner.query<{ contrato_id: string | number | null; empresa_id: string | number | null }>(
    `
      SELECT
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [targetVinculacionId]
  );

  const row = result.rows[0];

  return {
    contrato_id: row?.contrato_id === null || row?.contrato_id === undefined ? null : toNumber(row.contrato_id),
    empresa_id: row?.empresa_id === null || row?.empresa_id === undefined ? null : toNumber(row.empresa_id)
  };
};

const insertAuditEventRow = async (
  client: PoolClient,
  input: RegisterAuditEventInput
): Promise<void> => {
  const tenant = await buildEventContext(client, input);

  await client.query(
    `
      INSERT INTO auditoria_eventos (
        usuario_id,
        empresa_id,
        contrato_id,
        modulo,
        entidad,
        entidad_id,
        accion,
        descripcion,
        datos_anteriores,
        datos_nuevos,
        ip_address,
        user_agent,
        fecha_evento
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3::bigint,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10::jsonb,
        $11,
        $12,
        NOW()
      )
    `,
    [
      input.usuario_id === undefined || input.usuario_id === null ? null : toNumber(input.usuario_id),
      tenant.empresa_id,
      tenant.contrato_id,
      input.modulo,
      input.entidad,
      String(input.entidad_id),
      input.accion,
      input.descripcion,
      input.datos_anteriores ? JSON.stringify(input.datos_anteriores) : null,
      input.datos_nuevos ? JSON.stringify(input.datos_nuevos) : null,
      input.ip_address ?? null,
      input.user_agent ?? null
    ]
  );
};

export const registerAuditEvent = async (input: RegisterAuditEventInput): Promise<void> => {
  if (!input.modulo || !input.entidad || !input.entidad_id || !input.accion || !input.descripcion) {
    console.error('Audit event skipped: missing required fields', {
      accion: input.accion,
      entidad: input.entidad,
      entidad_id: input.entidad_id,
      modulo: input.modulo
    });
    return;
  }

  if (input.client) {
    const savepointName = `audit_event_sp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      await input.client.query(`SAVEPOINT ${savepointName}`);
      await insertAuditEventRow(input.client, input);
      await input.client.query(`RELEASE SAVEPOINT ${savepointName}`);
    } catch (error) {
      try {
        await input.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        await input.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      } catch (rollbackError) {
        console.error('Failed to rollback audit event savepoint', rollbackError);
      }

      console.error('Failed to register audit event', {
        accion: input.accion,
        entidad: input.entidad,
        entidad_id: input.entidad_id,
        error,
        modulo: input.modulo
      });
    }

    return;
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await insertAuditEventRow(client, input);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback standalone audit event transaction', rollbackError);
    }

    console.error('Failed to register audit event', {
      accion: input.accion,
      entidad: input.entidad,
      entidad_id: input.entidad_id,
      error,
      modulo: input.modulo
    });
  } finally {
    client.release();
  }
};

const mapAuditoriaItem = (row: AuditEventRow): AuditoriaItem => {
  return {
    id: row.id,
    modulo: row.modulo,
    entidad: row.entidad,
    entidad_id: row.entidad_id,
    accion: row.accion,
    descripcion: row.descripcion,
    before: row.datos_anteriores,
    after: row.datos_nuevos,
    empresa_id: row.empresa_id,
    contrato_id: row.contrato_id,
    registro_id: row.entidad_id,
    tabla: row.entidad,
    ip: row.ip_address,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at.toISOString(),
    fecha_evento: row.fecha_evento.toISOString(),
    usuario: {
      id: row.usuario_id,
      email: row.usuario_email,
      nombre: row.usuario_nombre
    }
  };
};

const buildTenantFilter = (
  tenant: TenantAccessContext | undefined,
  alias = 'ae'
): { clauses: string[]; params: unknown[] } => {
  if (!tenant || tenant.isGlobalAdmin) {
    return { clauses: [], params: [] };
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    clauses.push(`${alias}.empresa_id = ANY($${paramIndex}::bigint[])`);
    paramIndex += 1;
  }

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    clauses.push(`${alias}.contrato_id = ANY($${paramIndex}::bigint[])`);
  }

  if (clauses.length === 0) {
    clauses.push('1 = 0');
  }

  return { clauses, params };
};

const buildFilters = (
  filters: ListAuditoriaQuery | AuditoriaExportQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.modulo) {
    params.push(filters.modulo);
    conditions.push(`ae.modulo = $${params.length}`);
  }

  if (filters.entidad) {
    params.push(filters.entidad);
    conditions.push(`ae.entidad = $${params.length}`);
  }

  if (filters.registro_id) {
    params.push(filters.registro_id);
    conditions.push(`ae.entidad_id = $${params.length}`);
  }

  if (filters.usuario_id) {
    params.push(filters.usuario_id);
    conditions.push(`ae.usuario_id::text = $${params.length}`);
  }

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`ae.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`ae.contrato_id::text = $${params.length}`);
  }

  const fechaInicio = filters.fecha_inicio ?? filters.fecha_desde ?? null;
  const fechaFin = filters.fecha_fin ?? filters.fecha_hasta ?? null;

  if (fechaInicio) {
    params.push(fechaInicio);
    conditions.push(`ae.fecha_evento::date >= $${params.length}`);
  }

  if (fechaFin) {
    params.push(fechaFin);
    conditions.push(`ae.fecha_evento::date <= $${params.length}`);
  }

  const tenantFilter = buildTenantFilter(tenant);
  if (tenantFilter.clauses.length > 0) {
    conditions.push(`(${tenantFilter.clauses.join(' OR ')})`);
    params.push(...tenantFilter.params);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const getBaseSelect = (): string => {
  return `
    SELECT
      ae.id::text AS id,
      ae.usuario_id::text AS usuario_id,
      ae.empresa_id::text AS empresa_id,
      ae.contrato_id::text AS contrato_id,
      ae.modulo,
      ae.entidad,
      ae.entidad_id,
      ae.accion,
      ae.descripcion,
      ae.datos_anteriores,
      ae.datos_nuevos,
      ae.ip_address,
      ae.user_agent,
      ae.fecha_evento,
      ae.created_at,
      u.correo AS usuario_email,
      u.nombre_completo AS usuario_nombre
    FROM auditoria_eventos ae
    LEFT JOIN usuarios u ON u.id = ae.usuario_id
  `;
};

const ensureTenantFilterScope = (
  filters: Pick<ListAuditoriaQuery, 'empresa_id' | 'contrato_id'>,
  tenant?: TenantAccessContext
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (filters.empresa_id && !tenant.empresaIds.includes(Number(filters.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (filters.contrato_id && !tenant.contratoIds.includes(Number(filters.contrato_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

export const listAuditoria = async (
  filters: ListAuditoriaQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedAuditoria> => {
  ensureTenantFilterScope(filters, tenant);
  const { params, whereClause } = buildFilters(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM auditoria_eventos ae
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<AuditEventRow>(
    `
      ${getBaseSelect()}
      ${whereClause}
      ORDER BY ae.fecha_evento DESC, ae.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapAuditoriaItem),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getAuditoriaById = async (
  id: string,
  tenant?: TenantAccessContext
): Promise<AuditoriaItem | null> => {
  const tenantFilter = buildTenantFilter(tenant);
  const params = [...tenantFilter.params, id];
  const whereClause =
    tenantFilter.clauses.length > 0
      ? `WHERE (${tenantFilter.clauses.join(' OR ')}) AND ae.id::text = $${params.length}`
      : 'WHERE ae.id::text = $1';

  const result = await dbQuery<AuditEventRow>(
    `
      ${getBaseSelect()}
      ${whereClause}
      LIMIT 1
    `,
    params
  );

  const row = result.rows[0];
  return row ? mapAuditoriaItem(row) : null;
};

export const getAuditoriaByEntidad = async (
  tabla: string,
  registroId: string,
  pagination: ListHistorialCambiosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedAuditoria> => {
  return listAuditoria(
    {
      page: pagination.page,
      limit: pagination.limit,
      entidad: tabla,
      modulo: null,
      usuario_id: null,
      empresa_id: null,
      contrato_id: null,
      fecha_inicio: null,
      fecha_fin: null,
      registro_id: registroId
    } as ListAuditoriaQuery,
    tenant
  );
};

export const getAuditoriaByUsuario = async (
  usuarioId: string,
  pagination: ListHistorialCambiosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedAuditoria> => {
  return listAuditoria(
    {
      page: pagination.page,
      limit: pagination.limit,
      usuario_id: usuarioId,
      modulo: null,
      entidad: null,
      empresa_id: null,
      contrato_id: null,
      fecha_inicio: null,
      fecha_fin: null
    } as ListAuditoriaQuery,
    tenant
  );
};

export const getHistorialCambiosByEntidad = async (
  tabla: string,
  registroId: string,
  pagination: ListHistorialCambiosQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedAuditoria> => {
  return getAuditoriaByEntidad(tabla, registroId, pagination, tenant);
};

export const exportAuditoria = async (
  filters: AuditoriaExportQuery,
  tenant?: TenantAccessContext
): Promise<AuditoriaExportResult> => {
  ensureTenantFilterScope(filters, tenant);
  const { params, whereClause } = buildFilters(filters, tenant);
  const result = await dbQuery<AuditEventRow>(
    `
      ${getBaseSelect()}
      ${whereClause}
      ORDER BY ae.fecha_evento DESC, ae.id DESC
    `,
    params
  );

  const items = result.rows.map(mapAuditoriaItem);

  if (filters.format === 'csv') {
    const headers = [
      'id',
      'fecha_evento',
      'modulo',
      'entidad',
      'entidad_id',
      'accion',
      'descripcion',
      'usuario_id',
      'empresa_id',
      'contrato_id',
      'ip_address',
      'user_agent'
    ];

    const escapeCsv = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : String(value);
      if (/["\n,;]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [
      headers.join(','),
      ...items.map((item) =>
        [
          item.id,
          item.fecha_evento,
          item.modulo,
          item.entidad,
          item.entidad_id,
          item.accion,
          item.descripcion,
          item.usuario.id,
          item.empresa_id,
          item.contrato_id,
          item.ip_address,
          item.user_agent
        ]
          .map(escapeCsv)
          .join(',')
      )
    ];

    return {
      items,
      csv: `${lines.join('\n')}\n`
    };
  }

  return {
    items
  };
};

export const requireAuditoriaItem = async (
  id: string,
  tenant?: TenantAccessContext
): Promise<AuditoriaItem> => {
  const auditoria = await getAuditoriaById(id, tenant);

  if (!auditoria) {
    throw new AppError('Audit entry not found', 404, 'AUDITORIA_NOT_FOUND');
  }

  return auditoria;
};
