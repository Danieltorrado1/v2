import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { ensureTipoDocumentoExists } from '../documentos/documentos.validator';
import type {
  CreateContratoRequisitoDocumentalInput,
  ContratoRequisitoListQuery,
  UpdateContratoRequisitoDocumentalInput
} from './configuracion.documentos.schemas';

interface ActorMeta {
  ip: string | null;
  userAgent: string | null;
  userId: string;
}

interface RequisitoRow extends QueryResultRow {
  activo: boolean;
  ambito_documental: 'PERSONA' | 'VINCULACION';
  contrato_cargo_id: string | null;
  contrato_cargo_nombre: string | null;
  contrato_id: string;
  dias_proximo_vencimiento: number;
  id: string;
  nombre_requisito: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_alcance: string | null;
  tipo_documento_codigo: string | null;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
  tipo_vinculacion_codigo: string | null;
  tipo_vinculacion_id: string | null;
  tipo_vinculacion_nombre: string | null;
  updated_at: Date;
  vigencia_meses: number | null;
}

export interface ContratoRequisitoDocumentalItem {
  activo: boolean;
  ambito_documental: 'PERSONA' | 'VINCULACION';
  cargo: {
    id: number | null;
    nombre: string | null;
  };
  contrato_id: number;
  dias_proximo_vencimiento: number;
  id: number;
  nombre_requisito: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento: {
    alcance: string | null;
    codigo: string | null;
    id: number;
    nombre: string | null;
  };
  tipo_vinculacion: {
    codigo: string | null;
    id: number | null;
    nombre: string | null;
  };
  updated_at: string;
  vigencia_meses: number | null;
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

const mapRequisito = (row: RequisitoRow): ContratoRequisitoDocumentalItem => ({
  id: toNumber(row.id),
  contrato_id: toNumber(row.contrato_id),
  nombre_requisito: row.nombre_requisito,
  ambito_documental: row.ambito_documental,
  obligatorio: row.obligatorio,
  requiere_fecha_expedicion: row.requiere_fecha_expedicion,
  requiere_fecha_vencimiento: row.requiere_fecha_vencimiento,
  vigencia_meses: row.vigencia_meses,
  dias_proximo_vencimiento: row.dias_proximo_vencimiento,
  activo: row.activo,
  updated_at: row.updated_at.toISOString(),
  tipo_documento: {
    id: toNumber(row.tipo_documento_id),
    codigo: row.tipo_documento_codigo,
    nombre: row.tipo_documento_nombre,
    alcance: row.tipo_documento_alcance
  },
  cargo: {
    id: toNullableNumber(row.contrato_cargo_id),
    nombre: row.contrato_cargo_nombre
  },
  tipo_vinculacion: {
    id: toNullableNumber(row.tipo_vinculacion_id),
    codigo: row.tipo_vinculacion_codigo,
    nombre: row.tipo_vinculacion_nombre
  }
});

const getRequirementSelect = () => `
  SELECT
    r.id::text AS id,
    r.contrato_id::text AS contrato_id,
    r.nombre_requisito,
    r.ambito_documental,
    r.obligatorio,
    r.requiere_fecha_expedicion,
    r.requiere_fecha_vencimiento,
    r.vigencia_meses,
    r.dias_proximo_vencimiento,
    r.activo,
    r.updated_at,
    r.tipo_documento_id::text AS tipo_documento_id,
    td.codigo AS tipo_documento_codigo,
    td.nombre_documento AS tipo_documento_nombre,
    td.alcance AS tipo_documento_alcance,
    r.contrato_cargo_id::text AS contrato_cargo_id,
    cc.nombre_cargo AS contrato_cargo_nombre,
    r.tipo_vinculacion_id::text AS tipo_vinculacion_id,
    tv.codigo AS tipo_vinculacion_codigo,
    tv.nombre_vinculacion AS tipo_vinculacion_nombre
  FROM contrato_documento_requisitos r
  INNER JOIN tipos_documentos td ON td.id = r.tipo_documento_id
  LEFT JOIN contrato_cargos cc ON cc.id = r.contrato_cargo_id
  LEFT JOIN tipos_vinculacion tv ON tv.id = r.tipo_vinculacion_id
  WHERE r.objetivo_requisito = 'VINCULACION'
`;

const ensureRequirementExists = async (
  client: PoolClient,
  contratoId: number,
  requisitoId: number
): Promise<ContratoRequisitoDocumentalItem> => {
  const result = await client.query<RequisitoRow>(
    `
      ${getRequirementSelect()}
        AND r.contrato_id = $1::bigint
        AND r.id = $2::bigint
      LIMIT 1
      FOR UPDATE OF r
    `,
    [contratoId, requisitoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError(
      'Contrato requisito documental not found',
      404,
      'CONTRATO_REQUISITO_DOCUMENTAL_NOT_FOUND'
    );
  }

  return mapRequisito(row);
};

const ensureRequirementUnique = async (
  client: PoolClient,
  input: {
    ambito_documental: 'PERSONA' | 'VINCULACION';
    contrato_cargo_id: number | null;
    contrato_id: number;
    requisitoId?: number;
    tipo_documento_id: number;
    tipo_vinculacion_id: number | null;
  }
): Promise<void> => {
  const params: unknown[] = [
    input.contrato_id,
    input.tipo_documento_id,
    input.ambito_documental,
    input.contrato_cargo_id,
    input.tipo_vinculacion_id
  ];
  let sql = `
    SELECT id::text AS id
    FROM contrato_documento_requisitos
    WHERE contrato_id = $1::bigint
      AND objetivo_requisito = 'VINCULACION'
      AND tipo_documento_id = $2::bigint
      AND ambito_documental = $3
      AND COALESCE(contrato_cargo_id, -1) = COALESCE($4::bigint, -1)
      AND COALESCE(tipo_vinculacion_id, -1) = COALESCE($5::bigint, -1)
      AND activo = TRUE
  `;

  if (input.requisitoId !== undefined) {
    params.push(input.requisitoId);
    sql += ` AND id <> $${params.length}::bigint`;
  }

  sql += ' LIMIT 1';

  const result = await client.query<{ id: string }>(sql, params);

  if (result.rows[0]) {
    throw new AppError(
      'Ya existe un requisito documental activo con el mismo contexto.',
      409,
      'CONTRATO_REQUISITO_DOCUMENTAL_DUPLICATE'
    );
  }
};

const recordAudit = async (
  client: PoolClient,
  actor: ActorMeta,
  action: string,
  recordId: string,
  before: unknown,
  after: unknown,
  description: string
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actor.userId,
    accion: action,
    tabla: 'contrato_documento_requisitos',
    registro_id: recordId,
    descripcion: description,
    before,
    after,
    ip: actor.ip,
    user_agent: actor.userAgent
  });
};

export const listContratoRequisitosDocumentales = async (
  contratoId: number,
  query: ContratoRequisitoListQuery,
  tenant?: TenantAccessContext
): Promise<ContratoRequisitoDocumentalItem[]> => {
  const client = await dbPool.connect();

  try {
    await assertTenantContratoAccess(client, tenant, contratoId);
  } finally {
    client.release();
  }

  const params: unknown[] = [contratoId];
  const clauses = [`r.contrato_id = $1::bigint`];

  if (query.activo !== undefined) {
    params.push(query.activo);
    clauses.push(`r.activo = $${params.length}`);
  }

  if (query.contrato_cargo_id !== undefined && query.contrato_cargo_id !== null) {
    params.push(query.contrato_cargo_id);
    clauses.push(`r.contrato_cargo_id = $${params.length}::bigint`);
  }

  if (query.tipo_vinculacion_id !== undefined && query.tipo_vinculacion_id !== null) {
    params.push(query.tipo_vinculacion_id);
    clauses.push(`r.tipo_vinculacion_id = $${params.length}::bigint`);
  }

  const result = await dbQuery<RequisitoRow>(
    `
      ${getRequirementSelect()}
        AND ${clauses.join(' AND ')}
      ORDER BY
        COALESCE(cc.nombre_cargo, '') ASC,
        COALESCE(tv.nombre_vinculacion, '') ASC,
        td.nombre_documento ASC,
        r.id ASC
    `,
    params
  );

  return result.rows.map(mapRequisito);
};

export const createContratoRequisitoDocumental = async (
  contratoId: number,
  input: CreateContratoRequisitoDocumentalInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoRequisitoDocumentalItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const tipoDocumento = await ensureTipoDocumentoExists(String(input.tipo_documento_id), client);
    await ensureRequirementUnique(client, {
      contrato_id: contratoId,
      tipo_documento_id: input.tipo_documento_id,
      ambito_documental: input.ambito_documental,
      contrato_cargo_id: input.contrato_cargo_id,
      tipo_vinculacion_id: input.tipo_vinculacion_id
    });

    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO contrato_documento_requisitos (
          contrato_id,
          tipo_documento_id,
          categoria,
          nombre_requisito,
          obligatorio,
          criticidad,
          activo,
          objetivo_requisito,
          ambito_documental,
          contrato_cargo_id,
          tipo_vinculacion_id,
          requiere_fecha_expedicion,
          requiere_fecha_vencimiento,
          vigencia_meses,
          dias_proximo_vencimiento
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          'EJECUCION',
          $3,
          $4,
          'MEDIA',
          $5,
          'VINCULACION',
          $6,
          $7::bigint,
          $8::bigint,
          $9,
          $10,
          $11::int,
          30
        )
        RETURNING id::text AS id
      `,
      [
        contratoId,
        input.tipo_documento_id,
        tipoDocumento.nombre_documento ?? `Tipo ${tipoDocumento.id}`,
        input.obligatorio,
        input.activo,
        input.ambito_documental,
        input.contrato_cargo_id,
        input.tipo_vinculacion_id,
        input.requiere_fecha_expedicion,
        input.requiere_fecha_vencimiento,
        input.vigencia_meses
      ]
    );

    const requisitoId = toNumber(insertResult.rows[0]?.id ?? '');
    const created = await ensureRequirementExists(client, contratoId, requisitoId);
    await recordAudit(
      client,
      actor,
      'CREATE',
      String(created.id),
      null,
      created,
      'Creacion de requisito documental de trabajador por contrato'
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

export const updateContratoRequisitoDocumental = async (
  contratoId: number,
  requisitoId: number,
  input: UpdateContratoRequisitoDocumentalInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoRequisitoDocumentalItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensureRequirementExists(client, contratoId, requisitoId);
    const nextTipoDocumentoId = input.tipo_documento_id ?? current.tipo_documento.id;

    if (input.tipo_documento_id !== undefined) {
      await ensureTipoDocumentoExists(String(input.tipo_documento_id), client);
    }

    const tipoDocumento = nextTipoDocumentoId !== current.tipo_documento.id
      ? await ensureTipoDocumentoExists(String(nextTipoDocumentoId), client)
      : {
          id: String(current.tipo_documento.id),
          nombre_documento: current.tipo_documento.nombre
        };

    const nextValues = {
      tipo_documento_id: nextTipoDocumentoId,
      ambito_documental: input.ambito_documental ?? current.ambito_documental,
      obligatorio: input.obligatorio ?? current.obligatorio,
      contrato_cargo_id:
        Object.prototype.hasOwnProperty.call(input, 'contrato_cargo_id')
          ? input.contrato_cargo_id ?? null
          : current.cargo.id,
      tipo_vinculacion_id:
        Object.prototype.hasOwnProperty.call(input, 'tipo_vinculacion_id')
          ? input.tipo_vinculacion_id ?? null
          : current.tipo_vinculacion.id,
      requiere_fecha_expedicion:
        input.requiere_fecha_expedicion ?? current.requiere_fecha_expedicion,
      requiere_fecha_vencimiento:
        input.requiere_fecha_vencimiento ?? current.requiere_fecha_vencimiento,
      vigencia_meses:
        Object.prototype.hasOwnProperty.call(input, 'vigencia_meses')
          ? input.vigencia_meses ?? null
          : current.vigencia_meses,
      activo: input.activo ?? current.activo
    };

    await ensureRequirementUnique(client, {
      contrato_id: contratoId,
      requisitoId,
      tipo_documento_id: nextValues.tipo_documento_id,
      ambito_documental: nextValues.ambito_documental,
      contrato_cargo_id: nextValues.contrato_cargo_id,
      tipo_vinculacion_id: nextValues.tipo_vinculacion_id
    });

    await client.query(
      `
        UPDATE contrato_documento_requisitos
        SET
          tipo_documento_id = $3::bigint,
          nombre_requisito = $4,
          obligatorio = $5,
          activo = $6,
          ambito_documental = $7,
          contrato_cargo_id = $8::bigint,
          tipo_vinculacion_id = $9::bigint,
          requiere_fecha_expedicion = $10,
          requiere_fecha_vencimiento = $11,
          vigencia_meses = $12::int,
          updated_at = NOW()
        WHERE contrato_id = $1::bigint
          AND id = $2::bigint
      `,
      [
        contratoId,
        requisitoId,
        nextValues.tipo_documento_id,
        tipoDocumento.nombre_documento ?? `Tipo ${tipoDocumento.id}`,
        nextValues.obligatorio,
        nextValues.activo,
        nextValues.ambito_documental,
        nextValues.contrato_cargo_id,
        nextValues.tipo_vinculacion_id,
        nextValues.requiere_fecha_expedicion,
        nextValues.requiere_fecha_vencimiento,
        nextValues.vigencia_meses
      ]
    );

    const updated = await ensureRequirementExists(client, contratoId, requisitoId);
    await recordAudit(
      client,
      actor,
      'UPDATE',
      String(updated.id),
      current,
      updated,
      'Actualizacion de requisito documental de trabajador por contrato'
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

export const setContratoRequisitoDocumentalEstado = async (
  contratoId: number,
  requisitoId: number,
  activo: boolean,
  actor: ActorMeta,
  tenant?: TenantAccessContext
): Promise<ContratoRequisitoDocumentalItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await assertTenantContratoAccess(client, tenant, contratoId);
    const current = await ensureRequirementExists(client, contratoId, requisitoId);

    await client.query(
      `
        UPDATE contrato_documento_requisitos
        SET activo = $3,
            updated_at = NOW()
        WHERE contrato_id = $1::bigint
          AND id = $2::bigint
      `,
      [contratoId, requisitoId, activo]
    );

    const updated = await ensureRequirementExists(client, contratoId, requisitoId);
    await recordAudit(
      client,
      actor,
      activo ? 'ACTIVATE' : 'DEACTIVATE',
      String(updated.id),
      current,
      updated,
      `${activo ? 'Activacion' : 'Desactivacion'} de requisito documental de trabajador por contrato`
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
