import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { METODOS_PAGO } from '../vinculaciones/vinculaciones.schemas';
import type {
  ConfiguracionCargosListQuery,
  ConfiguracionCatalogListQuery,
  ConfiguracionContratosListQuery,
  ConfiguracionEmpresasListQuery,
  ConfiguracionMunicipiosListQuery,
  ConfiguracionTiposDocumentoListQuery,
  CreateContratoCargoInput,
  CreateContratoInput,
  CreateEmpresaInput,
  UpdateContratoCargoInput,
  UpdateContratoInput,
  UpdateEmpresaInput
} from './configuracion.admin.schemas';

interface CountRow extends QueryResultRow {
  total: number;
}

interface EmpresaRow extends QueryResultRow {
  activo: boolean;
  ciudad: string | null;
  correo: string | null;
  departamento: string | null;
  direccion: string | null;
  documento_representante: string | null;
  id: string;
  nit: string;
  nombre_empresa: string;
  organizacion_codigo: string | null;
  organizacion_estado: string | null;
  organizacion_id: string | null;
  organizacion_nombre: string | null;
  representante_legal: string | null;
  telefono: string | null;
  tipo_empresa: string;
}

interface OrganizacionReferenceRow extends QueryResultRow {
  codigo: string;
  estado: string;
  id: string;
  nombre: string;
}

interface ContratoRow extends QueryResultRow {
  activo: boolean;
  aplica_cobertura: boolean;
  contrato_padre_id: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  entidad_contratante: string;
  estado_contractual: string;
  fecha_final_estimada: Date | string | null;
  fecha_final_real: Date | string | null;
  fecha_finalizacion: Date | string | null;
  fecha_inicio: Date | string;
  id: string;
  numero_contrato: string;
  numero_licitacion: string | null;
  objeto_contractual: string | null;
  observaciones: string | null;
}

interface CargoRow extends QueryResultRow {
  activo: boolean;
  aplica_cobertura: boolean;
  cantidad_requerida: string | number | null;
  contrato_id: string;
  contrato_numero: string | null;
  empresa_id: string | null;
  empresa_nombre: string | null;
  id: string;
  nombre_cargo: string;
}

interface CatalogoSimpleRow extends QueryResultRow {
  activo?: boolean | null;
  categoria_documento?: string | null;
  codigo?: string | null;
  codigo_dane?: string | null;
  departamento_id?: string | null;
  es_identificacion_personal?: boolean | null;
  id: string;
  label: string;
  alcance?: string | null;
  requiere_fecha_expedicion?: boolean | null;
  requiere_fecha_vencimiento?: boolean | null;
}

interface RoleRow extends QueryResultRow {
  activo: boolean;
  descripcion: string | null;
  id: string;
  nombre_rol: string;
  permissions: string[] | null;
}

interface PermissionRow extends QueryResultRow {
  accion: string;
  activo: boolean | null;
  descripcion: string | null;
  id: string;
  modulo: string;
}

export interface ActorMeta {
  ip: string | null;
  userAgent: string | null;
  userId: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface EmpresaAdminItem {
  activo: boolean;
  ciudad: string | null;
  correo: string | null;
  departamento: string | null;
  direccion: string | null;
  documento_representante: string | null;
  id: number;
  nit: string;
  nombre_empresa: string;
  organizacion: {
    codigo: string;
    estado: string;
    id: number;
    nombre: string;
  };
  representante_legal: string | null;
  telefono: string | null;
  tipo_empresa: string;
}

export interface ContratoAdminItem {
  activo: boolean;
  aplica_cobertura: boolean;
  contrato_padre_id: number | null;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  entidad_contratante: string;
  estado_contractual: string;
  fecha_final_estimada: string | null;
  fecha_final_real: string | null;
  fecha_finalizacion: string | null;
  fecha_inicio: string;
  id: number;
  numero_contrato: string;
  numero_licitacion: string | null;
  objeto_contractual: string | null;
  observaciones: string | null;
}

export interface CargoAdminItem {
  activo: boolean;
  aplica_cobertura: boolean;
  cantidad_requerida: number | null;
  contrato: {
    id: number;
    numero_contrato: string | null;
  };
  empresa: {
    id: number | null;
    nombre_empresa: string | null;
  };
  id: number;
  nombre_cargo: string;
}

const toNumber = (value: string | number): number => {
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

  return toNumber(value);
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
};
const normalizeComparableText = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const buildPagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / limit)
});

const assertTenantContratoAccess = async (
  client: PoolClient,
  tenant: TenantAccessContext | undefined,
  contratoId: number
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin || tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (tenant.contratoIds.length > 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (tenant.empresaIds.length === 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const result = await client.query<{ empresa_id: string | null }>(
    `
      SELECT empresa_id::text AS empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const empresaId = toNullableNumber(result.rows[0]?.empresa_id ?? null);

  if (empresaId === null || !tenant.empresaIds.includes(empresaId)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const appendContractTenantClauses = (input: {
  clauses: string[];
  contratoColumn: string;
  empresaColumn: string;
  params: unknown[];
  tenant?: TenantAccessContext;
}): void => {
  const { tenant } = input;

  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const scoped: string[] = [];

  if (tenant.contratoIds.length > 0) {
    input.params.push(tenant.contratoIds);
    input.clauses.push(`${input.contratoColumn} = ANY($${input.params.length}::bigint[])`);
    return;
  }

  if (tenant.empresaIds.length > 0) {
    input.params.push(tenant.empresaIds);
    scoped.push(`${input.empresaColumn} = ANY($${input.params.length}::bigint[])`);
  }

  if (scoped.length === 0) {
    input.clauses.push('1 = 0');
    return;
  }

  input.clauses.push(`(${scoped.join(' OR ')})`);
};

const appendEmpresaTenantClauses = (input: {
  clauses: string[];
  empresaColumn: string;
  params: unknown[];
  tenant?: TenantAccessContext;
}): void => {
  const { tenant } = input;

  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  const scoped: string[] = [];

  if (tenant.empresaIds.length > 0) {
    input.params.push(tenant.empresaIds);
    scoped.push(`${input.empresaColumn} = ANY($${input.params.length}::bigint[])`);
  }

  if (tenant.contratoIds.length > 0) {
    input.params.push(tenant.contratoIds);
    scoped.push(
      `EXISTS (
        SELECT 1
        FROM contratos c_scope
        WHERE c_scope.empresa_id = ${input.empresaColumn}
          AND c_scope.id = ANY($${input.params.length}::bigint[])
      )`
    );
  }

  if (scoped.length === 0) {
    input.clauses.push('1 = 0');
    return;
  }

  input.clauses.push(`(${scoped.join(' OR ')})`);
};

const validateDateRange = (fechaInicio: string, fechaFinalizacion: string | null): void => {
  if (!fechaFinalizacion) {
    return;
  }

  if (new Date(`${fechaInicio}T00:00:00.000Z`) > new Date(`${fechaFinalizacion}T00:00:00.000Z`)) {
    throw new AppError(
      'fecha_inicio must be earlier than or equal to fecha_finalizacion',
      422,
      'INVALID_DATE_RANGE'
    );
  }
};

const mapEmpresa = (row: EmpresaRow): EmpresaAdminItem => ({
  id: toNumber(row.id),
  tipo_empresa: row.tipo_empresa,
  nombre_empresa: row.nombre_empresa,
  nit: row.nit,
  organizacion: {
    id: (() => {
      if (row.organizacion_id === null) {
        throw new AppError('Empresa organization context is missing', 500, 'EMPRESA_ORGANIZACION_MISSING');
      }

      return toNumber(row.organizacion_id);
    })(),
    codigo: row.organizacion_codigo ?? '',
    nombre: row.organizacion_nombre ?? '',
    estado: row.organizacion_estado ?? 'ACTIVA'
  },
  representante_legal: row.representante_legal,
  documento_representante: row.documento_representante,
  telefono: row.telefono,
  correo: row.correo,
  direccion: row.direccion,
  ciudad: row.ciudad,
  departamento: row.departamento,
  activo: row.activo
});

const mapContrato = (row: ContratoRow): ContratoAdminItem => ({
  id: toNumber(row.id),
  empresa: {
    id: toNumber(row.empresa_id),
    nombre_empresa: row.empresa_nombre
  },
  numero_contrato: row.numero_contrato,
  numero_licitacion: row.numero_licitacion,
  entidad_contratante: row.entidad_contratante,
  fecha_inicio: toDateString(row.fecha_inicio) as string,
  fecha_finalizacion: toDateString(row.fecha_final_estimada ?? row.fecha_finalizacion),
  fecha_final_estimada: toDateString(row.fecha_final_estimada ?? row.fecha_finalizacion),
  fecha_final_real: toDateString(row.fecha_final_real),
  estado_contractual: row.estado_contractual,
  contrato_padre_id: toNullableNumber(row.contrato_padre_id),
  objeto_contractual: row.objeto_contractual,
  observaciones: row.observaciones,
  aplica_cobertura: row.aplica_cobertura,
  activo: row.activo
});

const mapCargo = (row: CargoRow): CargoAdminItem => ({
  id: toNumber(row.id),
  nombre_cargo: row.nombre_cargo,
  cantidad_requerida: toNullableNumber(row.cantidad_requerida),
  aplica_cobertura: row.aplica_cobertura,
  activo: row.activo,
  contrato: {
    id: toNumber(row.contrato_id),
    numero_contrato: row.contrato_numero
  },
  empresa: {
    id: toNullableNumber(row.empresa_id),
    nombre_empresa: row.empresa_nombre
  }
});

const recordAudit = async (
  client: PoolClient,
  actor: ActorMeta,
  action: string,
  table: string,
  recordId: string,
  before: unknown,
  after: unknown,
  observacion?: string | null
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actor.userId,
    accion: action,
    tabla: table,
    registro_id: recordId,
    descripcion: observacion ?? `${table} ${action.toLowerCase()}`,
    before,
    after,
    ip: actor.ip,
    user_agent: actor.userAgent
  });
};

const ensureOrganizacionExists = async (client: PoolClient, organizacionId: number): Promise<{
  codigo: string;
  estado: string;
  id: number;
  nombre: string;
}> => {
  const result = await client.query<OrganizacionReferenceRow>(
    `
      SELECT
        id::text AS id,
        codigo,
        nombre,
        estado
      FROM organizaciones
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [organizacionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Organizacion not found', 404, 'ORGANIZACION_NOT_FOUND', { organizacionId });
  }

  return {
    id: toNumber(row.id),
    codigo: row.codigo,
    nombre: row.nombre,
    estado: row.estado
  };
};

const createImplicitOrganizationForCompany = async (
  client: PoolClient,
  input: { active: boolean; companyName: string }
): Promise<number> => {
  const codeSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO organizaciones (
        codigo,
        nombre,
        estado
      )
      VALUES ($1, $2, $3)
      RETURNING id::text AS id
    `,
    [
      `ORG-AUTO-${codeSuffix}`.toUpperCase(),
      input.companyName,
      input.active ? 'ACTIVA' : 'INACTIVA'
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Organizacion could not be created', 500, 'ORGANIZACION_CREATE_FAILED');
  }

  return toNumber(row.id);
};

const ensureEmpresaExists = async (
  client: PoolClient,
  empresaId: number,
  options?: { requireActive?: boolean }
): Promise<EmpresaAdminItem> => {
  const result = await client.query<EmpresaRow>(
    `
      SELECT
        e.id::text AS id,
        e.tipo_empresa,
        e.nombre_empresa,
        e.nit,
        e.organizacion_id::text AS organizacion_id,
        o.codigo AS organizacion_codigo,
        o.nombre AS organizacion_nombre,
        o.estado AS organizacion_estado,
        e.representante_legal,
        e.documento_representante,
        e.telefono,
        e.correo,
        e.direccion,
        e.ciudad,
        e.departamento,
        COALESCE(e.activo, TRUE) AS activo
      FROM empresas e
      INNER JOIN organizaciones o ON o.id = e.organizacion_id
      WHERE e.id = $1::bigint
      LIMIT 1
    `,
    [empresaId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND', { empresaId });
  }

  const empresa = mapEmpresa(row);

  if (options?.requireActive && !empresa.activo) {
    throw new AppError('Empresa is inactive', 409, 'EMPRESA_INACTIVA', { empresaId });
  }

  return empresa;
};

const ensureContratoExists = async (
  client: PoolClient,
  contratoId: number,
  options?: { forUpdate?: boolean; requireActive?: boolean }
): Promise<ContratoAdminItem> => {
  const result = await client.query<ContratoRow>(
    `
      SELECT
        c.id::text AS id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        c.numero_contrato,
        c.numero_licitacion,
        c.entidad_contratante,
        c.fecha_inicio,
        c.fecha_finalizacion,
        c.fecha_final_estimada,
        c.fecha_final_real,
        c.estado_contractual,
        c.contrato_padre_id::text AS contrato_padre_id,
        c.objeto_contractual,
        c.observaciones,
        c.aplica_cobertura,
        COALESCE(c.activo, TRUE) AS activo
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE c.id = $1::bigint
      LIMIT 1
      ${options?.forUpdate ? 'FOR UPDATE OF c' : ''}
    `,
    [contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND', { contratoId });
  }

  const contrato = mapContrato(row);

  if (options?.requireActive && !contrato.activo) {
    throw new AppError('Contrato is inactive', 409, 'CONTRATO_INACTIVO', { contratoId });
  }

  return contrato;
};

const ensureCargoExists = async (client: PoolClient, cargoId: number): Promise<CargoAdminItem> => {
  const result = await client.query<CargoRow>(
    `
      SELECT
        cc.id::text AS id,
        cc.contrato_id::text AS contrato_id,
        c.numero_contrato AS contrato_numero,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        cc.nombre_cargo,
        cc.cantidad_requerida,
        cc.aplica_cobertura,
        cc.activo
      FROM contrato_cargos cc
      INNER JOIN contratos c ON c.id = cc.contrato_id
      INNER JOIN empresas e ON e.id = c.empresa_id
      WHERE cc.id = $1::bigint
      LIMIT 1
    `,
    [cargoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Cargo not found', 404, 'CONTRATO_CARGO_NOT_FOUND', { cargoId });
  }

  return mapCargo(row);
};

const ensureEmpresaNitAvailable = async (client: PoolClient, nit: string, excludedId?: number): Promise<void> => {
  const params: unknown[] = [nit.trim()];
  let sql = 'SELECT id::text AS id FROM empresas WHERE LOWER(BTRIM(nit)) = LOWER(BTRIM($1))';

  if (excludedId !== undefined) {
    sql += ' AND id <> $2::bigint';
    params.push(excludedId);
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError('Empresa nit already exists', 409, 'EMPRESA_NIT_DUPLICATE', { nit });
  }
};

const ensureEmpresaNombreAvailable = async (client: PoolClient, nombreEmpresa: string, excludedId?: number): Promise<void> => {
  const params: unknown[] = [normalizeComparableText(nombreEmpresa)];
  let sql = `
    SELECT id::text AS id
    FROM empresas
    WHERE LOWER(REGEXP_REPLACE(BTRIM(nombre_empresa), '\\s+', ' ', 'g')) = $1
  `;

  if (excludedId !== undefined) {
    sql += ' AND id <> $2::bigint';
    params.push(excludedId);
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError('Empresa nombre already exists', 409, 'EMPRESA_NOMBRE_DUPLICATE', {
      nombre_empresa: nombreEmpresa
    });
  }
};

const ensureContratoNumeroAvailable = async (
  client: PoolClient,
  empresaId: number,
  numeroContrato: string,
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [empresaId, normalizeComparableText(numeroContrato)];
  let sql = `
    SELECT id::text AS id
    FROM contratos
    WHERE empresa_id = $1::bigint
      AND LOWER(REGEXP_REPLACE(BTRIM(numero_contrato), '\\s+', ' ', 'g')) = $2
  `;

  if (excludedId !== undefined) {
    sql += ' AND id <> $3::bigint';
    params.push(excludedId);
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError('Contrato numero already exists in empresa', 409, 'CONTRATO_NUMERO_DUPLICATE', {
      empresa_id: empresaId,
      numero_contrato: numeroContrato
    });
  }
};

const ensureCargoNombreAvailable = async (
  client: PoolClient,
  contratoId: number,
  nombreCargo: string,
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [contratoId, normalizeComparableText(nombreCargo)];
  let sql = `
    SELECT id::text AS id
    FROM contrato_cargos
    WHERE contrato_id = $1::bigint
      AND LOWER(REGEXP_REPLACE(BTRIM(nombre_cargo), '\\s+', ' ', 'g')) = $2
  `;

  if (excludedId !== undefined) {
    sql += ' AND id <> $3::bigint';
    params.push(excludedId);
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError('Cargo nombre already exists in contrato', 409, 'CONTRATO_CARGO_NOMBRE_DUPLICATE', {
      contrato_id: contratoId,
      nombre_cargo: nombreCargo
    });
  }
};

const ensureContratoCanDeactivate = async (client: PoolClient, contratoId: number): Promise<void> => {
  const result = await client.query<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculaciones
      WHERE contrato_id = $1::bigint
        AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
    `,
    [contratoId]
  );

  if ((result.rows[0]?.total ?? 0) > 0) {
    throw new AppError(
      'Contrato has active vinculaciones and cannot be deactivated',
      409,
      'CONTRATO_HAS_ACTIVE_VINCULACIONES',
      { contratoId }
    );
  }
};

const ensureEmpresaCanDeactivate = async (client: PoolClient, empresaId: number): Promise<void> => {
  const result = await client.query<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM contratos
      WHERE empresa_id = $1::bigint
        AND COALESCE(activo, TRUE) = TRUE
    `,
    [empresaId]
  );

  if ((result.rows[0]?.total ?? 0) > 0) {
    throw new AppError(
      'Empresa has active contratos and cannot be deactivated',
      409,
      'EMPRESA_HAS_ACTIVE_CONTRATOS',
      { empresaId }
    );
  }
};

const ensureCargoCanDeactivate = async (client: PoolClient, cargoId: number): Promise<void> => {
  const result = await client.query<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM vinculaciones
      WHERE contrato_cargo_id = $1::bigint
        AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
    `,
    [cargoId]
  );

  if ((result.rows[0]?.total ?? 0) > 0) {
    throw new AppError(
      'Cargo has active vinculaciones and cannot be deactivated',
      409,
      'CONTRATO_CARGO_HAS_ACTIVE_VINCULACIONES',
      { cargoId }
    );
  }
};

const listCatalogoSimple = async (
  tableName: string,
  labelColumn: string,
  query:
    | ConfiguracionCatalogListQuery
    | ConfiguracionMunicipiosListQuery
    | ConfiguracionTiposDocumentoListQuery,
  options?: {
    activeColumn?: string;
    extraSelect?: string[];
    extraWhere?: { clause: string; params?: unknown[] }[];
    orderBy?: string;
  }
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if ('activo' in query && query.activo !== undefined && options?.activeColumn) {
    params.push(query.activo);
    clauses.push(`${options.activeColumn} = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`${labelColumn} ILIKE $${params.length}`);
  }

  for (const entry of options?.extraWhere ?? []) {
    const offset = params.length;
    let clause = entry.clause;

    for (let index = 0; index < (entry.params?.length ?? 0); index += 1) {
      clause = clause.replace(`$${index + 1}`, `$${offset + index + 1}`);
    }

    params.push(...(entry.params ?? []));
    clauses.push(clause);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await dbQuery<CountRow>(
    `SELECT COUNT(*)::int AS total FROM ${tableName} ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const selectColumns = [
    'id::text AS id',
    `${labelColumn} AS label`,
    ...(options?.extraSelect ?? [])
  ].join(',\n        ');
  const orderBy = options?.orderBy ?? `${labelColumn} ASC, id ASC`;
  const result = await dbQuery<CatalogoSimpleRow>(
    `
      SELECT
        ${selectColumns}
      FROM ${tableName}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return {
    items: result.rows.map((row) => ({
      id: toNumber(row.id),
      label: row.label,
      ...(row.codigo ? { codigo: row.codigo } : {}),
      ...(row.codigo_dane ? { codigo_dane: row.codigo_dane } : {}),
      ...(row.departamento_id ? { departamento_id: toNumber(row.departamento_id) } : {}),
      ...(row.activo !== undefined && row.activo !== null ? { activo: row.activo } : {}),
      ...(row.alcance !== undefined ? { alcance: row.alcance } : {}),
      ...(row.requiere_fecha_expedicion !== undefined
        ? { requiere_fecha_expedicion: row.requiere_fecha_expedicion }
        : {}),
      ...(row.requiere_fecha_vencimiento !== undefined
        ? { requiere_fecha_vencimiento: row.requiere_fecha_vencimiento }
        : {}),
      ...(row.categoria_documento !== undefined
        ? { categoria_documento: row.categoria_documento }
        : {}),
      ...(row.es_identificacion_personal !== undefined
        ? { es_identificacion_personal: row.es_identificacion_personal }
        : {})
    })),
    pagination: buildPagination(query.page, query.limit, total)
  };
};

const assertTenantEmpresaAccess = async (
  client: PoolClient,
  tenant: TenantAccessContext | undefined,
  empresaId: number
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin || tenant.empresaIds.includes(empresaId)) {
    return;
  }

  if (tenant.contratoIds.length === 0) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM contratos
        WHERE empresa_id = $1::bigint
          AND id = ANY($2::bigint[])
      ) AS exists
    `,
    [empresaId, tenant.contratoIds]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

export const listEmpresas = async (
  query: ConfiguracionEmpresasListQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResult<EmpresaAdminItem>> => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.activo !== undefined) {
    params.push(query.activo);
    clauses.push(`COALESCE(e.activo, TRUE) = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`(
      e.nombre_empresa ILIKE $${params.length}
      OR e.nit ILIKE $${params.length}
      OR COALESCE(e.ciudad, '') ILIKE $${params.length}
      OR COALESCE(e.departamento, '') ILIKE $${params.length}
    )`);
  }

  appendEmpresaTenantClauses({
    clauses,
    params,
    tenant,
    empresaColumn: 'e.id'
  });

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await dbQuery<CountRow>(`SELECT COUNT(*)::int AS total FROM empresas e ${whereClause}`, params);
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const result = await dbQuery<EmpresaRow>(
    `
      SELECT
        e.id::text AS id,
        e.tipo_empresa,
        e.nombre_empresa,
        e.nit,
        e.organizacion_id::text AS organizacion_id,
        o.codigo AS organizacion_codigo,
        o.nombre AS organizacion_nombre,
        o.estado AS organizacion_estado,
        e.representante_legal,
        e.documento_representante,
        e.telefono,
        e.correo,
        e.direccion,
        e.ciudad,
        e.departamento,
        COALESCE(e.activo, TRUE) AS activo
      FROM empresas e
      INNER JOIN organizaciones o ON o.id = e.organizacion_id
      ${whereClause}
      ORDER BY e.nombre_empresa ASC, e.id ASC
      LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return { items: result.rows.map(mapEmpresa), pagination: buildPagination(query.page, query.limit, total) };
};

export const getEmpresaById = async (
  empresaId: number,
  tenant?: TenantAccessContext
): Promise<EmpresaAdminItem> => {
  const client = await dbPool.connect();

  try {
    await assertTenantEmpresaAccess(client, tenant, empresaId);

    const result = await client.query<EmpresaRow>(
      `
        SELECT
          e.id::text AS id,
          e.tipo_empresa,
          e.nombre_empresa,
          e.nit,
          e.organizacion_id::text AS organizacion_id,
          o.codigo AS organizacion_codigo,
          o.nombre AS organizacion_nombre,
          o.estado AS organizacion_estado,
          e.representante_legal,
          e.documento_representante,
          e.telefono,
          e.correo,
          e.direccion,
          e.ciudad,
          e.departamento,
          COALESCE(e.activo, TRUE) AS activo
        FROM empresas e
        INNER JOIN organizaciones o ON o.id = e.organizacion_id
        WHERE e.id = $1::bigint
        LIMIT 1
      `,
      [empresaId]
    );

    const row = result.rows[0];

    if (!row) {
      throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND', { empresaId });
    }

    return mapEmpresa(row);
  } finally {
    client.release();
  }
};

export const createEmpresa = async (input: CreateEmpresaInput, actor: ActorMeta): Promise<EmpresaAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmpresaNitAvailable(client, input.nit);
    await ensureEmpresaNombreAvailable(client, input.nombre_empresa);
    const organizationId =
      input.organizacion_id === null || input.organizacion_id === undefined
        ? await createImplicitOrganizationForCompany(client, {
            companyName: input.nombre_empresa,
            active: true
          })
        : (await ensureOrganizacionExists(client, input.organizacion_id)).id;

    const result = await client.query<EmpresaRow>(
      `
        INSERT INTO empresas (
          organizacion_id,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          activo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
        RETURNING
          id::text AS id,
          organizacion_id::text AS organizacion_id,
          (SELECT codigo FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_codigo,
          (SELECT nombre FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_nombre,
          (SELECT estado FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_estado,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          COALESCE(activo, TRUE) AS activo
      `,
      [
        organizationId,
        input.tipo_empresa,
        input.nombre_empresa,
        input.nit,
        input.representante_legal,
        input.documento_representante,
        input.telefono,
        input.correo,
        input.direccion,
        input.ciudad,
        input.departamento
      ]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Empresa could not be created', 500, 'EMPRESA_CREATE_FAILED');

    const empresa = mapEmpresa(row);
    await recordAudit(client, actor, 'CREATE', 'empresas', String(empresa.id), null, empresa);
    await client.query('COMMIT');
    return empresa;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateEmpresa = async (
  empresaId: number,
  input: UpdateEmpresaInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<EmpresaAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantEmpresaAccess(client, tenant, empresaId);
    const current = await ensureEmpresaExists(client, empresaId);

    if (input.nit && input.nit !== current.nit) await ensureEmpresaNitAvailable(client, input.nit, empresaId);
    if (input.nombre_empresa && normalizeComparableText(input.nombre_empresa) !== normalizeComparableText(current.nombre_empresa)) {
      await ensureEmpresaNombreAvailable(client, input.nombre_empresa, empresaId);
    }

    const nextOrganizacionId: number = !Object.prototype.hasOwnProperty.call(input, 'organizacion_id')
      ? current.organizacion.id
      : input.organizacion_id === null
        ? await createImplicitOrganizationForCompany(client, {
            companyName: input.nombre_empresa ?? current.nombre_empresa,
            active: current.activo
          })
        : input.organizacion_id ?? current.organizacion.id;

    const nextValues = {
      organizacion_id: nextOrganizacionId,
      tipo_empresa: input.tipo_empresa ?? current.tipo_empresa,
      nombre_empresa: input.nombre_empresa ?? current.nombre_empresa,
      nit: input.nit ?? current.nit,
      representante_legal: Object.prototype.hasOwnProperty.call(input, 'representante_legal') ? input.representante_legal ?? null : current.representante_legal,
      documento_representante: Object.prototype.hasOwnProperty.call(input, 'documento_representante') ? input.documento_representante ?? null : current.documento_representante,
      telefono: Object.prototype.hasOwnProperty.call(input, 'telefono') ? input.telefono ?? null : current.telefono,
      correo: Object.prototype.hasOwnProperty.call(input, 'correo') ? input.correo ?? null : current.correo,
      direccion: Object.prototype.hasOwnProperty.call(input, 'direccion') ? input.direccion ?? null : current.direccion,
      ciudad: Object.prototype.hasOwnProperty.call(input, 'ciudad') ? input.ciudad ?? null : current.ciudad,
      departamento: Object.prototype.hasOwnProperty.call(input, 'departamento') ? input.departamento ?? null : current.departamento
    };

    if (nextValues.organizacion_id !== current.organizacion.id) {
      await ensureOrganizacionExists(client, nextValues.organizacion_id);
    }

    const result = await client.query<EmpresaRow>(
      `
        UPDATE empresas
        SET
          organizacion_id = $2::bigint,
          tipo_empresa = $3,
          nombre_empresa = $4,
          nit = $5,
          representante_legal = $6,
          documento_representante = $7,
          telefono = $8,
          correo = $9,
          direccion = $10,
          ciudad = $11,
          departamento = $12
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          organizacion_id::text AS organizacion_id,
          (SELECT codigo FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_codigo,
          (SELECT nombre FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_nombre,
          (SELECT estado FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_estado,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          COALESCE(activo, TRUE) AS activo
      `,
      [empresaId, nextValues.organizacion_id, nextValues.tipo_empresa, nextValues.nombre_empresa, nextValues.nit, nextValues.representante_legal, nextValues.documento_representante, nextValues.telefono, nextValues.correo, nextValues.direccion, nextValues.ciudad, nextValues.departamento]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND', { empresaId });

    const empresa = mapEmpresa(row);
    await recordAudit(client, actor, 'UPDATE', 'empresas', String(empresa.id), current, empresa);
    await client.query('COMMIT');
    return empresa;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const setEmpresaActiveState = async (
  empresaId: number,
  active: boolean,
  actor: ActorMeta,
  observacion?: string | null,
  tenant?: TenantAccessContext
): Promise<EmpresaAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantEmpresaAccess(client, tenant, empresaId);
    const current = await ensureEmpresaExists(client, empresaId);
    if (!active) await ensureEmpresaCanDeactivate(client, empresaId);

    const result = await client.query<EmpresaRow>(
      `
        UPDATE empresas
        SET activo = $2
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          organizacion_id::text AS organizacion_id,
          (SELECT codigo FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_codigo,
          (SELECT nombre FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_nombre,
          (SELECT estado FROM organizaciones WHERE id = empresas.organizacion_id) AS organizacion_estado,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          COALESCE(activo, TRUE) AS activo
      `,
      [empresaId, active]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Empresa not found', 404, 'EMPRESA_NOT_FOUND', { empresaId });

    const empresa = mapEmpresa(row);
    await recordAudit(client, actor, active ? 'ACTIVATE' : 'DEACTIVATE', 'empresas', String(empresa.id), current, empresa, observacion ?? null);
    await client.query('COMMIT');
    return empresa;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listContratos = async (query: ConfiguracionContratosListQuery, tenant?: TenantAccessContext): Promise<PaginatedResult<ContratoAdminItem>> => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.activo !== undefined) {
    params.push(query.activo);
    clauses.push(`COALESCE(c.activo, TRUE) = $${params.length}`);
  }

  if (query.empresa_id !== undefined) {
    params.push(query.empresa_id);
    clauses.push(`c.empresa_id = $${params.length}::bigint`);
  }

  if (query.estado_contractual !== undefined) {
    params.push(query.estado_contractual);
    clauses.push(`c.estado_contractual = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`(
      c.numero_contrato ILIKE $${params.length}
      OR COALESCE(c.numero_licitacion, '') ILIKE $${params.length}
      OR c.entidad_contratante ILIKE $${params.length}
      OR COALESCE(c.objeto_contractual, '') ILIKE $${params.length}
      OR e.nombre_empresa ILIKE $${params.length}
    )`);
  }

  appendContractTenantClauses({
    clauses,
    params,
    tenant,
    contratoColumn: 'c.id',
    empresaColumn: 'c.empresa_id'
  });

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await dbQuery<CountRow>(`SELECT COUNT(*)::int AS total FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id ${whereClause}`, params);
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const result = await dbQuery<ContratoRow>(
    `
      SELECT
        c.id::text AS id,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        c.numero_contrato,
        c.numero_licitacion,
        c.entidad_contratante,
        c.fecha_inicio,
        c.fecha_finalizacion,
        c.fecha_final_estimada,
        c.fecha_final_real,
        c.estado_contractual,
        c.contrato_padre_id::text AS contrato_padre_id,
        c.objeto_contractual,
        c.observaciones,
        c.aplica_cobertura,
        COALESCE(c.activo, TRUE) AS activo
      FROM contratos c
      INNER JOIN empresas e ON e.id = c.empresa_id
      ${whereClause}
      ORDER BY c.fecha_inicio DESC, c.id DESC
      LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return { items: result.rows.map(mapContrato), pagination: buildPagination(query.page, query.limit, total) };
};

export const getContratoById = async (contratoId: number, tenant?: TenantAccessContext): Promise<ContratoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await assertTenantContratoAccess(client, tenant, contratoId);

    const result = await client.query<ContratoRow>(
      `
        SELECT
          c.id::text AS id,
          c.empresa_id::text AS empresa_id,
          e.nombre_empresa AS empresa_nombre,
          c.numero_contrato,
          c.numero_licitacion,
          c.entidad_contratante,
          c.fecha_inicio,
          c.fecha_finalizacion,
          c.fecha_final_estimada,
          c.fecha_final_real,
          c.estado_contractual,
          c.contrato_padre_id::text AS contrato_padre_id,
          c.objeto_contractual,
          c.observaciones,
          c.aplica_cobertura,
          COALESCE(c.activo, TRUE) AS activo
        FROM contratos c
        INNER JOIN empresas e ON e.id = c.empresa_id
        WHERE c.id = $1::bigint
        LIMIT 1
      `,
      [contratoId]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND', { contratoId });
    return mapContrato(row);
  } finally {
    client.release();
  }
};

export const createContrato = async (input: CreateContratoInput, actor: ActorMeta, tenant?: TenantAccessContext): Promise<ContratoAdminItem> => {
  validateDateRange(input.fecha_inicio, input.fecha_final_estimada ?? input.fecha_finalizacion ?? null);
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantEmpresaAccess(client, tenant, input.empresa_id);
    await ensureEmpresaExists(client, input.empresa_id, { requireActive: true });
    await ensureContratoNumeroAvailable(client, input.empresa_id, input.numero_contrato);

    const result = await client.query<ContratoRow>(
      `
        INSERT INTO contratos (
          empresa_id,
          numero_contrato,
          numero_licitacion,
          entidad_contratante,
          fecha_inicio,
          fecha_finalizacion,
          fecha_final_estimada,
          fecha_final_real,
          estado_contractual,
          contrato_padre_id,
          objeto_contractual,
          observaciones,
          aplica_cobertura,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4, $5::date, $6::date, $7::date, $8::date, $9, $10::bigint, $11, $12, $13, TRUE)
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          (SELECT nombre_empresa FROM empresas WHERE id = contratos.empresa_id) AS empresa_nombre,
          numero_contrato,
          numero_licitacion,
          entidad_contratante,
          fecha_inicio,
          fecha_finalizacion,
          fecha_final_estimada,
          fecha_final_real,
          estado_contractual,
          contrato_padre_id::text AS contrato_padre_id,
          objeto_contractual,
          observaciones,
          aplica_cobertura,
          COALESCE(activo, TRUE) AS activo
      `,
      [input.empresa_id, input.numero_contrato, input.numero_licitacion, input.entidad_contratante, input.fecha_inicio, input.fecha_final_estimada ?? input.fecha_finalizacion ?? null, input.fecha_final_estimada ?? input.fecha_finalizacion ?? null, input.fecha_final_real ?? null, input.estado_contractual, input.contrato_padre_id ?? null, input.objeto_contractual, input.observaciones ?? null, input.aplica_cobertura]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Contrato could not be created', 500, 'CONTRATO_CREATE_FAILED');

    const contrato = mapContrato(row);
    await recordAudit(client, actor, 'CREATE', 'contratos', String(contrato.id), null, contrato);
    await client.query('COMMIT');
    return contrato;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateContrato = async (
  contratoId: number,
  input: UpdateContratoInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensureContratoExists(client, contratoId, { forUpdate: true });
    const nextEmpresaId = input.empresa_id ?? current.empresa.id;

    if (input.empresa_id !== undefined && input.empresa_id !== current.empresa.id) {
      await assertTenantEmpresaAccess(client, tenant, input.empresa_id);
      const assignments = await client.query<{ usuario_id: string }>(
        `
          SELECT uc.usuario_id::text AS usuario_id
          FROM usuario_contratos uc
          WHERE uc.contrato_id = $1::bigint
            AND COALESCE(uc.activo, TRUE) = TRUE
          FOR UPDATE
        `,
        [contratoId]
      );
      if ((assignments.rowCount ?? 0) > 0) {
        throw new AppError(
          'No se puede mover un contrato con accesos de usuario activos',
          409,
          'CONTRATO_TENANT_ASSIGNMENTS_ACTIVE',
          { contratoId, assignedUserIds: assignments.rows.map((row) => row.usuario_id) }
        );
      }
      await ensureEmpresaExists(client, input.empresa_id, { requireActive: true });
    }

    const nextNumeroContrato = input.numero_contrato ?? current.numero_contrato;
    if (nextEmpresaId !== current.empresa.id || normalizeComparableText(nextNumeroContrato) !== normalizeComparableText(current.numero_contrato)) {
      await ensureContratoNumeroAvailable(client, nextEmpresaId, nextNumeroContrato, contratoId);
    }

    const nextValues = {
      empresa_id: nextEmpresaId,
      numero_contrato: nextNumeroContrato,
      numero_licitacion: Object.prototype.hasOwnProperty.call(input, 'numero_licitacion') ? input.numero_licitacion ?? null : current.numero_licitacion,
      entidad_contratante: input.entidad_contratante ?? current.entidad_contratante,
      fecha_inicio: input.fecha_inicio ?? current.fecha_inicio,
      fecha_finalizacion: Object.prototype.hasOwnProperty.call(input, 'fecha_final_estimada') ? input.fecha_final_estimada ?? null : Object.prototype.hasOwnProperty.call(input, 'fecha_finalizacion') ? input.fecha_finalizacion ?? null : current.fecha_finalizacion,
      fecha_final_real: Object.prototype.hasOwnProperty.call(input, 'fecha_final_real') ? input.fecha_final_real ?? null : current.fecha_final_real,
      estado_contractual: input.estado_contractual ?? current.estado_contractual,
      contrato_padre_id: Object.prototype.hasOwnProperty.call(input, 'contrato_padre_id') ? input.contrato_padre_id ?? null : current.contrato_padre_id,
      objeto_contractual: Object.prototype.hasOwnProperty.call(input, 'objeto_contractual') ? input.objeto_contractual ?? null : current.objeto_contractual,
      observaciones: Object.prototype.hasOwnProperty.call(input, 'observaciones') ? input.observaciones ?? null : current.observaciones,
      aplica_cobertura: Object.prototype.hasOwnProperty.call(input, 'aplica_cobertura') ? input.aplica_cobertura ?? current.aplica_cobertura : current.aplica_cobertura
    };

    validateDateRange(nextValues.fecha_inicio, nextValues.fecha_finalizacion);

    const result = await client.query<ContratoRow>(
      `
        UPDATE contratos
        SET
          empresa_id = $2::bigint,
          numero_contrato = $3,
          numero_licitacion = $4,
          entidad_contratante = $5,
          fecha_inicio = $6::date,
          fecha_finalizacion = $7::date,
          fecha_final_estimada = $7::date,
          fecha_final_real = $8::date,
          estado_contractual = $9,
          contrato_padre_id = $10::bigint,
          objeto_contractual = $11,
          observaciones = $12,
          aplica_cobertura = $13
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          (SELECT nombre_empresa FROM empresas WHERE id = contratos.empresa_id) AS empresa_nombre,
          numero_contrato,
          numero_licitacion,
          entidad_contratante,
          fecha_inicio,
          fecha_finalizacion,
          fecha_final_estimada,
          fecha_final_real,
          estado_contractual,
          contrato_padre_id::text AS contrato_padre_id,
          objeto_contractual,
          observaciones,
          aplica_cobertura,
          COALESCE(activo, TRUE) AS activo
      `,
      [contratoId, nextValues.empresa_id, nextValues.numero_contrato, nextValues.numero_licitacion, nextValues.entidad_contratante, nextValues.fecha_inicio, nextValues.fecha_finalizacion, nextValues.fecha_final_real, nextValues.estado_contractual, nextValues.contrato_padre_id, nextValues.objeto_contractual, nextValues.observaciones ?? null, nextValues.aplica_cobertura]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND', { contratoId });

    const contrato = mapContrato(row);
    await recordAudit(client, actor, 'UPDATE', 'contratos', String(contrato.id), current, contrato);
    await client.query('COMMIT');
    return contrato;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const setContratoActiveState = async (
  contratoId: number,
  active: boolean,
  actor: ActorMeta,
  observacion?: string | null,
  tenant?: TenantAccessContext
): Promise<ContratoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensureContratoExists(client, contratoId);
    if (!active) await ensureContratoCanDeactivate(client, contratoId);

    const result = await client.query<ContratoRow>(
      `
        UPDATE contratos
        SET activo = $2
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          (SELECT nombre_empresa FROM empresas WHERE id = contratos.empresa_id) AS empresa_nombre,
          numero_contrato,
          numero_licitacion,
          entidad_contratante,
          fecha_inicio,
          fecha_finalizacion,
          fecha_final_estimada,
          fecha_final_real,
          estado_contractual,
          contrato_padre_id::text AS contrato_padre_id,
          objeto_contractual,
          observaciones,
          aplica_cobertura,
          COALESCE(activo, TRUE) AS activo
      `,
      [contratoId, active]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND', { contratoId });

    const contrato = mapContrato(row);
    await recordAudit(client, actor, active ? 'ACTIVATE' : 'DEACTIVATE', 'contratos', String(contrato.id), current, contrato, observacion ?? null);
    await client.query('COMMIT');
    return contrato;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listContratoCargos = async (
  query: ConfiguracionCargosListQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedResult<CargoAdminItem>> => {
  if (query.contrato_id !== undefined && tenant && !tenant.isGlobalAdmin) {
    const client = await dbPool.connect();

    try {
      await assertTenantContratoAccess(client, tenant, query.contrato_id);
    } finally {
      client.release();
    }
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  appendContractTenantClauses({
    clauses,
    contratoColumn: 'cc.contrato_id',
    empresaColumn: 'c.empresa_id',
    params,
    tenant
  });

  if (query.activo !== undefined) {
    params.push(query.activo);
    clauses.push(`cc.activo = $${params.length}`);
  }

  if (query.contrato_id !== undefined) {
    params.push(query.contrato_id);
    clauses.push(`cc.contrato_id = $${params.length}::bigint`);
  }

  if (query.search) {
    params.push(`%${query.search}%`);
    clauses.push(`(
      cc.nombre_cargo ILIKE $${params.length}
      OR COALESCE(c.numero_contrato, '') ILIKE $${params.length}
      OR COALESCE(e.nombre_empresa, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await dbQuery<CountRow>(
    `SELECT COUNT(*)::int AS total FROM contrato_cargos cc INNER JOIN contratos c ON c.id = cc.contrato_id INNER JOIN empresas e ON e.id = c.empresa_id ${whereClause}`,
    params
  );
  const total = countResult.rows[0]?.total ?? 0;
  const offset = (query.page - 1) * query.limit;
  const listParams = [...params, query.limit, offset];
  const result = await dbQuery<CargoRow>(
    `
      SELECT
        cc.id::text AS id,
        cc.contrato_id::text AS contrato_id,
        c.numero_contrato AS contrato_numero,
        c.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        cc.nombre_cargo,
        cc.cantidad_requerida,
        cc.aplica_cobertura,
        cc.activo
      FROM contrato_cargos cc
      INNER JOIN contratos c ON c.id = cc.contrato_id
      INNER JOIN empresas e ON e.id = c.empresa_id
      ${whereClause}
      ORDER BY cc.nombre_cargo ASC, cc.id ASC
      LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
    `,
    listParams
  );

  return { items: result.rows.map(mapCargo), pagination: buildPagination(query.page, query.limit, total) };
};

export const getContratoCargoById = async (
  cargoId: number,
  tenant?: TenantAccessContext
): Promise<CargoAdminItem> => {
  const client = await dbPool.connect();

  try {
    const cargo = await ensureCargoExists(client, cargoId);
    await assertTenantContratoAccess(client, tenant, cargo.contrato.id);
    return cargo;
  } finally {
    client.release();
  }
};

export const createContratoCargo = async (
  input: CreateContratoCargoInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<CargoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, input.contrato_id);
    await ensureContratoExists(client, input.contrato_id, { requireActive: true });
    await ensureCargoNombreAvailable(client, input.contrato_id, input.nombre_cargo);

    const result = await client.query<CargoRow>(
      `
        INSERT INTO contrato_cargos (contrato_id, nombre_cargo, cantidad_requerida, aplica_cobertura, activo)
        VALUES ($1::bigint, $2, $3::bigint, $4, TRUE)
        RETURNING
          id::text AS id,
          contrato_id::text AS contrato_id,
          (SELECT numero_contrato FROM contratos WHERE id = contrato_cargos.contrato_id) AS contrato_numero,
          (SELECT empresa_id::text FROM contratos WHERE id = contrato_cargos.contrato_id) AS empresa_id,
          (SELECT e.nombre_empresa FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id WHERE c.id = contrato_cargos.contrato_id) AS empresa_nombre,
          nombre_cargo,
          cantidad_requerida,
          aplica_cobertura,
          activo
      `,
      [input.contrato_id, input.nombre_cargo, input.cantidad_requerida, input.aplica_cobertura]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Cargo could not be created', 500, 'CONTRATO_CARGO_CREATE_FAILED');

    const cargo = mapCargo(row);
    await recordAudit(client, actor, 'CREATE', 'contrato_cargos', String(cargo.id), null, cargo);
    await client.query('COMMIT');
    return cargo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateContratoCargo = async (
  cargoId: number,
  input: UpdateContratoCargoInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<CargoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await ensureCargoExists(client, cargoId);
    await assertTenantContratoAccess(client, tenant, current.contrato.id);
    const nextContratoId = input.contrato_id ?? current.contrato.id;

    if (input.contrato_id !== undefined && input.contrato_id !== current.contrato.id) {
      await assertTenantContratoAccess(client, tenant, input.contrato_id);
      await ensureContratoExists(client, input.contrato_id, { requireActive: true });
    }

    const nextNombreCargo = input.nombre_cargo ?? current.nombre_cargo;
    if (nextContratoId !== current.contrato.id || normalizeComparableText(nextNombreCargo) !== normalizeComparableText(current.nombre_cargo)) {
      await ensureCargoNombreAvailable(client, nextContratoId, nextNombreCargo, cargoId);
    }

    const nextValues = {
      contrato_id: nextContratoId,
      nombre_cargo: nextNombreCargo,
      cantidad_requerida: Object.prototype.hasOwnProperty.call(input, 'cantidad_requerida') ? input.cantidad_requerida ?? null : current.cantidad_requerida,
      aplica_cobertura: Object.prototype.hasOwnProperty.call(input, 'aplica_cobertura') ? input.aplica_cobertura ?? current.aplica_cobertura : current.aplica_cobertura
    };

    const result = await client.query<CargoRow>(
      `
        UPDATE contrato_cargos
        SET
          contrato_id = $2::bigint,
          nombre_cargo = $3,
          cantidad_requerida = $4::bigint,
          aplica_cobertura = $5
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          contrato_id::text AS contrato_id,
          (SELECT numero_contrato FROM contratos WHERE id = contrato_cargos.contrato_id) AS contrato_numero,
          (SELECT empresa_id::text FROM contratos WHERE id = contrato_cargos.contrato_id) AS empresa_id,
          (SELECT e.nombre_empresa FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id WHERE c.id = contrato_cargos.contrato_id) AS empresa_nombre,
          nombre_cargo,
          cantidad_requerida,
          aplica_cobertura,
          activo
      `,
      [cargoId, nextValues.contrato_id, nextValues.nombre_cargo, nextValues.cantidad_requerida, nextValues.aplica_cobertura]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Cargo not found', 404, 'CONTRATO_CARGO_NOT_FOUND', { cargoId });

    const cargo = mapCargo(row);
    await recordAudit(client, actor, 'UPDATE', 'contrato_cargos', String(cargo.id), current, cargo);
    await client.query('COMMIT');
    return cargo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const setContratoCargoActiveState = async (
  cargoId: number,
  active: boolean,
  actor: ActorMeta,
  observacion?: string | null,
  tenant?: TenantAccessContext
): Promise<CargoAdminItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const current = await ensureCargoExists(client, cargoId);
    await assertTenantContratoAccess(client, tenant, current.contrato.id);
    if (!active) await ensureCargoCanDeactivate(client, cargoId);

    const result = await client.query<CargoRow>(
      `
        UPDATE contrato_cargos
        SET activo = $2
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          contrato_id::text AS contrato_id,
          (SELECT numero_contrato FROM contratos WHERE id = contrato_cargos.contrato_id) AS contrato_numero,
          (SELECT empresa_id::text FROM contratos WHERE id = contrato_cargos.contrato_id) AS empresa_id,
          (SELECT e.nombre_empresa FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id WHERE c.id = contrato_cargos.contrato_id) AS empresa_nombre,
          nombre_cargo,
          cantidad_requerida,
          aplica_cobertura,
          activo
      `,
      [cargoId, active]
    );

    const row = result.rows[0];
    if (!row) throw new AppError('Cargo not found', 404, 'CONTRATO_CARGO_NOT_FOUND', { cargoId });

    const cargo = mapCargo(row);
    await recordAudit(client, actor, active ? 'ACTIVATE' : 'DEACTIVATE', 'contrato_cargos', String(cargo.id), current, cargo, observacion ?? null);
    await client.query('COMMIT');
    return cargo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listTiposVinculacion = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('tipos_vinculacion', 'nombre_vinculacion', query, {
    extraSelect: ['codigo'],
    orderBy: 'codigo ASC, id ASC'
  });
};

export const listTiposJornada = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('tipos_jornada', 'nombre', query);
};

export const listDepartamentos = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('departamentos', 'nombre_departamento', query, {
    extraSelect: ['codigo_dane'],
    orderBy: 'nombre_departamento ASC, id ASC'
  });
};

export const listMunicipios = async (query: ConfiguracionMunicipiosListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('municipios', 'nombre_municipio', query, {
    extraSelect: ['codigo_dane', 'departamento_id::text AS departamento_id'],
    extraWhere: query.departamento_id !== undefined ? [{ clause: 'departamento_id = $1::bigint', params: [query.departamento_id] }] : [],
    orderBy: 'nombre_municipio ASC, id ASC'
  });
};

export const listZonas = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('zonas', 'nombre_zona', query);
};

export const listEps = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('eps', 'nombre', query, { activeColumn: 'activo', extraSelect: ['activo'], orderBy: 'nombre ASC, id ASC' });
};

export const listArl = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('arl', 'nombre', query, { activeColumn: 'activo', extraSelect: ['activo'], orderBy: 'nombre ASC, id ASC' });
};

export const listFondosPension = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('fondos_pension', 'nombre', query, { activeColumn: 'activo', extraSelect: ['activo'], orderBy: 'nombre ASC, id ASC' });
};

export const listCajasCompensacion = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('cajas_compensacion', 'nombre', query, { activeColumn: 'activo', extraSelect: ['activo'], orderBy: 'nombre ASC, id ASC' });
};

export const listNivelesEstudio = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('niveles_estudio', 'nombre_nivel', query, { extraSelect: ['codigo'], orderBy: 'id ASC' });
};

export const listEstadosCiviles = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('estados_civiles', 'nombre_estado_civil', query);
};

export const listSexos = async (query: ConfiguracionCatalogListQuery): Promise<PaginatedResult<Record<string, unknown>>> => {
  return listCatalogoSimple('sexo', 'nombre_sexo', query);
};

export const listTiposDocumento = async (
  query: ConfiguracionTiposDocumentoListQuery
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const extraWhere: { clause: string; params?: unknown[] }[] = [];

  if (query.es_identificacion_personal !== undefined) {
    extraWhere.push({
      clause: 'COALESCE(es_identificacion_personal, FALSE) = $1',
      params: [query.es_identificacion_personal]
    });
  }

  return listCatalogoSimple('tipos_documentos', 'nombre_documento', query, {
    extraSelect: [
      'codigo',
      'alcance',
      'requiere_fecha_expedicion',
      'requiere_fecha_vencimiento',
      'categoria_documento',
      'COALESCE(es_identificacion_personal, FALSE) AS es_identificacion_personal'
    ],
    extraWhere,
    orderBy: 'codigo ASC, id ASC'
  });
};

export const listMetodosPago = async (): Promise<Array<{ etiqueta: string; valor: string }>> => {
  return METODOS_PAGO.map((value) => ({
    valor: value,
    etiqueta:
      value === 'COBERTURA'
        ? 'Cobertura'
        : value === 'ASISTENCIA'
        ? 'Asistencia'
        : value === 'CASO_ESPECIAL'
          ? 'Caso Especial'
        : value === 'CATEGORIA'
          ? 'Categoria'
          : value === 'OPS_CUENTA_COBRO'
            ? 'OPS Cuenta de Cobro'
            : value === 'OPS_VALOR_FIJO'
              ? 'OPS Valor Fijo'
              : 'OPS por Producto'
  }));
};

export const listRoles = async (): Promise<Array<{ activo: boolean; descripcion: string | null; id: number; nombre_rol: string; permissions: string[] }>> => {
  const result = await dbQuery<RoleRow>(
    `
      SELECT
        r.id::text AS id,
        r.nombre_rol,
        r.descripcion,
        COALESCE(r.activo, TRUE) AS activo,
        COALESCE(
          ARRAY(
            SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
            FROM rol_permisos rp
            INNER JOIN permisos p ON p.id = rp.permiso_id
            WHERE rp.rol_id = r.id
              AND COALESCE(rp.activo, TRUE) = TRUE
            ORDER BY CONCAT_WS('.', p.modulo, p.accion)
          ),
          ARRAY[]::text[]
        ) AS permissions
      FROM roles r
      ORDER BY r.nombre_rol ASC
    `
  );

  return result.rows.map((row) => ({
    id: toNumber(row.id),
    nombre_rol: row.nombre_rol,
    descripcion: row.descripcion,
    activo: row.activo,
    permissions: Array.isArray(row.permissions) ? row.permissions.filter((item): item is string => typeof item === 'string') : []
  }));
};

export const listPermissions = async (): Promise<Array<{ activo: boolean; accion: string; codigo: string; descripcion: string | null; id: number; modulo: string }>> => {
  const result = await dbQuery<PermissionRow>(
    `
      SELECT
        id::text AS id,
        modulo,
        accion,
        descripcion,
        COALESCE(activo, TRUE) AS activo
      FROM permisos
      ORDER BY modulo ASC, accion ASC
    `
  );

  return result.rows.map((row) => ({
    id: toNumber(row.id),
    modulo: row.modulo,
    accion: row.accion,
    codigo: `${row.modulo}.${row.accion}`,
    descripcion: row.descripcion,
    activo: row.activo ?? true
  }));
};
