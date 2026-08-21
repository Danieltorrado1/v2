import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import type {
  ConfiguracionPersonalListQuery,
  CreateContratoPerfilLicitacionInput,
  CreateContratoUbicacionLaboralInput,
  UpdateContratoPerfilLicitacionInput,
  UpdateContratoUbicacionLaboralInput
} from './configuracion.personal.schemas';

interface ActorMeta {
  ip: string | null;
  userAgent: string | null;
  userId: string;
}

interface SimpleContratoRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface ContratoUbicacionLaboralRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string;
  created_at: Date;
  descripcion: string | null;
  id: string;
  nombre_ubicacion: string;
  updated_at: Date;
}

interface ContratoPerfilLicitacionRow extends QueryResultRow {
  activo: boolean;
  cantidad_requerida: number;
  codigo_perfil: string;
  contrato_cargo_equivalente_id: string | null;
  contrato_cargo_equivalente_nombre: string | null;
  contrato_id: string;
  created_at: Date;
  id: string;
  nombre_perfil: string;
  updated_at: Date;
  vigencia_desde: Date | string;
  vigencia_hasta: Date | string | null;
}

export interface ContratoUbicacionLaboralItem {
  activo: boolean;
  contrato_id: number;
  created_at: string;
  descripcion: string | null;
  id: number;
  nombre_ubicacion: string;
  updated_at: string;
}

export interface ContratoPerfilLicitacionItem {
  activo: boolean;
  cantidad_requerida: number;
  codigo_perfil: string;
  contrato_cargo_equivalente: {
    id: number | null;
    nombre_cargo: string | null;
  };
  contrato_id: number;
  created_at: string;
  id: number;
  nombre_perfil: string;
  updated_at: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
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

const normalizeComparableText = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeStableCode = (value: string): string =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9/_-]+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();

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

  const result = await client.query<SimpleContratoRow>(
    `
      SELECT id::text AS id, empresa_id::text AS empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (!contrato) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  if (!contrato.empresa_id || !tenant.empresaIds.includes(toNumber(contrato.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const ensureContratoCargoExists = async (
  client: PoolClient,
  contratoId: number,
  cargoId: number
): Promise<void> => {
  const result = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM contrato_cargos
      WHERE id = $1::bigint
        AND contrato_id = $2::bigint
      LIMIT 1
    `,
    [cargoId, contratoId]
  );

  if (!result.rows[0]) {
    throw new AppError(
      'Contrato cargo not found for contrato',
      404,
      'CONTRATO_CARGO_NOT_FOUND',
      { cargoId, contratoId }
    );
  }
};

const mapUbicacionLaboral = (
  row: ContratoUbicacionLaboralRow
): ContratoUbicacionLaboralItem => ({
  id: toNumber(row.id),
  contrato_id: toNumber(row.contrato_id),
  nombre_ubicacion: row.nombre_ubicacion,
  descripcion: row.descripcion,
  activo: row.activo,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString()
});

const mapPerfilLicitacion = (
  row: ContratoPerfilLicitacionRow
): ContratoPerfilLicitacionItem => ({
  id: toNumber(row.id),
  contrato_id: toNumber(row.contrato_id),
  codigo_perfil: row.codigo_perfil,
  nombre_perfil: row.nombre_perfil,
  cantidad_requerida: row.cantidad_requerida,
  vigencia_desde: toDateString(row.vigencia_desde) ?? '',
  vigencia_hasta: toDateString(row.vigencia_hasta),
  activo: row.activo,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
  contrato_cargo_equivalente: {
    id: row.contrato_cargo_equivalente_id ? toNumber(row.contrato_cargo_equivalente_id) : null,
    nombre_cargo: row.contrato_cargo_equivalente_nombre
  }
});

const getUbicacionSelect = () => `
  SELECT
    id::text AS id,
    contrato_id::text AS contrato_id,
    nombre_ubicacion,
    descripcion,
    activo,
    created_at,
    updated_at
  FROM contrato_ubicaciones_laborales
`;

const getPerfilSelect = () => `
  SELECT
    cpl.id::text AS id,
    cpl.contrato_id::text AS contrato_id,
    cpl.codigo_perfil,
    cpl.nombre_perfil,
    cpl.cantidad_requerida,
    cpl.vigencia_desde,
    cpl.vigencia_hasta,
    cpl.contrato_cargo_equivalente_id::text AS contrato_cargo_equivalente_id,
    cc.nombre_cargo AS contrato_cargo_equivalente_nombre,
    cpl.activo,
    cpl.created_at,
    cpl.updated_at
  FROM contrato_perfiles_licitacion cpl
  LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
`;

const ensureUbicacionUnique = async (
  client: PoolClient,
  contratoId: number,
  nombreUbicacion: string,
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [contratoId, normalizeComparableText(nombreUbicacion)];
  let sql = `
      SELECT id::text AS id
    FROM contrato_ubicaciones_laborales
    WHERE contrato_id = $1::bigint
      AND REGEXP_REPLACE(
        TRANSLATE(
          LOWER(BTRIM(nombre_ubicacion)),
          'áéíóúàèìòùäëïöüâêîôûñ',
          'aeiouaeiouaeiouaeioun'
        ),
        '\\s+',
        ' ',
        'g'
      ) = $2
      AND activo = TRUE
  `;

  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError(
      'Ubicacion laboral already exists in contrato',
      409,
      'CONTRATO_UBICACION_DUPLICATE'
    );
  }
};

const ensurePerfilUnique = async (
  client: PoolClient,
  contratoId: number,
  values: {
    codigo_perfil: string;
    nombre_perfil: string;
    vigencia_desde: string;
    vigencia_hasta: string | null;
  },
  excludedId?: number
): Promise<void> => {
  const params: unknown[] = [
    contratoId,
    normalizeComparableText(values.codigo_perfil),
    normalizeComparableText(values.nombre_perfil),
    values.vigencia_desde,
    values.vigencia_hasta
  ];
  let sql = `
    SELECT id::text AS id
    FROM contrato_perfiles_licitacion
    WHERE contrato_id = $1::bigint
      AND vigencia_desde = $4::date
      AND COALESCE(vigencia_hasta, DATE '9999-12-31') = COALESCE($5::date, DATE '9999-12-31')
      AND (
        REGEXP_REPLACE(
          TRANSLATE(
            LOWER(BTRIM(codigo_perfil)),
            'áéíóúàèìòùäëïöüâêîôûñ',
            'aeiouaeiouaeiouaeioun'
          ),
          '\\s+',
          ' ',
          'g'
        ) = $2
        OR REGEXP_REPLACE(
          TRANSLATE(
            LOWER(BTRIM(nombre_perfil)),
            'áéíóúàèìòùäëïöüâêîôûñ',
            'aeiouaeiouaeiouaeioun'
          ),
          '\\s+',
          ' ',
          'g'
        ) = $3
      )
  `;

  if (excludedId !== undefined) {
    params.push(excludedId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError(
      'Perfil de licitacion already exists with same vigencia',
      409,
      'CONTRATO_PERFIL_LICITACION_DUPLICATE'
    );
  }
};

const recordAudit = async (
  client: PoolClient,
  actor: ActorMeta,
  action: string,
  table: string,
  recordId: string,
  before: unknown,
  after: unknown,
  description: string
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actor.userId,
    accion: action,
    tabla: table,
    registro_id: recordId,
    descripcion: description,
    before,
    after,
    ip: actor.ip,
    user_agent: actor.userAgent
  });
};

const ensureUbicacionExists = async (
  client: PoolClient,
  contratoId: number,
  ubicacionId: number
): Promise<ContratoUbicacionLaboralItem> => {
  const result = await client.query<ContratoUbicacionLaboralRow>(
    `
      ${getUbicacionSelect()}
      WHERE id = $1::bigint
        AND contrato_id = $2::bigint
      LIMIT 1
      FOR UPDATE
    `,
    [ubicacionId, contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Contrato ubicacion laboral not found', 404, 'CONTRATO_UBICACION_NOT_FOUND');
  }

  return mapUbicacionLaboral(row);
};

const ensurePerfilExists = async (
  client: PoolClient,
  contratoId: number,
  perfilId: number
): Promise<ContratoPerfilLicitacionItem> => {
  const result = await client.query<ContratoPerfilLicitacionRow>(
    `
      ${getPerfilSelect()}
      WHERE cpl.id = $1::bigint
        AND cpl.contrato_id = $2::bigint
      LIMIT 1
      FOR UPDATE OF cpl
    `,
    [perfilId, contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError(
      'Contrato perfil licitacion not found',
      404,
      'CONTRATO_PERFIL_LICITACION_NOT_FOUND'
    );
  }

  return mapPerfilLicitacion(row);
};

export const listContratoUbicacionesLaborales = async (
  contratoId: number,
  query: ConfiguracionPersonalListQuery,
  tenant?: TenantAccessContext
): Promise<ContratoUbicacionLaboralItem[]> => {
  const client = await dbPool.connect();

  try {
    await assertTenantContratoAccess(client, tenant, contratoId);
  } finally {
    client.release();
  }

  const params: unknown[] = [contratoId];
  const conditions = ['contrato_id = $1::bigint'];

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`activo = $${params.length}`);
  }

  const result = await dbQuery<ContratoUbicacionLaboralRow>(
    `
      ${getUbicacionSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY activo DESC, nombre_ubicacion ASC, id ASC
    `,
    params
  );

  return result.rows.map(mapUbicacionLaboral);
};

export const createContratoUbicacionLaboral = async (
  contratoId: number,
  input: CreateContratoUbicacionLaboralInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoUbicacionLaboralItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    await ensureUbicacionUnique(client, contratoId, input.nombre_ubicacion);

    const result = await client.query<ContratoUbicacionLaboralRow>(
      `
        INSERT INTO contrato_ubicaciones_laborales (
          contrato_id,
          nombre_ubicacion,
          descripcion,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4)
        RETURNING
          id::text AS id,
          contrato_id::text AS contrato_id,
          nombre_ubicacion,
          descripcion,
          activo,
          created_at,
          updated_at
      `,
      [contratoId, input.nombre_ubicacion, input.descripcion, input.activo]
    );

    const created = mapUbicacionLaboral(result.rows[0]!);
    await recordAudit(
      client,
      actor,
      'CREATE',
      'contrato_ubicaciones_laborales',
      String(created.id),
      null,
      created,
      'Creacion de ubicacion laboral por contrato'
    );
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateContratoUbicacionLaboral = async (
  contratoId: number,
  ubicacionId: number,
  input: UpdateContratoUbicacionLaboralInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoUbicacionLaboralItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensureUbicacionExists(client, contratoId, ubicacionId);
    const nextNombre = input.nombre_ubicacion ?? current.nombre_ubicacion;

    if (normalizeComparableText(nextNombre) !== normalizeComparableText(current.nombre_ubicacion)) {
      await ensureUbicacionUnique(client, contratoId, nextNombre, ubicacionId);
    }

    const result = await client.query<ContratoUbicacionLaboralRow>(
      `
        UPDATE contrato_ubicaciones_laborales
        SET
          nombre_ubicacion = $3,
          descripcion = $4,
          activo = $5,
          updated_at = NOW()
        WHERE id = $1::bigint
          AND contrato_id = $2::bigint
        RETURNING
          id::text AS id,
          contrato_id::text AS contrato_id,
          nombre_ubicacion,
          descripcion,
          activo,
          created_at,
          updated_at
      `,
      [
        ubicacionId,
        contratoId,
        nextNombre,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapUbicacionLaboral(result.rows[0]!);
    await recordAudit(
      client,
      actor,
      'UPDATE',
      'contrato_ubicaciones_laborales',
      String(updated.id),
      current,
      updated,
      'Actualizacion de ubicacion laboral por contrato'
    );
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listContratoPerfilesLicitacion = async (
  contratoId: number,
  query: ConfiguracionPersonalListQuery,
  tenant?: TenantAccessContext
): Promise<ContratoPerfilLicitacionItem[]> => {
  const client = await dbPool.connect();

  try {
    await assertTenantContratoAccess(client, tenant, contratoId);
  } finally {
    client.release();
  }

  const params: unknown[] = [contratoId];
  const conditions = ['cpl.contrato_id = $1::bigint'];

  if (query.activo !== undefined) {
    params.push(query.activo);
    conditions.push(`cpl.activo = $${params.length}`);
  }

  const result = await dbQuery<ContratoPerfilLicitacionRow>(
    `
      ${getPerfilSelect()}
      WHERE ${conditions.join(' AND ')}
      ORDER BY cpl.activo DESC, cpl.vigencia_desde DESC, cpl.nombre_perfil ASC, cpl.id ASC
    `,
    params
  );

  return result.rows.map(mapPerfilLicitacion);
};

export const createContratoPerfilLicitacion = async (
  contratoId: number,
  input: CreateContratoPerfilLicitacionInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoPerfilLicitacionItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    await ensurePerfilUnique(client, contratoId, {
      nombre_perfil: input.nombre_perfil,
      codigo_perfil: normalizeStableCode(input.codigo_perfil),
      vigencia_desde: input.vigencia_desde,
      vigencia_hasta: input.vigencia_hasta
    });

    if (input.contrato_cargo_equivalente_id !== null) {
      await ensureContratoCargoExists(client, contratoId, input.contrato_cargo_equivalente_id);
    }

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO contrato_perfiles_licitacion (
          contrato_id,
          codigo_perfil,
          nombre_perfil,
          cantidad_requerida,
          vigencia_desde,
          vigencia_hasta,
          contrato_cargo_equivalente_id,
          activo
        )
        VALUES ($1::bigint, $2, $3, $4::int, $5::date, $6::date, $7::bigint, $8)
        RETURNING id::text AS id
      `,
        [
        contratoId,
        normalizeStableCode(input.codigo_perfil),
        input.nombre_perfil,
        input.cantidad_requerida,
        input.vigencia_desde,
        input.vigencia_hasta,
        input.contrato_cargo_equivalente_id,
        input.activo
      ]
    );

    const created = await ensurePerfilExists(client, contratoId, toNumber(result.rows[0]!.id));
    await recordAudit(
      client,
      actor,
      'CREATE',
      'contrato_perfiles_licitacion',
      String(created.id),
      null,
      created,
      'Creacion de perfil de licitacion por contrato'
    );
    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateContratoPerfilLicitacion = async (
  contratoId: number,
  perfilId: number,
  input: UpdateContratoPerfilLicitacionInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoPerfilLicitacionItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensurePerfilExists(client, contratoId, perfilId);
    const nextValues = {
      codigo_perfil:
        input.codigo_perfil !== undefined
          ? normalizeStableCode(input.codigo_perfil)
          : current.codigo_perfil,
      nombre_perfil: input.nombre_perfil ?? current.nombre_perfil,
      cantidad_requerida: input.cantidad_requerida ?? current.cantidad_requerida,
      vigencia_desde: input.vigencia_desde ?? current.vigencia_desde,
      vigencia_hasta:
        input.vigencia_hasta !== undefined ? input.vigencia_hasta : current.vigencia_hasta,
      contrato_cargo_equivalente_id:
        input.contrato_cargo_equivalente_id !== undefined
          ? input.contrato_cargo_equivalente_id
          : current.contrato_cargo_equivalente.id,
      activo: input.activo ?? current.activo
    };

    await ensurePerfilUnique(client, contratoId, nextValues, perfilId);

    if (nextValues.contrato_cargo_equivalente_id !== null) {
      await ensureContratoCargoExists(client, contratoId, nextValues.contrato_cargo_equivalente_id);
    }

    await client.query(
      `
        UPDATE contrato_perfiles_licitacion
        SET
          codigo_perfil = $3,
          nombre_perfil = $4,
          cantidad_requerida = $5::int,
          vigencia_desde = $6::date,
          vigencia_hasta = $7::date,
          contrato_cargo_equivalente_id = $8::bigint,
          activo = $9,
          updated_at = NOW()
        WHERE id = $1::bigint
          AND contrato_id = $2::bigint
      `,
      [
        perfilId,
        contratoId,
        nextValues.codigo_perfil,
        nextValues.nombre_perfil,
        nextValues.cantidad_requerida,
        nextValues.vigencia_desde,
        nextValues.vigencia_hasta,
        nextValues.contrato_cargo_equivalente_id,
        nextValues.activo
      ]
    );

    const updated = await ensurePerfilExists(client, contratoId, perfilId);
    await recordAudit(
      client,
      actor,
      'UPDATE',
      'contrato_perfiles_licitacion',
      String(updated.id),
      current,
      updated,
      'Actualizacion de perfil de licitacion por contrato'
    );
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
