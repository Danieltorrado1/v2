import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import {
  getVinculacionPersonalContext,
  type VinculacionPersonalContext
} from './vinculaciones.personal.service';
import {
  CreateVinculacionInput,
  ListContractPersonalQuery,
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

interface ContractPersonalRow extends QueryResultRow {
  asignacion_laboral_actual: string | null;
  institucion_actual: string | null;
  municipio_actual: string | null;
  modalidad_actual: string | null;
  perfil_licitacion_actual: string | null;
  presentada_licitacion_actual: boolean;
  cargo_nombre: string | null;
  contrato_cargo_id: number | string | null;
  contrato_id: number | string;
  es_manipuladora: boolean;
  empresa_id: number | string;
  estado_vinculacion: string | null;
  fecha_fin: string | Date | null;
  fecha_inicio: string | Date;
  numero_documento: string;
  persona_id: number | string;
  primer_apellido: string;
  primer_nombre: string;
  sede_actual: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_id: number | string;
}

export interface ContractPersonalListItem {
  asignacion_actual: {
    institucion: string | null;
    municipio: string | null;
    modalidad: string | null;
    nombre: string | null;
    sede: string | null;
  };
  cargo: {
    nombre_cargo: string | null;
  };
  es_manipuladora: boolean;
  estado_vinculacion: VinculacionEstado;
  fecha_fin: string | null;
  fecha_ingreso: string;
  nombre_completo: string;
  numero_documento: string;
  perfil_licitacion_actual: string | null;
  persona_id: number;
  presentada_licitacion_actual: boolean;
  vinculacion_id: number;
}

export interface PaginatedContractPersonal {
  items: ContractPersonalListItem[];
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
  personal_contexto: VinculacionPersonalContext;
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

const mapContractPersonal = (row: ContractPersonalRow): ContractPersonalListItem => {
  return {
    vinculacion_id: toNumber(row.vinculacion_id),
    persona_id: toNumber(row.persona_id),
    numero_documento: row.numero_documento,
    nombre_completo: [
      row.primer_nombre,
      row.segundo_nombre,
      row.primer_apellido,
      row.segundo_apellido
    ]
      .filter(Boolean)
      .join(' '),
    cargo: {
      nombre_cargo: row.cargo_nombre
    },
    es_manipuladora: row.es_manipuladora,
    estado_vinculacion: normalizeEstado(row.estado_vinculacion),
    fecha_ingreso: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin),
    asignacion_actual: {
      nombre: row.asignacion_laboral_actual,
      institucion: row.institucion_actual,
    municipio: row.municipio_actual,
      sede: row.sede_actual,
      modalidad: row.modalidad_actual
    },
    presentada_licitacion_actual: row.presentada_licitacion_actual,
    perfil_licitacion_actual: row.perfil_licitacion_actual
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

  if (tenant.contratoIds.length > 0) {
    if (tenant.contratoIds.includes(toNumber(row.contrato_id))) {
      return;
    }

    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
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

  if (tenant.contratoIds.length > 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
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
    } else if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      conditions.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    } else if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      conditions.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
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
      conditions.push(`v.estado_vinculacion = $${paramIndex}::text`);
      paramIndex += 1;
    }
  }

  if (filters.metodo_pago) {
    params.push(filters.metodo_pago);
    conditions.push(`v.metodo_pago = $${paramIndex}::text`);
    paramIndex += 1;
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
      INNER JOIN contratos c ON c.id = v.contrato_id
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

export const listContractPersonal = async (
  filters: ListContractPersonalQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedContractPersonal> => {
  const client = await dbPool.connect();

  try {
    await ensureContractTenantAccess(client, tenant, filters.contrato_id);

    const conditions: string[] = ['v.contrato_id = $1::bigint'];
    const params: unknown[] = [filters.contrato_id];
    let paramIndex = 2;

    if (filters.municipio_id !== undefined && filters.municipio_id !== null) {
      params.push(filters.municipio_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date) AND ff_f.municipio_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.institucion_id !== undefined && filters.institucion_id !== null) {
      params.push(filters.institucion_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date) AND ff_f.institucion_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.sede_id !== undefined && filters.sede_id !== null) {
      params.push(filters.sede_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date) AND ff_f.sede_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.modalidad_id !== undefined && filters.modalidad_id !== null) {
      params.push(filters.modalidad_id);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date) AND ff_f.modalidad_id = $${paramIndex}::bigint)`);
      paramIndex += 1;
    }
    if (filters.modalidad_codigo) {
      params.push(filters.modalidad_codigo);
      conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id INNER JOIN modalidades m_f ON m_f.id = ff_f.modalidad_id WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date) AND (m_f.codigo_modalidad = $${paramIndex} OR m_f.codigo_base = $${paramIndex} OR m_f.nombre_modalidad = $${paramIndex}))`);
      paramIndex += 1;
    }
    if (filters.ubicacion_laboral_id !== undefined && filters.ubicacion_laboral_id !== null) {
      params.push(filters.ubicacion_laboral_id);
      params.push(filters.fecha ?? new Date().toISOString().slice(0, 10));
      conditions.push(`EXISTS (SELECT 1 FROM personal_asignaciones_laborales pal_f WHERE pal_f.vinculacion_id = v.id AND pal_f.ubicacion_laboral_id = $${paramIndex}::bigint AND pal_f.estado = 'ACTIVA' AND pal_f.vigencia_desde <= $${paramIndex + 1}::date AND (pal_f.vigencia_hasta IS NULL OR pal_f.vigencia_hasta >= $${paramIndex + 1}::date))`);
      paramIndex += 2;
    }

    if (filters.cobertura === 'SI') { params.push(filters.fecha ?? new Date().toISOString().slice(0, 10)); conditions.push(`EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date))`); paramIndex += 1; }
    if (filters.cobertura === 'NO') { params.push(filters.fecha ?? new Date().toISOString().slice(0, 10)); conditions.push(`NOT EXISTS (SELECT 1 FROM cobertura_asignaciones ca_f WHERE ca_f.vinculacion_id = v.id AND ca_f.activo = TRUE AND ca_f.fecha_inicio <= $${paramIndex}::date AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $${paramIndex}::date))`); paramIndex += 1; }
    if (filters.cobertura === 'RETIRADA') { params.push(filters.fecha ?? new Date().toISOString().slice(0, 10)); conditions.push(`v.fecha_fin IS NOT NULL AND v.fecha_fin < $${paramIndex}::date`); paramIndex += 1; }
    if (filters.licitacion === 'PRESENTADA') { params.push(filters.fecha ?? new Date().toISOString().slice(0, 10)); conditions.push(`EXISTS (SELECT 1 FROM personal_presentaciones_licitacion ppl_f WHERE ppl_f.vinculacion_id = v.id AND ppl_f.estado = 'PRESENTADA' AND ppl_f.vigencia_desde <= $${paramIndex}::date AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $${paramIndex}::date))`); paramIndex += 1; }
    if (filters.licitacion === 'NO_PRESENTADA') { params.push(filters.fecha ?? new Date().toISOString().slice(0, 10)); conditions.push(`NOT EXISTS (SELECT 1 FROM personal_presentaciones_licitacion ppl_f WHERE ppl_f.vinculacion_id = v.id AND ppl_f.estado = 'PRESENTADA' AND ppl_f.vigencia_desde <= $${paramIndex}::date AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $${paramIndex}::date))`); paramIndex += 1; }

    if (filters.estado_vinculacion) {
      if (filters.estado_vinculacion === 'ACTIVA') {
        params.push(['ACTIVA', 'ACTIVO']);
        const estadoParam = paramIndex;
        paramIndex += 1;
        params.push(filters.fecha ?? new Date().toISOString().slice(0, 10));
        const fechaParam = paramIndex;
        conditions.push("v.estado_vinculacion = ANY($" + estadoParam + "::text[]) AND v.fecha_inicio <= $" + fechaParam + "::date AND (v.fecha_fin IS NULL OR v.fecha_fin >= $" + fechaParam + "::date)");
        paramIndex += 1;
      } else {
        params.push(filters.estado_vinculacion);
        conditions.push(`v.estado_vinculacion = $${paramIndex}`);
        paramIndex += 1;
      }
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(
        p.numero_documento ILIKE $${paramIndex}
        OR p.primer_nombre ILIKE $${paramIndex}
        OR COALESCE(p.segundo_nombre, '') ILIKE $${paramIndex}
        OR p.primer_apellido ILIKE $${paramIndex}
        OR COALESCE(p.segundo_apellido, '') ILIKE $${paramIndex}
      )`);
      paramIndex += 1;
    }

    if (filters.contrato_cargo_id !== undefined && filters.contrato_cargo_id !== null) {
      params.push(filters.contrato_cargo_id);
      conditions.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
      paramIndex += 1;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const consultaFecha = filters.fecha ?? new Date().toISOString().slice(0, 10);
    const countResult = await client.query<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM vinculaciones v
        INNER JOIN personas p ON p.id = v.persona_id
        ${whereClause}
      `,
      params
    );

    const total = countResult.rows[0]?.total ?? 0;
    const offset = (filters.page - 1) * filters.limit;
    const listParams = [...params, filters.limit, offset];
    const result = await client.query<ContractPersonalRow>(
      `
        WITH cobertura_actual AS (
          SELECT DISTINCT ON (ca.vinculacion_id)
            ca.vinculacion_id,
            ca.institucion,
            ca.sede,
            ca.modalidad,
            COALESCE(ff.municipio_texto, mu.nombre_municipio) AS municipio_actual
          FROM cobertura_asignaciones ca
          INNER JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
          LEFT JOIN municipios mu ON mu.id = ff.municipio_id
          WHERE ca.activo = TRUE
            AND ca.fecha_inicio <= DATE '${consultaFecha}'
            AND (ca.fecha_fin IS NULL OR ca.fecha_fin >= DATE '${consultaFecha}')
          ORDER BY ca.vinculacion_id, ca.fecha_inicio DESC, ca.id DESC
        ),
        asignacion_laboral_actual AS (
          SELECT DISTINCT ON (pal.vinculacion_id)
            pal.vinculacion_id,
            cul.nombre_ubicacion
          FROM personal_asignaciones_laborales pal
          INNER JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
          WHERE pal.estado = 'ACTIVA'
            AND pal.vigencia_desde <= DATE '${consultaFecha}'
            AND (pal.vigencia_hasta IS NULL OR pal.vigencia_hasta >= DATE '${consultaFecha}')
          ORDER BY pal.vinculacion_id, pal.vigencia_desde DESC, pal.id DESC
        ),
        presentacion_licitacion_actual AS (
          SELECT DISTINCT ON (ppl.vinculacion_id)
            ppl.vinculacion_id,
            TRUE AS presentada_licitacion_actual,
            cpl.nombre_perfil AS perfil_licitacion_actual
          FROM personal_presentaciones_licitacion ppl
          INNER JOIN contrato_perfiles_licitacion cpl ON cpl.id = ppl.perfil_licitacion_id
          WHERE ppl.estado = 'PRESENTADA'
            AND ppl.vigencia_desde <= DATE '${consultaFecha}'
            AND (ppl.vigencia_hasta IS NULL OR ppl.vigencia_hasta >= DATE '${consultaFecha}')
          ORDER BY ppl.vinculacion_id, ppl.vigencia_desde DESC, ppl.id DESC
        )
        SELECT
          v.id AS vinculacion_id,
          v.persona_id,
          v.empresa_id,
          v.contrato_id,
          v.fecha_inicio,
          v.fecha_fin,
          v.estado_vinculacion,
          p.id AS persona_id,
          p.numero_documento,
          p.primer_nombre,
          p.segundo_nombre,
          p.primer_apellido,
          p.segundo_apellido,
          cc.nombre_cargo AS cargo_nombre,
          (
            COALESCE(cc.aplica_cobertura, FALSE)
            AND LOWER(COALESCE(cc.nombre_cargo, '')) LIKE '%manipulad%'
          ) AS es_manipuladora,
          ala.nombre_ubicacion AS asignacion_laboral_actual,
          caa.institucion AS institucion_actual,
          caa.municipio_actual,
          caa.sede AS sede_actual,
          caa.modalidad AS modalidad_actual,
          COALESCE(pla.presentada_licitacion_actual, FALSE) AS presentada_licitacion_actual,
          pla.perfil_licitacion_actual
        FROM vinculaciones v
        INNER JOIN personas p ON p.id = v.persona_id
        LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
        LEFT JOIN cobertura_actual caa ON caa.vinculacion_id = v.id
        LEFT JOIN asignacion_laboral_actual ala ON ala.vinculacion_id = v.id
        LEFT JOIN presentacion_licitacion_actual pla ON pla.vinculacion_id = v.id
        ${whereClause}
        ORDER BY v.fecha_inicio DESC, p.primer_apellido ASC, p.primer_nombre ASC, v.id DESC
        LIMIT $${listParams.length - 1}::int
        OFFSET $${listParams.length}::int
      `,
      listParams
    );

    return {
      items: result.rows.map(mapContractPersonal),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
      }
    };
  } finally {
    client.release();
  }
};

export interface ContractPersonalFilterOptions {
  municipios: Array<{ id: number; nombre: string }>;
  instituciones: Array<{ id: number; nombre: string; municipio_id: number | null }>;
  sedes: Array<{ id: number; nombre: string; institucion_id: number | null }>;
  modalidades: Array<{ id: number; codigo: string | null; nombre: string }>;
  ubicaciones_laborales: Array<{ id: number; nombre: string }>;
}

export const getContractPersonalFilterOptions = async (
  contratoId: number,
  filters: { municipio_id?: number | null; institucion_id?: number | null; sede_id?: number | null; fecha?: string },
  tenant?: TenantAccessContext
): Promise<ContractPersonalFilterOptions> => {
  const client = await dbPool.connect();
  try {
    await ensureContractTenantAccess(client, tenant, contratoId);
    const fecha = filters.fecha ?? new Date().toISOString().slice(0, 10);
    const base = `
      FROM focalizacion_final ff
      LEFT JOIN municipios mu ON mu.id = ff.municipio_id
      LEFT JOIN instituciones ins ON ins.id = ff.institucion_id
      LEFT JOIN sedes se ON se.id = ff.sede_id
      LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id
      WHERE ff.contrato_id = $1::bigint AND ff.activo = TRUE
        AND ($2::bigint IS NULL OR ff.municipio_id = $2::bigint)
        AND ($3::bigint IS NULL OR ff.institucion_id = $3::bigint)
        AND ($4::bigint IS NULL OR ff.sede_id = $4::bigint)
    `;
    const params = [contratoId, filters.municipio_id ?? null, filters.institucion_id ?? null, filters.sede_id ?? null, fecha];
    const [municipios, instituciones, sedes, modalidades, ubicaciones] = await Promise.all([
      client.query<{ id: number; nombre: string }>(`SELECT DISTINCT mu.id::int AS id, mu.nombre_municipio AS nombre ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string; municipio_id: number | null }>(`SELECT DISTINCT ins.id::int AS id, ins.nombre_institucion AS nombre, ins.municipio_id::int AS municipio_id ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string; institucion_id: number | null }>(`SELECT DISTINCT se.id::int AS id, se.nombre_sede AS nombre, se.institucion_id::int AS institucion_id ${base} ORDER BY nombre`, params),
      client.query<{ id: number; codigo: string | null; nombre: string }>(`SELECT DISTINCT mo.id::int AS id, COALESCE(mo.codigo_modalidad, mo.codigo_base) AS codigo, mo.nombre_modalidad AS nombre ${base} ORDER BY nombre`, params),
      client.query<{ id: number; nombre: string }>(`SELECT id::int AS id, nombre_ubicacion AS nombre FROM contrato_ubicaciones_laborales WHERE contrato_id = $1::bigint AND activo = TRUE ORDER BY nombre`, [contratoId])
    ]);
    return { municipios: municipios.rows, instituciones: instituciones.rows, sedes: sedes.rows, modalidades: modalidades.rows, ubicaciones_laborales: ubicaciones.rows };
  } finally {
    client.release();
  }
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
    afiliacionResult,
    personalContexto
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
    ),
    getVinculacionPersonalContext(vinculacion.id, tenant)
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
    personal_contexto: personalContexto,
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
    } else if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      conditions.push(`v.contrato_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    } else if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      conditions.push(`c.empresa_id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
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
