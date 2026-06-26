import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import {
  CreateVinculacionInput,
  ListVinculacionesQuery,
  ReactivarVinculacionInput,
  RetirarVinculacionInput,
  SuspenderVinculacionInput,
  UpdateVinculacionInput,
  VinculacionEstado
} from './vinculaciones.schemas';

interface VinculacionRow extends QueryResultRow {
  contrato_cargo_id: number | string;
  contrato_id: number | string;
  contrato_empresa_id: number | string | null;
  cuenta_como_experiencia: boolean | null;
  empresa_id: number | string;
  estado_vinculacion: string | null;
  fecha_fin: string | Date | null;
  fecha_inicio: string | Date;
  id: number | string;
  metodo_pago: string | null;
  motivo_retiro: string | null;
  persona_id: number | string;
  tipo_vinculacion_id: number | string;
}

interface CountRow extends QueryResultRow {
  total: number;
}

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

export interface Vinculacion {
  contrato_cargo_id: number;
  contrato_id: number;
  contrato_empresa_id: number | null;
  cuenta_como_experiencia: boolean;
  empresa_id: number;
  estado_vinculacion: VinculacionEstado;
  fecha_fin: string | null;
  fecha_inicio: string;
  id: number;
  metodo_pago: string | null;
  motivo_retiro: string | null;
  persona_id: number;
  tipo_vinculacion_id: number;
}

export interface PaginatedVinculaciones {
  items: Vinculacion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

interface AuditPayload {
  action:
    | 'VINCULACION_CREATE'
    | 'VINCULACION_UPDATE'
    | 'VINCULACION_RETIRAR'
    | 'VINCULACION_SUSPENDER'
    | 'VINCULACION_REACTIVAR';
  actorUserId: number;
  after?: Vinculacion;
  before?: Vinculacion;
  metadata?: Record<string, unknown>;
}

interface PersonaExpedienteRow extends QueryResultRow {
  barrio: string | null;
  ciudad_nacimiento_extranjero: string | null;
  correo: string | null;
  direccion: string | null;
  estado_civil_id: number | string | null;
  nombre_estado_civil: string | null;
  estatura: number | string | null;
  fecha_expedicion_documento: Date | string | null;
  fecha_nacimiento: Date | string | null;
  id: number | string;
  municipio_expedicion_id: number | string | null;
  municipio_nacimiento_id: number | string | null;
  municipio_residencia_id: number | string | null;
  nacimiento_extranjero: boolean | null;
  numero_documento: string;
  pais_nacimiento: string | null;
  primer_apellido: string;
  primer_nombre: string;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  sexo_id: number | string | null;
  nombre_sexo: string | null;
  telefono: string | null;
  tipo_documento_id: number | string | null;
  tipo_sangre_id: number | string | null;
  tipo_sangre_codigo: string | null;
  zona_id: number | string | null;
  nombre_zona: string | null;
}

interface AfiliacionExpedienteRow extends QueryResultRow {
  id: number | string | null;
  eps_id: number | string | null;
  eps_nombre: string | null;
  pension_id: number | string | null;
  pension_nombre: string | null;
  arl_id: number | string | null;
  arl_nombre: string | null;
  caja_compensacion_id: number | string | null;
  caja_nombre: string | null;
}

interface SimpleEntityRow extends QueryResultRow {
  id: number | string;
  nombre_cargo?: string | null;
  nombre_empresa?: string | null;
}

interface TipoVinculacionRow extends QueryResultRow {
  codigo: string;
  nombre_vinculacion: string;
}

interface DocumentoPersonaExpedienteRow extends QueryResultRow {
  archivo_path: string | null;
  documento_reemplaza_id: number | string | null;
  es_vigente: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number | string;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  version: number | string | null;
  vinculacion_id: number | string | null;
}

interface DocumentoVinculacionExpedienteRow extends QueryResultRow {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number | string;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | string | null;
  tipo_documento_codigo: string;
  tipo_documento_id: number | string;
  tipo_documento_nombre: string;
  vinculacion_id: number | string;
}

export interface DocumentoExpedientePersona {
  archivo_path: string | null;
  documento_reemplaza_id: number | null;
  es_vigente: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  persona_id: number;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  version: number;
  vinculacion_id: number | null;
}

export interface DocumentoExpedienteVinculacion {
  archivo_path: string | null;
  activo: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  mime_type: string | null;
  nombre_original: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  tamano_bytes: number | null;
  tipo_documento: {
    codigo: string;
    id: number;
    nombre_documento: string;
  };
  tipo_documento_id: number;
  vinculacion_id: number;
}

export interface VinculacionExpediente {
  cargo: {
    id: number;
    nombre_cargo: string | null;
  };
  checklist: Awaited<ReturnType<typeof getVinculacionChecklist>>;
  contrato: {
    id: number;
    numero_contrato: string | null;
    entidad_contratante: string | null;
    objeto_contractual: string | null;
    fecha_inicio: string | null;
    fecha_finalizacion: string | null;
  };
  documentos_persona: DocumentoExpedientePersona[];
  documentos_vinculacion: DocumentoExpedienteVinculacion[];
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  tipo_vinculacion: {
    codigo: string | null;
    id: number;
    nombre_vinculacion: string | null;
  };
  persona: {
    barrio: string | null;
    ciudad_nacimiento_extranjero: string | null;
    correo: string | null;
    direccion: string | null;
    estado_civil_id: number | null;
    estado_civil: string | null;
    estatura: number | null;
    fecha_expedicion_documento: string | null;
    fecha_nacimiento: string | null;
    id: number;
    municipio_expedicion_id: number | null;
    municipio_nacimiento_id: number | null;
    municipio_residencia_id: number | null;
    nacimiento_extranjero: boolean | null;
    numero_documento: string;
    pais_nacimiento: string | null;
    primer_apellido: string;
    primer_nombre: string;
    segundo_apellido: string | null;
    segundo_nombre: string | null;
    sexo_id: number | null;
    sexo: string | null;
    telefono: string | null;
    tipo_documento_id: number | null;
    tipo_sangre_id: number | null;
    tipo_sangre: string | null;
    zona_id: number | null;
    zona: string | null;
  };
  afiliaciones: {
    eps_id: number | null;
    eps: string | null;
    pension_id: number | null;
    pension: string | null;
    arl_id: number | null;
    arl: string | null;
    caja_compensacion_id: number | null;
    caja_compensacion: string | null;
  } | null;
  vinculacion: Vinculacion;
}

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const toDateString = (value: string | Date | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toNumber = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableBoolean = (value: boolean | null | undefined): boolean => {
  return value ?? false;
};

const normalizeEstado = (value: string | null): VinculacionEstado => {
  if (value === 'ACTIVA' || value === 'RETIRADA' || value === 'SUSPENDIDA') {
    return value;
  }

  if (value === 'ACTIVO') {
    return 'ACTIVA';
  }

  throw new AppError('Invalid estado_vinculacion value returned by database', 500, 'INVALID_VINCULACION_STATE', {
    value
  });
};

const mapVinculacion = (row: VinculacionRow): Vinculacion => {
  return {
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    empresa_id: toNumber(row.empresa_id),
    contrato_id: toNumber(row.contrato_id),
    contrato_empresa_id: row.contrato_empresa_id === null ? null : toNumber(row.contrato_empresa_id),
    tipo_vinculacion_id: toNumber(row.tipo_vinculacion_id),
    contrato_cargo_id: toNumber(row.contrato_cargo_id),
    fecha_inicio: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin),
    estado_vinculacion: normalizeEstado(row.estado_vinculacion),
    motivo_retiro: row.motivo_retiro,
    cuenta_como_experiencia: toNullableBoolean(row.cuenta_como_experiencia),
    metodo_pago: row.metodo_pago
  };
};

const mapPersonaExpediente = (row: PersonaExpedienteRow): VinculacionExpediente['persona'] => {
  return {
    id: toNumber(row.id),
    tipo_documento_id: row.tipo_documento_id === null ? null : toNumber(row.tipo_documento_id),
    numero_documento: row.numero_documento,
    primer_nombre: row.primer_nombre,
    segundo_nombre: row.segundo_nombre,
    primer_apellido: row.primer_apellido,
    segundo_apellido: row.segundo_apellido,
    fecha_nacimiento: toDateString(row.fecha_nacimiento),
    fecha_expedicion_documento: toDateString(row.fecha_expedicion_documento),
    municipio_nacimiento_id:
      row.municipio_nacimiento_id === null ? null : toNumber(row.municipio_nacimiento_id),
    municipio_expedicion_id:
      row.municipio_expedicion_id === null ? null : toNumber(row.municipio_expedicion_id),
    municipio_residencia_id:
      row.municipio_residencia_id === null ? null : toNumber(row.municipio_residencia_id),
    sexo_id: row.sexo_id === null ? null : toNumber(row.sexo_id),
    sexo: row.nombre_sexo ?? null,
    estado_civil_id: row.estado_civil_id === null ? null : toNumber(row.estado_civil_id),
    estado_civil: row.nombre_estado_civil ?? null,
    tipo_sangre_id: row.tipo_sangre_id === null ? null : toNumber(row.tipo_sangre_id),
    tipo_sangre: row.tipo_sangre_codigo ?? null,
    estatura: row.estatura === null ? null : toNumber(row.estatura),
    telefono: row.telefono,
    correo: row.correo,
    direccion: row.direccion,
    barrio: row.barrio,
    zona_id: row.zona_id === null ? null : toNumber(row.zona_id),
    zona: row.nombre_zona ?? null,
    pais_nacimiento: row.pais_nacimiento,
    nacimiento_extranjero: row.nacimiento_extranjero,
    ciudad_nacimiento_extranjero: row.ciudad_nacimiento_extranjero
  };
};

const mapDocumentoPersonaExpediente = (
  row: DocumentoPersonaExpedienteRow
): DocumentoExpedientePersona => {
  return {
    id: toNumber(row.id),
    persona_id: toNumber(row.persona_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    vinculacion_id: row.vinculacion_id === null ? null : toNumber(row.vinculacion_id),
    version: row.version === null ? 1 : toNumber(row.version),
    documento_reemplaza_id:
      row.documento_reemplaza_id === null ? null : toNumber(row.documento_reemplaza_id),
    es_vigente: row.es_vigente,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes)
  };
};

const mapDocumentoVinculacionExpediente = (
  row: DocumentoVinculacionExpedienteRow
): DocumentoExpedienteVinculacion => {
  return {
    id: toNumber(row.id),
    vinculacion_id: toNumber(row.vinculacion_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_documento: {
      id: toNumber(row.tipo_documento_id),
      codigo: row.tipo_documento_codigo,
      nombre_documento: row.tipo_documento_nombre
    },
    fecha_expedicion: toDateString(row.fecha_expedicion),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    archivo_path: row.archivo_path,
    fecha_carga: toDateString(row.fecha_carga),
    activo: row.activo,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    nombre_original: row.nombre_original,
    mime_type: row.mime_type,
    tamano_bytes: row.tamano_bytes === null ? null : toNumber(row.tamano_bytes)
  };
};

const getVinculacionSelect = (): string => {
  return `
    SELECT
      v.id,
      v.persona_id,
      v.empresa_id,
      v.contrato_id,
      c.empresa_id AS contrato_empresa_id,
      v.tipo_vinculacion_id,
      v.contrato_cargo_id,
      v.fecha_inicio,
      v.fecha_fin,
      v.estado_vinculacion,
      v.motivo_retiro,
      v.cuenta_como_experiencia,
      v.metodo_pago
    FROM vinculaciones v
    INNER JOIN contratos c ON c.id = v.contrato_id
  `;
};

const isTenantGlobalAdmin = (tenant?: TenantAccessContext): boolean => {
  return tenant?.isGlobalAdmin ?? false;
};

const ensureVinculacionTenantAccess = (
  tenant: TenantAccessContext | undefined,
  row: Pick<VinculacionRow, 'contrato_empresa_id' | 'contrato_id'> | null
): void => {
  if (!tenant || isTenantGlobalAdmin(tenant)) {
    return;
  }

  if (!row) {
    return;
  }

  if (tenant.contratoIds.includes(toNumber(row.contrato_id))) {
    return;
  }

  if (row.contrato_empresa_id !== null && tenant.empresaIds.includes(toNumber(row.contrato_empresa_id))) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureContractTenantAccess = async (
  client: PoolClient,
  tenant: TenantAccessContext | undefined,
  contratoId: number
): Promise<void> => {
  if (!tenant || isTenantGlobalAdmin(tenant)) {
    return;
  }

  if (tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (tenant.empresaIds.length === 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const result = await client.query<{ empresa_id: string | number | null }>(
    `
      SELECT empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (contrato?.empresa_id !== null && contrato?.empresa_id !== undefined) {
    const empresaId = toNumber(contrato.empresa_id);

    if (tenant.empresaIds.includes(empresaId)) {
      return;
    }
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureEntityExists = async (
  client: PoolClient,
  tableName: 'personas' | 'empresas' | 'contratos' | 'contrato_cargos' | 'tipos_vinculacion',
  entityId: number,
  errorCode: string,
  label: string
): Promise<void> => {
  const result = await client.query<ExistsRow>(
    `SELECT EXISTS (SELECT 1 FROM ${tableName} WHERE id = $1::bigint) AS exists`,
    [entityId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError(`${label} not found`, 400, errorCode, { id: entityId });
  }
};

const validateForeignKeys = async (
  client: PoolClient,
  values: {
    contrato_cargo_id: number;
    contrato_id: number;
    empresa_id: number;
    persona_id: number;
    tipo_vinculacion_id: number;
  }
): Promise<void> => {
  await ensureEntityExists(client, 'personas', values.persona_id, 'PERSONA_NOT_FOUND', 'Persona');
  await ensureEntityExists(client, 'empresas', values.empresa_id, 'EMPRESA_NOT_FOUND', 'Empresa');
  await ensureEntityExists(client, 'contratos', values.contrato_id, 'CONTRATO_NOT_FOUND', 'Contrato');
  await ensureEntityExists(
    client,
    'tipos_vinculacion',
    values.tipo_vinculacion_id,
    'TIPO_VINCULACION_NOT_FOUND',
    'Tipo vinculacion'
  );
  await ensureEntityExists(
    client,
    'contrato_cargos',
    values.contrato_cargo_id,
    'CONTRATO_CARGO_NOT_FOUND',
    'Contrato cargo'
  );
};

const ensureActiveUniqueness = async (
  client: PoolClient,
  values: {
    contrato_id: number;
    persona_id: number;
  },
  excludedVinculacionId?: number
): Promise<void> => {
  const params: unknown[] = [values.persona_id, values.contrato_id];
  let query = `
    SELECT id
    FROM vinculaciones
    WHERE persona_id = $1::bigint
      AND contrato_id = $2::bigint
      AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
  `;

  if (excludedVinculacionId !== undefined) {
    params.push(excludedVinculacionId);
    query += ` AND id <> $${params.length}::bigint`;
  }

  query += ' LIMIT 1';

  const result = await client.query<{ id: number | string }>(query, params);

  if ((result.rowCount ?? 0) > 0) {
    throw new AppError(
      'A person can only have one active vinculacion per contract',
      409,
      'VINCULACION_ACTIVE_CONFLICT',
      values
    );
  }
};

const getVinculacionRowById = async (
  client: PoolClient,
  vinculacionId: number
): Promise<VinculacionRow | null> => {
  const result = await client.query<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  return result.rows[0] ?? null;
};

const recordAudit = async (
  client: PoolClient,
  vinculacionId: number,
  payload: AuditPayload
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: String(payload.actorUserId),
    accion: payload.action,
    tabla: 'vinculaciones',
    registro_id: String(vinculacionId),
    descripcion: payload.metadata?.observacion
      ? String(payload.metadata.observacion)
      : `Registro de vinculacion ${payload.action.toLowerCase()}`,
    before: payload.before,
    after: payload.after,
    ip: null,
    user_agent: null
  });
};

export const listVinculaciones = async (
  filters: ListVinculacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedVinculaciones> => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tenant && !tenant.isGlobalAdmin) {
    if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      const tenantClauses: string[] = [];

      if (tenant.contratoIds.length > 0) {
        params.push(tenant.contratoIds);
        tenantClauses.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      if (tenant.empresaIds.length > 0) {
        params.push(tenant.empresaIds);
        tenantClauses.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      conditions.push(`(${tenantClauses.join(' OR ')})`);
    }
  }

  if (filters.persona_id !== undefined && filters.persona_id !== null) {
    params.push(filters.persona_id);
    conditions.push(`v.persona_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.empresa_id !== undefined && filters.empresa_id !== null) {
    params.push(filters.empresa_id);
    conditions.push(`v.empresa_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.contrato_id !== undefined && filters.contrato_id !== null) {
    params.push(filters.contrato_id);
    conditions.push(`v.contrato_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.tipo_vinculacion_id !== undefined && filters.tipo_vinculacion_id !== null) {
    params.push(filters.tipo_vinculacion_id);
    conditions.push(`v.tipo_vinculacion_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.contrato_cargo_id !== undefined && filters.contrato_cargo_id !== null) {
    params.push(filters.contrato_cargo_id);
    conditions.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
    paramIndex += 1;
  }

  if (filters.estado_vinculacion) {
    if (filters.estado_vinculacion === 'ACTIVA') {
      conditions.push(`v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')`);
    } else {
      params.push(filters.estado_vinculacion);
      conditions.push(`v.estado_vinculacion = $${paramIndex}`);
      paramIndex += 1;
    }
  }

  if (filters.fecha_inicio_desde) {
    params.push(filters.fecha_inicio_desde);
    conditions.push(`v.fecha_inicio >= $${paramIndex}`);
    paramIndex += 1;
  }

  if (filters.fecha_inicio_hasta) {
    params.push(filters.fecha_inicio_hasta);
    conditions.push(`v.fecha_inicio <= $${paramIndex}`);
    paramIndex += 1;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculaciones v
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      ${whereClause}
      ORDER BY v.fecha_inicio DESC, v.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapVinculacion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getVinculacionById = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion | null> => {
  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE v.id = $1::bigint
      LIMIT 1
    `,
    [vinculacionId]
  );

  const row = result.rows[0];

  ensureVinculacionTenantAccess(tenant, row ?? null);

  return row ? mapVinculacion(row) : null;
};

export const getVinculacionExpediente = async (
  vinculacionId: number,
  tenant?: TenantAccessContext
): Promise<VinculacionExpediente> => {
  const vinculacion = await getVinculacionById(vinculacionId, tenant);

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  const [
    personaResult,
    empresaResult,
    contratoResult,
    cargoResult,
    tipoVinculacionResult,
    documentosPersonaResult,
    documentosVinculacionResult,
    checklist,
    afiliacionResult
  ] = await Promise.all([
    dbQuery<PersonaExpedienteRow>(
      `
        SELECT
          p.id,
          p.tipo_documento_id,
          p.numero_documento,
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          p.fecha_nacimiento,
          p.fecha_expedicion_documento,
          p.municipio_nacimiento_id,
          p.municipio_expedicion_id,
          p.municipio_residencia_id,
          p.sexo_id,
          s.nombre_sexo,
          p.estado_civil_id,
          ec.nombre_estado_civil,
          p.tipo_sangre_id,
          ts.codigo AS tipo_sangre_codigo,
          p.estatura,
          p.telefono,
          p.correo,
          p.direccion,
          p.barrio,
          p.zona_id,
          z.nombre_zona,
          p.pais_nacimiento,
          p.nacimiento_extranjero,
          p.ciudad_nacimiento_extranjero
        FROM personas p
        LEFT JOIN sexo s ON s.id = p.sexo_id
        LEFT JOIN estados_civiles ec ON ec.id = p.estado_civil_id
        LEFT JOIN tipos_sangre ts ON ts.id = p.tipo_sangre_id
        LEFT JOIN zonas z ON z.id = p.zona_id
        WHERE p.id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.persona_id]
    ),
    dbQuery<SimpleEntityRow>(
      `
        SELECT id, nombre_empresa
        FROM empresas
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.empresa_id]
    ),
    dbQuery<
      QueryResultRow & {
        entidad_contratante: string | null;
        fecha_finalizacion: Date | string | null;
        fecha_inicio: Date | string | null;
        id: number | string;
        numero_contrato: string | null;
        objeto_contractual: string | null;
      }
    >(
      `
        SELECT
          id,
          numero_contrato,
          entidad_contratante,
          objeto_contractual,
          fecha_inicio,
          fecha_finalizacion
        FROM contratos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.contrato_id]
    ),
    dbQuery<SimpleEntityRow>(
      `
        SELECT id, nombre_cargo
        FROM contrato_cargos
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.contrato_cargo_id]
    ),
    dbQuery<TipoVinculacionRow>(
      `
        SELECT codigo, nombre_vinculacion
        FROM tipos_vinculacion
        WHERE id = $1::bigint
        LIMIT 1
      `,
      [vinculacion.tipo_vinculacion_id]
    ),
    dbQuery<DocumentoPersonaExpedienteRow>(
      `
        SELECT
          dp.id,
          dp.persona_id,
          dp.tipo_documento_id,
          td.codigo AS tipo_documento_codigo,
          td.nombre_documento AS tipo_documento_nombre,
          dp.fecha_expedicion,
          dp.fecha_vencimiento,
          dp.archivo_path,
          dp.fecha_carga,
          dp.vinculacion_id,
          dp.version,
          dp.documento_reemplaza_id,
          dp.es_vigente,
          dp.storage_bucket,
          dp.storage_path,
          dp.nombre_original,
          dp.mime_type,
          dp.tamano_bytes
        FROM documentos_persona dp
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.persona_id = $1::bigint
          AND dp.activo = TRUE
        ORDER BY dp.es_vigente DESC, dp.tipo_documento_id ASC, dp.version DESC, dp.fecha_carga DESC, dp.id DESC
      `,
      [vinculacion.persona_id]
    ),
    dbQuery<DocumentoVinculacionExpedienteRow>(
      `
        SELECT
          dv.id,
          dv.vinculacion_id,
          dv.tipo_documento_id,
          td.codigo AS tipo_documento_codigo,
          td.nombre_documento AS tipo_documento_nombre,
          dv.fecha_expedicion,
          dv.fecha_vencimiento,
          dv.archivo_path,
          dv.fecha_carga,
          dv.activo,
          dv.storage_bucket,
          dv.storage_path,
          dv.nombre_original,
          dv.mime_type,
          dv.tamano_bytes
        FROM documentos_vinculacion dv
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        WHERE dv.vinculacion_id = $1::bigint
          AND dv.activo = TRUE
        ORDER BY dv.fecha_carga DESC, dv.id DESC
      `,
      [vinculacion.id]
    ),
    getVinculacionChecklist(String(vinculacion.id), tenant),
    dbQuery<AfiliacionExpedienteRow>(
      `
        SELECT
          va.id,
          va.eps_id,
          e.nombre AS eps_nombre,
          va.pension_id,
          fp.nombre AS pension_nombre,
          va.arl_id,
          a.nombre AS arl_nombre,
          va.caja_compensacion_id,
          cc.nombre AS caja_nombre
        FROM vinculacion_afiliaciones va
        LEFT JOIN eps e ON e.id = va.eps_id
        LEFT JOIN fondos_pension fp ON fp.id = va.pension_id
        LEFT JOIN arl a ON a.id = va.arl_id
        LEFT JOIN cajas_compensacion cc ON cc.id = va.caja_compensacion_id
        WHERE va.vinculacion_id = $1::bigint
          AND va.activo = TRUE
        ORDER BY va.fecha_afiliacion DESC NULLS LAST, va.id DESC
        LIMIT 1
      `,
      [vinculacion.id]
    )
  ]);

  const personaRow = personaResult.rows[0];
  const empresaRow = empresaResult.rows[0];
  const contratoRow = contratoResult.rows[0];
  const cargoRow = cargoResult.rows[0];
  const tipoVinculacionRow = tipoVinculacionResult.rows[0];
  const afiliacionRow = afiliacionResult.rows[0] ?? null;

  if (!personaRow) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }

  if (!empresaRow) {
    throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND');
  }

  if (!contratoRow) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!cargoRow) {
    throw new AppError('Contrato cargo not found', 404, 'CONTRATO_CARGO_NOT_FOUND');
  }

  if (!tipoVinculacionRow) {
    throw new AppError('Tipo vinculacion not found', 404, 'TIPO_VINCULACION_NOT_FOUND');
  }

  return {
    vinculacion,
    persona: mapPersonaExpediente(personaRow),
    empresa: {
      id: toNumber(empresaRow.id),
      nombre_empresa: empresaRow.nombre_empresa ?? null
    },
    contrato: {
      id: toNumber(contratoRow.id),
      numero_contrato: contratoRow.numero_contrato ?? null,
      entidad_contratante: contratoRow.entidad_contratante ?? null,
      objeto_contractual: contratoRow.objeto_contractual ?? null,
      fecha_inicio: toDateString(contratoRow.fecha_inicio),
      fecha_finalizacion: toDateString(contratoRow.fecha_finalizacion)
    },
    cargo: {
      id: toNumber(cargoRow.id),
      nombre_cargo: cargoRow.nombre_cargo ?? null
    },
    tipo_vinculacion: {
      id: toNumber(vinculacion.tipo_vinculacion_id),
      codigo: tipoVinculacionRow.codigo,
      nombre_vinculacion: tipoVinculacionRow.nombre_vinculacion
    },
    documentos_persona: documentosPersonaResult.rows.map(mapDocumentoPersonaExpediente),
    documentos_vinculacion: documentosVinculacionResult.rows.map(mapDocumentoVinculacionExpediente),
    checklist,
    afiliaciones: afiliacionRow
      ? {
          eps_id: afiliacionRow.eps_id === null ? null : toNumber(afiliacionRow.eps_id),
          eps: afiliacionRow.eps_nombre,
          pension_id: afiliacionRow.pension_id === null ? null : toNumber(afiliacionRow.pension_id),
          pension: afiliacionRow.pension_nombre,
          arl_id: afiliacionRow.arl_id === null ? null : toNumber(afiliacionRow.arl_id),
          arl: afiliacionRow.arl_nombre,
          caja_compensacion_id:
            afiliacionRow.caja_compensacion_id === null
              ? null
              : toNumber(afiliacionRow.caja_compensacion_id),
          caja_compensacion: afiliacionRow.caja_nombre
        }
      : null
  };
};

export const getVinculacionesByPersonaId = async (
  personaId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion[]> => {
  const conditions: string[] = [`v.persona_id = $1::bigint`];
  const params: unknown[] = [personaId];
  let paramIndex = 2;

  if (tenant && !tenant.isGlobalAdmin) {
    if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      const tenantClauses: string[] = [];

      if (tenant.contratoIds.length > 0) {
        params.push(tenant.contratoIds);
        tenantClauses.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      if (tenant.empresaIds.length > 0) {
        params.push(tenant.empresaIds);
        tenantClauses.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
        paramIndex += 1;
      }

      conditions.push(`(${tenantClauses.join(' OR ')})`);
    }
  }

  const result = await dbQuery<VinculacionRow>(
    `
      ${getVinculacionSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.fecha_inicio DESC, v.id DESC
    `,
    params
  );

  return result.rows.map(mapVinculacion);
};

export const createVinculacion = async (
  input: CreateVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateForeignKeys(client, input);
    await ensureContractTenantAccess(client, tenant, input.contrato_id);

    if (input.estado_vinculacion === 'ACTIVA') {
      await ensureActiveUniqueness(client, {
        persona_id: input.persona_id,
        contrato_id: input.contrato_id
      });
    }

    const result = await client.query<VinculacionRow>(
      `
        INSERT INTO vinculaciones (
          persona_id,
          empresa_id,
          contrato_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          cuenta_como_experiencia,
          metodo_pago
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5::bigint,
          $6::date,
          $7::date,
          $8,
          $9,
          $10
        )
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [
        input.persona_id,
        input.empresa_id,
        input.contrato_id,
        input.tipo_vinculacion_id,
        input.contrato_cargo_id,
        input.fecha_inicio,
        input.fecha_fin,
        input.estado_vinculacion,
        input.cuenta_como_experiencia,
        input.metodo_pago
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create vinculacion', 500, 'VINCULACION_CREATION_FAILED');
    }

    const createdVinculacion = mapVinculacion(created);

    await recordAudit(client, createdVinculacion.id, {
      action: 'VINCULACION_CREATE',
      actorUserId,
      after: createdVinculacion,
      metadata: {
        campo_modificado: 'vinculacion'
      }
    });

    await client.query('COMMIT');
    return createdVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateVinculacion = async (
  vinculacionId: number,
  input: UpdateVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);
    const nextValues = {
      persona_id: hasOwn(input, 'persona_id') ? input.persona_id ?? current.persona_id : current.persona_id,
      empresa_id: hasOwn(input, 'empresa_id') ? input.empresa_id ?? current.empresa_id : current.empresa_id,
      contrato_id: hasOwn(input, 'contrato_id') ? input.contrato_id ?? current.contrato_id : current.contrato_id,
      tipo_vinculacion_id: hasOwn(input, 'tipo_vinculacion_id')
        ? input.tipo_vinculacion_id ?? current.tipo_vinculacion_id
        : current.tipo_vinculacion_id,
      contrato_cargo_id: hasOwn(input, 'contrato_cargo_id')
        ? input.contrato_cargo_id ?? current.contrato_cargo_id
        : current.contrato_cargo_id,
      fecha_inicio: hasOwn(input, 'fecha_inicio') ? input.fecha_inicio ?? current.fecha_inicio : current.fecha_inicio,
      fecha_fin: hasOwn(input, 'fecha_fin') ? input.fecha_fin ?? null : current.fecha_fin,
      estado_vinculacion: hasOwn(input, 'estado_vinculacion')
        ? input.estado_vinculacion ?? current.estado_vinculacion
        : current.estado_vinculacion,
      cuenta_como_experiencia: hasOwn(input, 'cuenta_como_experiencia')
        ? input.cuenta_como_experiencia ?? current.cuenta_como_experiencia
        : current.cuenta_como_experiencia,
      metodo_pago: hasOwn(input, 'metodo_pago') ? input.metodo_pago ?? null : current.metodo_pago
    };

    await validateForeignKeys(client, {
      persona_id: nextValues.persona_id,
      empresa_id: nextValues.empresa_id,
      contrato_id: nextValues.contrato_id,
      tipo_vinculacion_id: nextValues.tipo_vinculacion_id,
      contrato_cargo_id: nextValues.contrato_cargo_id
    });

    if (nextValues.estado_vinculacion === 'ACTIVA') {
      await ensureActiveUniqueness(
        client,
        {
          persona_id: nextValues.persona_id,
          contrato_id: nextValues.contrato_id
        },
        vinculacionId
      );
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          persona_id = $2::bigint,
          empresa_id = $3::bigint,
          contrato_id = $4::bigint,
          tipo_vinculacion_id = $5::bigint,
          contrato_cargo_id = $6::bigint,
          fecha_inicio = $7::date,
          fecha_fin = $8::date,
          estado_vinculacion = $9,
          cuenta_como_experiencia = $10,
          metodo_pago = $11
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [
        vinculacionId,
        nextValues.persona_id,
        nextValues.empresa_id,
        nextValues.contrato_id,
        nextValues.tipo_vinculacion_id,
        nextValues.contrato_cargo_id,
        nextValues.fecha_inicio,
        nextValues.fecha_fin,
        nextValues.estado_vinculacion,
        nextValues.cuenta_como_experiencia,
        nextValues.metodo_pago
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to update vinculacion', 500, 'VINCULACION_UPDATE_FAILED');
    }

    const updatedVinculacion = mapVinculacion(updated);

    await recordAudit(client, updatedVinculacion.id, {
      action: 'VINCULACION_UPDATE',
      actorUserId,
      before: current,
      after: updatedVinculacion,
      metadata: {
        campo_modificado: 'vinculacion'
      }
    });

    await client.query('COMMIT');
    return updatedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const retirarVinculacion = async (
  vinculacionId: number,
  input: RetirarVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'RETIRADA') {
      throw new AppError('Vinculacion is already retired', 409, 'VINCULACION_ALREADY_RETIRED');
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'RETIRADA',
          fecha_fin = $2::date,
          motivo_retiro = $3
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId, input.fecha_retiro, input.motivo_retiro]
    );

    const retired = result.rows[0];

    if (!retired) {
      throw new AppError('Failed to retire vinculacion', 500, 'VINCULACION_RETIRE_FAILED');
    }

    const retiredVinculacion = mapVinculacion(retired);

    await recordAudit(client, retiredVinculacion.id, {
      action: 'VINCULACION_RETIRAR',
      actorUserId,
      before: current,
      after: retiredVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion'
      }
    });

    await client.query('COMMIT');
    return retiredVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const suspenderVinculacion = async (
  vinculacionId: number,
  input: SuspenderVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'RETIRADA') {
      throw new AppError(
        'A retired vinculacion cannot be suspended',
        409,
        'VINCULACION_RETIRED_CANNOT_SUSPEND'
      );
    }

    if (current.estado_vinculacion === 'SUSPENDIDA') {
      throw new AppError('Vinculacion is already suspended', 409, 'VINCULACION_ALREADY_SUSPENDED');
    }

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'SUSPENDIDA'
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId]
    );

    const suspended = result.rows[0];

    if (!suspended) {
      throw new AppError('Failed to suspend vinculacion', 500, 'VINCULACION_SUSPEND_FAILED');
    }

    const suspendedVinculacion = mapVinculacion(suspended);

    await recordAudit(client, suspendedVinculacion.id, {
      action: 'VINCULACION_SUSPENDER',
      actorUserId,
      before: current,
      after: suspendedVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion',
        fecha_suspension: input.fecha_suspension,
        motivo_suspension: input.motivo_suspension
      }
    });

    await client.query('COMMIT');
    return suspendedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reactivarVinculacion = async (
  vinculacionId: number,
  input: ReactivarVinculacionInput,
  actorUserId: number,
  tenant?: TenantAccessContext
): Promise<Vinculacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const currentRow = await getVinculacionRowById(client, vinculacionId);

    if (!currentRow) {
      throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
    }

    const current = mapVinculacion(currentRow);
    ensureVinculacionTenantAccess(tenant, currentRow);

    if (current.estado_vinculacion === 'ACTIVA') {
      throw new AppError('Vinculacion is already active', 409, 'VINCULACION_ALREADY_ACTIVE');
    }

    await ensureActiveUniqueness(
      client,
      {
        persona_id: current.persona_id,
        contrato_id: current.contrato_id
      },
      vinculacionId
    );

    const result = await client.query<VinculacionRow>(
      `
        UPDATE vinculaciones
        SET
          estado_vinculacion = 'ACTIVA',
          fecha_fin = NULL
        WHERE id = $1::bigint
        RETURNING
          id,
          persona_id,
          empresa_id,
          contrato_id,
          (SELECT empresa_id FROM contratos WHERE id = vinculaciones.contrato_id) AS contrato_empresa_id,
          tipo_vinculacion_id,
          contrato_cargo_id,
          fecha_inicio,
          fecha_fin,
          estado_vinculacion,
          motivo_retiro,
          cuenta_como_experiencia,
          metodo_pago
      `,
      [vinculacionId]
    );

    const reactivated = result.rows[0];

    if (!reactivated) {
      throw new AppError('Failed to reactivate vinculacion', 500, 'VINCULACION_REACTIVATE_FAILED');
    }

    const reactivatedVinculacion = mapVinculacion(reactivated);

    await recordAudit(client, reactivatedVinculacion.id, {
      action: 'VINCULACION_REACTIVAR',
      actorUserId,
      before: current,
      after: reactivatedVinculacion,
      metadata: {
        campo_modificado: 'estado_vinculacion',
        fecha_reactivacion: input.fecha_reactivacion
      }
    });

    await client.query('COMMIT');
    return reactivatedVinculacion;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
