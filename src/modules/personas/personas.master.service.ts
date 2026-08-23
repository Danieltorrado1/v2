import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import { assertTenantAccessForPersonaId, type TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import type {
  CreatePersonaCuentaBancariaInput,
  CuentaBancariaEstado,
  CuentaBancariaTipoCuenta,
  PersonalExportGenerateInput,
  PersonalExportTemplatePayload,
  PersonaHistorialQuery,
  UpdatePersonaCuentaBancariaInput
} from './personas.master.schemas';

interface MutationContext {
  actorUserId: string;
  auditMeta?: AuditRequestMeta;
}

interface PersonaCuentaBancariaRow extends QueryResultRow {
  created_at: Date | string;
  created_by_user_id: number | string | null;
  documento_titular: string | null;
  entidad_bancaria: string;
  es_vigente: boolean;
  estado: CuentaBancariaEstado;
  fecha_verificacion: string | Date | null;
  id: number | string;
  nombre_titular: string | null;
  numero_cuenta: string;
  observaciones: string | null;
  persona_id: number | string;
  soporte_documento_persona_id: number | string | null;
  tipo_cuenta: CuentaBancariaTipoCuenta;
  titular: string;
  updated_at: Date | string;
  verified_by_user_id: number | string | null;
  vigencia_desde: string | Date;
  vigencia_hasta: string | Date | null;
}

interface PersonaCuentaBancaria extends Omit<PersonaCuentaBancariaRow, 'id' | 'persona_id' | 'soporte_documento_persona_id' | 'verified_by_user_id' | 'created_by_user_id' | 'created_at' | 'updated_at' | 'vigencia_desde' | 'vigencia_hasta'> {
  id: number;
  persona_id: number;
  created_at: string;
  created_by_user_id: number | null;
  numero_cuenta_mascara: string;
  soporte_documento_persona_id: number | null;
  updated_at: string;
  verified_by_user_id: number | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

interface HistorialCambioRow extends QueryResultRow {
  campo: string;
  created_at: Date | string | null;
  id: number | string;
  motivo: string | null;
  registro_id: number | string;
  tabla_afectada: string;
  usuario_correo: string | null;
  usuario_id: number | string | null;
  usuario_nombre: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
}

export interface PersonaHistorialCambio {
  campo: string;
  fecha_hora: string | null;
  id: number;
  motivo: string | null;
  registro_id: number;
  tabla_afectada: string;
  usuario_correo: string | null;
  usuario_id: number | null;
  usuario_nombre: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
}

export interface PersonalExportFieldDefinition {
  code: string;
  group:
    | 'IDENTIDAD'
    | 'CONTACTO'
    | 'LABORAL'
    | 'TERRITORIAL'
    | 'SEGURIDAD_SOCIAL'
    | 'BANCARIO';
  label: string;
}

export interface PersonalExportTemplate {
  campos: string[];
  created_at: string;
  created_by_user_id: number | null;
  formato: 'csv';
  id: number;
  nombre: string;
  orden: string[];
  updated_at: string;
}

const toRequiredNumber = (value: string | number): number => {
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

const formatDateValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const formatTimestampValue = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
};

const maskAccountNumber = (value: string): string => {
  const normalized = value.replace(/\s+/g, '');
  if (normalized.length <= 4) {
    return normalized;
  }

  return `${'•'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const mapCuentaBancaria = (
  row: PersonaCuentaBancariaRow,
  canViewFullNumber: boolean
): PersonaCuentaBancaria => ({
  id: toRequiredNumber(row.id),
  persona_id: toRequiredNumber(row.persona_id),
  entidad_bancaria: row.entidad_bancaria,
  tipo_cuenta: row.tipo_cuenta,
  numero_cuenta: canViewFullNumber ? row.numero_cuenta : maskAccountNumber(row.numero_cuenta),
  numero_cuenta_mascara: maskAccountNumber(row.numero_cuenta),
  titular: row.titular,
  nombre_titular: row.nombre_titular,
  documento_titular: row.documento_titular,
  estado: row.estado,
  fecha_verificacion: formatDateValue(row.fecha_verificacion),
  observaciones: row.observaciones,
  soporte_documento_persona_id: toNullableNumber(row.soporte_documento_persona_id),
  vigencia_desde: formatDateValue(row.vigencia_desde) ?? new Date().toISOString().slice(0, 10),
  vigencia_hasta: formatDateValue(row.vigencia_hasta),
  es_vigente: row.es_vigente,
  verified_by_user_id: toNullableNumber(row.verified_by_user_id),
  created_by_user_id: toNullableNumber(row.created_by_user_id),
  created_at: formatTimestampValue(row.created_at) ?? new Date().toISOString(),
  updated_at: formatTimestampValue(row.updated_at) ?? new Date().toISOString()
});

const getCuentaBancariaById = async (
  client: PoolClient,
  cuentaBancariaId: number
): Promise<PersonaCuentaBancariaRow | null> => {
  const result = await client.query<PersonaCuentaBancariaRow>(
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
        estado,
        fecha_verificacion,
        observaciones,
        soporte_documento_persona_id,
        vigencia_desde,
        vigencia_hasta,
        es_vigente,
        verified_by_user_id,
        created_by_user_id,
        created_at,
        updated_at
      FROM persona_cuentas_bancarias
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [cuentaBancariaId]
  );

  return result.rows[0] ?? null;
};

const ensurePersonaExists = async (client: PoolClient, personaId: number): Promise<void> => {
  const result = await client.query<{ id: number | string }>(
    `SELECT id FROM personas WHERE id = $1::bigint LIMIT 1`,
    [personaId]
  );

  if (!result.rows[0]) {
    throw new AppError('Persona not found', 404, 'PERSONA_NOT_FOUND');
  }
};

const isBankIdentityChange = (
  current: PersonaCuentaBancariaRow,
  input: UpdatePersonaCuentaBancariaInput
): boolean => {
  return (
    (hasOwn(input, 'entidad_bancaria') && input.entidad_bancaria !== current.entidad_bancaria) ||
    (hasOwn(input, 'tipo_cuenta') && input.tipo_cuenta !== current.tipo_cuenta) ||
    (hasOwn(input, 'numero_cuenta') && input.numero_cuenta !== current.numero_cuenta) ||
    (hasOwn(input, 'titular') && input.titular !== current.titular) ||
    (hasOwn(input, 'nombre_titular') && input.nombre_titular !== current.nombre_titular) ||
    (hasOwn(input, 'documento_titular') && input.documento_titular !== current.documento_titular)
  );
};

const buildAuditDescription = (fallback: string, reason: string): string =>
  reason.trim().length > 0 ? `${fallback}. Motivo: ${reason.trim()}` : fallback;

const deactivateOtherCurrentAccounts = async (
  client: PoolClient,
  personaId: number,
  excludeId: number | null,
  vigenciaHasta: string
): Promise<void> => {
  const params: unknown[] = [personaId, vigenciaHasta];
  let sql = `
    UPDATE persona_cuentas_bancarias
    SET es_vigente = FALSE,
        vigencia_hasta = COALESCE(vigencia_hasta, $2::date),
        updated_at = NOW()
    WHERE persona_id = $1::bigint
      AND es_vigente = TRUE
  `;

  if (excludeId !== null) {
    params.push(excludeId);
    sql += ` AND id <> $3::bigint`;
  }

  await client.query(sql, params);
};

const serializeForCsv = (value: string | null | undefined): string => {
  const safe = value ?? '';
  return `"${safe.replace(/"/g, '""')}"`;
};

const assertTenantAccessForContratoId = async (
  client: PoolClient,
  tenant: TenantAccessContext | undefined,
  contratoId: number
): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (tenant.empresaIds.length === 0) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }

  const contratoResult = await client.query<{ empresa_id: number | string | null }>(
    `SELECT empresa_id FROM contratos WHERE id = $1::bigint LIMIT 1`,
    [contratoId]
  );

  const empresaId = toNullableNumber(contratoResult.rows[0]?.empresa_id);

  if (empresaId === null || !tenant.empresaIds.includes(empresaId)) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }
};

export const listPersonaCuentasBancarias = async (
  personaId: number,
  options: { canViewFullNumber: boolean; actorUserId?: string | null; auditMeta?: AuditRequestMeta },
  tenant?: TenantAccessContext
): Promise<PersonaCuentaBancaria[]> => {
  await assertTenantAccessForPersonaId(tenant, String(personaId));

  const result = await dbPool.query<PersonaCuentaBancariaRow>(
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
        estado,
        fecha_verificacion,
        observaciones,
        soporte_documento_persona_id,
        vigencia_desde,
        vigencia_hasta,
        es_vigente,
        verified_by_user_id,
        created_by_user_id,
        created_at,
        updated_at
      FROM persona_cuentas_bancarias
      WHERE persona_id = $1::bigint
      ORDER BY es_vigente DESC, vigencia_desde DESC, id DESC
    `,
    [personaId]
  );

  if (options.actorUserId) {
    await registerAuditEntry({
      accion: options.canViewFullNumber
        ? 'CONSULTAR_CUENTAS_BANCARIAS_PERSONA_NUMERO_COMPLETO'
        : 'CONSULTAR_CUENTAS_BANCARIAS_PERSONA',
      after: {
        persona_id: personaId,
        total: result.rows.length
      },
      descripcion: options.canViewFullNumber
        ? 'Consulta de cuentas bancarias con numero completo'
        : 'Consulta de cuentas bancarias enmascaradas',
      registro_id: String(personaId),
      tabla: 'persona_cuentas_bancarias',
      usuario_id: options.actorUserId,
      ...options.auditMeta
    });
  }

  return result.rows.map((row) => mapCuentaBancaria(row, options.canViewFullNumber));
};

export const createPersonaCuentaBancariaWithClient = async (
  client: PoolClient,
  personaId: number,
  input: CreatePersonaCuentaBancariaInput,
  context: MutationContext,
  tenant?: TenantAccessContext
): Promise<PersonaCuentaBancaria> => {
  await assertTenantAccessForPersonaId(tenant, String(personaId));
  await ensurePersonaExists(client, personaId);

  const vigenciaDesde = input.vigencia_desde ?? new Date().toISOString().slice(0, 10);

  if (input.marcar_como_vigente !== false) {
    await deactivateOtherCurrentAccounts(client, personaId, null, vigenciaDesde);
  }

  const result = await client.query<PersonaCuentaBancariaRow>(
    `
      INSERT INTO persona_cuentas_bancarias (
        persona_id,
        entidad_bancaria,
        tipo_cuenta,
        numero_cuenta,
        titular,
        nombre_titular,
        documento_titular,
        estado,
        fecha_verificacion,
        observaciones,
        soporte_documento_persona_id,
        vigencia_desde,
        vigencia_hasta,
        es_vigente,
        verified_by_user_id,
        created_by_user_id
      )
      VALUES (
        $1::bigint,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::date,
        $10,
        $11::bigint,
        $12::date,
        NULL,
        $13,
        $14::bigint,
        $15::bigint
      )
      RETURNING
        id,
        persona_id,
        entidad_bancaria,
        tipo_cuenta,
        numero_cuenta,
        titular,
        nombre_titular,
        documento_titular,
        estado,
        fecha_verificacion,
        observaciones,
        soporte_documento_persona_id,
        vigencia_desde,
        vigencia_hasta,
        es_vigente,
        verified_by_user_id,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [
      personaId,
      input.entidad_bancaria,
      input.tipo_cuenta,
      input.numero_cuenta,
      input.titular,
      input.nombre_titular,
      input.documento_titular,
      input.estado,
      input.fecha_verificacion,
      input.observaciones,
      input.soporte_documento_persona_id,
      vigenciaDesde,
      input.marcar_como_vigente !== false,
      input.estado === 'VERIFICADA' ? Number(context.actorUserId) : null,
      Number(context.actorUserId)
    ]
  );

  const createdRow = result.rows[0];

  if (!createdRow) {
    throw new AppError('Failed to create bank account', 500, 'PERSONA_BANK_CREATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'CREAR_CUENTA_BANCARIA_PERSONA',
    after: mapCuentaBancaria(createdRow, true),
    before: null,
    client,
    descripcion: buildAuditDescription('Creacion de cuenta bancaria de persona', input.motivo_cambio),
    registro_id: String(createdRow.id),
    tabla: 'persona_cuentas_bancarias',
    usuario_id: context.actorUserId,
    ...context.auditMeta
  });

  return mapCuentaBancaria(createdRow, false);
};

export const createPersonaCuentaBancaria = async (
  personaId: number,
  input: CreatePersonaCuentaBancariaInput,
  context: MutationContext,
  tenant?: TenantAccessContext
): Promise<PersonaCuentaBancaria> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const createdAccount = await createPersonaCuentaBancariaWithClient(
      client,
      personaId,
      input,
      context,
      tenant
    );
    await client.query('COMMIT');
    return createdAccount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePersonaCuentaBancariaWithClient = async (
  client: PoolClient,
  personaId: number,
  cuentaBancariaId: number,
  input: UpdatePersonaCuentaBancariaInput,
  context: MutationContext,
  tenant?: TenantAccessContext
): Promise<PersonaCuentaBancaria> => {
  await assertTenantAccessForPersonaId(tenant, String(personaId));

  const currentRow = await getCuentaBancariaById(client, cuentaBancariaId);

  if (!currentRow || toRequiredNumber(currentRow.persona_id) !== personaId) {
    throw new AppError('Bank account not found', 404, 'PERSONA_BANK_NOT_FOUND');
  }

  const nextVigenciaDesde = input.vigencia_desde ?? formatDateValue(currentRow.vigencia_desde) ?? new Date().toISOString().slice(0, 10);

  if (isBankIdentityChange(currentRow, input)) {
    await client.query(
      `
        UPDATE persona_cuentas_bancarias
        SET es_vigente = FALSE,
            vigencia_hasta = COALESCE(vigencia_hasta, $2::date),
            updated_at = NOW()
        WHERE id = $1::bigint
      `,
      [cuentaBancariaId, nextVigenciaDesde]
    );

    if (input.es_vigente !== false) {
      await deactivateOtherCurrentAccounts(client, personaId, cuentaBancariaId, nextVigenciaDesde);
    }

    const inserted = await client.query<PersonaCuentaBancariaRow>(
      `
        INSERT INTO persona_cuentas_bancarias (
          persona_id,
          entidad_bancaria,
          tipo_cuenta,
          numero_cuenta,
          titular,
          nombre_titular,
          documento_titular,
          estado,
          fecha_verificacion,
          observaciones,
          soporte_documento_persona_id,
          vigencia_desde,
          vigencia_hasta,
          es_vigente,
          verified_by_user_id,
          created_by_user_id
        )
        VALUES (
          $1::bigint,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::date,
          $10,
          $11::bigint,
          $12::date,
          $13::date,
          $14,
          $15::bigint,
          $16::bigint
        )
        RETURNING
          id,
          persona_id,
          entidad_bancaria,
          tipo_cuenta,
          numero_cuenta,
          titular,
          nombre_titular,
          documento_titular,
          estado,
          fecha_verificacion,
          observaciones,
          soporte_documento_persona_id,
          vigencia_desde,
          vigencia_hasta,
          es_vigente,
          verified_by_user_id,
          created_by_user_id,
          created_at,
          updated_at
      `,
      [
        personaId,
        input.entidad_bancaria ?? currentRow.entidad_bancaria,
        input.tipo_cuenta ?? currentRow.tipo_cuenta,
        input.numero_cuenta ?? currentRow.numero_cuenta,
        input.titular ?? currentRow.titular,
        hasOwn(input, 'nombre_titular') ? input.nombre_titular ?? null : currentRow.nombre_titular,
        hasOwn(input, 'documento_titular') ? input.documento_titular ?? null : currentRow.documento_titular,
        input.estado ?? currentRow.estado,
        hasOwn(input, 'fecha_verificacion') ? input.fecha_verificacion ?? null : formatDateValue(currentRow.fecha_verificacion),
        hasOwn(input, 'observaciones') ? input.observaciones ?? null : currentRow.observaciones,
        hasOwn(input, 'soporte_documento_persona_id')
          ? input.soporte_documento_persona_id ?? null
          : toNullableNumber(currentRow.soporte_documento_persona_id),
        nextVigenciaDesde,
        hasOwn(input, 'vigencia_hasta') ? input.vigencia_hasta ?? null : null,
        input.es_vigente !== false,
        (input.estado ?? currentRow.estado) === 'VERIFICADA' ? Number(context.actorUserId) : null,
        Number(context.actorUserId)
      ]
    );

    const newRow = inserted.rows[0];

    if (!newRow) {
      throw new AppError('Failed to version bank account', 500, 'PERSONA_BANK_VERSION_FAILED');
    }

    await registerAuditEntry({
      accion: 'ACTUALIZAR_CUENTA_BANCARIA_PERSONA',
      after: mapCuentaBancaria(newRow, true),
      before: mapCuentaBancaria(currentRow, true),
      client,
      descripcion: buildAuditDescription('Version de cuenta bancaria de persona', input.motivo_cambio),
      registro_id: String(newRow.id),
      tabla: 'persona_cuentas_bancarias',
      usuario_id: context.actorUserId,
      ...context.auditMeta
    });

    return mapCuentaBancaria(newRow, false);
  }

  if (input.es_vigente === true) {
    await deactivateOtherCurrentAccounts(client, personaId, cuentaBancariaId, nextVigenciaDesde);
  }

  const updatedResult = await client.query<PersonaCuentaBancariaRow>(
    `
      UPDATE persona_cuentas_bancarias
      SET
        estado = $2,
        fecha_verificacion = $3::date,
        observaciones = $4,
        soporte_documento_persona_id = $5::bigint,
        vigencia_desde = $6::date,
        vigencia_hasta = $7::date,
        es_vigente = $8,
        verified_by_user_id = $9::bigint,
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING
        id,
        persona_id,
        entidad_bancaria,
        tipo_cuenta,
        numero_cuenta,
        titular,
        nombre_titular,
        documento_titular,
        estado,
        fecha_verificacion,
        observaciones,
        soporte_documento_persona_id,
        vigencia_desde,
        vigencia_hasta,
        es_vigente,
        verified_by_user_id,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [
      cuentaBancariaId,
      input.estado ?? currentRow.estado,
      hasOwn(input, 'fecha_verificacion') ? input.fecha_verificacion ?? null : formatDateValue(currentRow.fecha_verificacion),
      hasOwn(input, 'observaciones') ? input.observaciones ?? null : currentRow.observaciones,
      hasOwn(input, 'soporte_documento_persona_id')
        ? input.soporte_documento_persona_id ?? null
        : toNullableNumber(currentRow.soporte_documento_persona_id),
      nextVigenciaDesde,
      hasOwn(input, 'vigencia_hasta') ? input.vigencia_hasta ?? null : formatDateValue(currentRow.vigencia_hasta),
      hasOwn(input, 'es_vigente') ? input.es_vigente ?? currentRow.es_vigente : currentRow.es_vigente,
      (input.estado ?? currentRow.estado) === 'VERIFICADA' ? Number(context.actorUserId) : toNullableNumber(currentRow.verified_by_user_id)
    ]
  );

  const updatedRow = updatedResult.rows[0];

  if (!updatedRow) {
    throw new AppError('Failed to update bank account', 500, 'PERSONA_BANK_UPDATE_FAILED');
  }

  await registerAuditEntry({
    accion: 'ACTUALIZAR_CUENTA_BANCARIA_PERSONA',
    after: mapCuentaBancaria(updatedRow, true),
    before: mapCuentaBancaria(currentRow, true),
    client,
    descripcion: buildAuditDescription('Actualizacion de cuenta bancaria de persona', input.motivo_cambio),
    registro_id: String(updatedRow.id),
    tabla: 'persona_cuentas_bancarias',
    usuario_id: context.actorUserId,
    ...context.auditMeta
  });

  return mapCuentaBancaria(updatedRow, false);
};

export const updatePersonaCuentaBancaria = async (
  personaId: number,
  cuentaBancariaId: number,
  input: UpdatePersonaCuentaBancariaInput,
  context: MutationContext,
  tenant?: TenantAccessContext
): Promise<PersonaCuentaBancaria> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const updatedAccount = await updatePersonaCuentaBancariaWithClient(
      client,
      personaId,
      cuentaBancariaId,
      input,
      context,
      tenant
    );
    await client.query('COMMIT');
    return updatedAccount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPersonaHistorialCambios = async (
  personaId: number,
  query: PersonaHistorialQuery,
  tenant?: TenantAccessContext
): Promise<PersonaHistorialCambio[]> => {
  await assertTenantAccessForPersonaId(tenant, String(personaId));

  const result = await dbPool.query<HistorialCambioRow>(
    `
      SELECT
        hc.id,
        hc.tabla_afectada,
        hc.registro_id,
        hc.campo,
        hc.valor_anterior,
        hc.valor_nuevo,
        hc.motivo,
        hc.created_at,
        hc.usuario_id,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.nombre, u.apellido)), ''), u.correo) AS usuario_nombre,
        u.correo AS usuario_correo
      FROM historial_cambios hc
      LEFT JOIN usuarios u ON u.id = hc.usuario_id
      WHERE (
        (hc.tabla_afectada = 'personas' AND hc.registro_id = $1::bigint)
        OR (hc.tabla_afectada = 'persona_identificaciones' AND EXISTS (
          SELECT 1
          FROM persona_identificaciones pi
          WHERE pi.id = hc.registro_id
            AND pi.persona_id = $1::bigint
        ))
        OR (hc.tabla_afectada = 'persona_contactos_emergencia' AND EXISTS (
          SELECT 1
          FROM persona_contactos_emergencia pce
          WHERE pce.id = hc.registro_id
            AND pce.persona_id = $1::bigint
        ))
        OR (hc.tabla_afectada = 'sst_perfil_demografico' AND EXISTS (
          SELECT 1
          FROM sst_perfil_demografico spd
          WHERE spd.id = hc.registro_id
            AND spd.persona_id = $1::bigint
        ))
        OR (hc.tabla_afectada = 'vinculaciones' AND EXISTS (
          SELECT 1
          FROM vinculaciones v
          WHERE v.id = hc.registro_id
            AND v.persona_id = $1::bigint
        ))
        OR (hc.tabla_afectada = 'persona_cuentas_bancarias' AND EXISTS (
          SELECT 1
          FROM persona_cuentas_bancarias pcb
          WHERE pcb.id = hc.registro_id
            AND pcb.persona_id = $1::bigint
        ))
      )
      ORDER BY hc.created_at DESC NULLS LAST, hc.id DESC
      LIMIT $2::int
    `,
    [personaId, query.limit]
  );

  return result.rows
    .filter((row) => row.campo !== '__snapshot__')
    .map((row) => ({
      id: toRequiredNumber(row.id),
      tabla_afectada: row.tabla_afectada,
      registro_id: toRequiredNumber(row.registro_id),
      campo: row.campo,
      valor_anterior: row.valor_anterior,
      valor_nuevo: row.valor_nuevo,
      motivo: row.motivo,
      fecha_hora: formatTimestampValue(row.created_at),
      usuario_id: toNullableNumber(row.usuario_id),
      usuario_nombre: row.usuario_nombre,
      usuario_correo: row.usuario_correo
    }));
};

const PERSONAL_EXPORT_FIELDS: PersonalExportFieldDefinition[] = [
  { code: 'tipo_documento', group: 'IDENTIDAD', label: 'Tipo documento' },
  { code: 'documento', group: 'IDENTIDAD', label: 'Documento' },
  { code: 'nombre_completo', group: 'IDENTIDAD', label: 'Nombre completo' },
  { code: 'telefono', group: 'CONTACTO', label: 'Telefono' },
  { code: 'correo', group: 'CONTACTO', label: 'Correo' },
  { code: 'direccion', group: 'CONTACTO', label: 'Direccion' },
  { code: 'empresa', group: 'LABORAL', label: 'Empresa' },
  { code: 'contrato', group: 'LABORAL', label: 'Contrato' },
  { code: 'cargo', group: 'LABORAL', label: 'Cargo' },
  { code: 'fecha_ingreso', group: 'LABORAL', label: 'Fecha ingreso' },
  { code: 'fecha_retiro', group: 'LABORAL', label: 'Fecha retiro' },
  { code: 'estado', group: 'LABORAL', label: 'Estado' },
  { code: 'municipio', group: 'TERRITORIAL', label: 'Municipio' },
  { code: 'institucion', group: 'TERRITORIAL', label: 'Institucion' },
  { code: 'sede', group: 'TERRITORIAL', label: 'Sede' },
  { code: 'modalidad', group: 'TERRITORIAL', label: 'Modalidad' },
  { code: 'ubicacion_laboral', group: 'TERRITORIAL', label: 'Ubicacion laboral' },
  { code: 'eps', group: 'SEGURIDAD_SOCIAL', label: 'EPS' },
  { code: 'afp', group: 'SEGURIDAD_SOCIAL', label: 'AFP' },
  { code: 'arl', group: 'SEGURIDAD_SOCIAL', label: 'ARL' },
  { code: 'caja', group: 'SEGURIDAD_SOCIAL', label: 'Caja' },
  { code: 'banco', group: 'BANCARIO', label: 'Banco' },
  { code: 'tipo_cuenta', group: 'BANCARIO', label: 'Tipo cuenta' },
  { code: 'numero_cuenta', group: 'BANCARIO', label: 'Numero cuenta' }
];

const PERSONAL_EXPORT_HEADERS = new Map(PERSONAL_EXPORT_FIELDS.map((field) => [field.code, field.label]));

export const getPersonalExportFieldCatalog = (): PersonalExportFieldDefinition[] =>
  PERSONAL_EXPORT_FIELDS;

export const savePersonalExportTemplate = async (
  payload: PersonalExportTemplatePayload,
  actorUserId: string
): Promise<PersonalExportTemplate> => {
  const result = await dbPool.query<{
    campos: string[];
    created_at: Date | string;
    created_by_user_id: string | number | null;
    formato: 'csv';
    id: string | number;
    nombre: string;
    orden: string[];
    updated_at: Date | string;
  }>(
    `
      INSERT INTO personal_export_templates (
        nombre,
        campos,
        orden,
        formato,
        created_by_user_id
      )
      VALUES ($1, $2::jsonb, $3::jsonb, $4, $5::bigint)
      RETURNING id, nombre, campos, orden, formato, created_by_user_id, created_at, updated_at
    `,
    [payload.nombre, JSON.stringify(payload.campos), JSON.stringify(payload.orden), payload.formato, Number(actorUserId)]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to save export template', 500, 'PERSONAL_EXPORT_TEMPLATE_CREATE_FAILED');
  }

  return {
    id: toRequiredNumber(row.id),
    nombre: row.nombre,
    campos: row.campos,
    orden: row.orden,
    formato: row.formato,
    created_by_user_id: toNullableNumber(row.created_by_user_id),
    created_at: formatTimestampValue(row.created_at) ?? new Date().toISOString(),
    updated_at: formatTimestampValue(row.updated_at) ?? new Date().toISOString()
  };
};

export const listPersonalExportTemplates = async (): Promise<PersonalExportTemplate[]> => {
  const result = await dbPool.query<{
    campos: string[];
    created_at: Date | string;
    created_by_user_id: string | number | null;
    formato: 'csv';
    id: string | number;
    nombre: string;
    orden: string[];
    updated_at: Date | string;
  }>(
    `
      SELECT id, nombre, campos, orden, formato, created_by_user_id, created_at, updated_at
      FROM personal_export_templates
      ORDER BY nombre ASC
    `
  );

  return result.rows.map((row) => ({
    id: toRequiredNumber(row.id),
    nombre: row.nombre,
    campos: row.campos,
    orden: row.orden,
    formato: row.formato,
    created_by_user_id: toNullableNumber(row.created_by_user_id),
    created_at: formatTimestampValue(row.created_at) ?? new Date().toISOString(),
    updated_at: formatTimestampValue(row.updated_at) ?? new Date().toISOString()
  }));
};

export const generatePersonalExport = async (
  input: PersonalExportGenerateInput,
  options: {
    actorUserId: string;
    canViewFullAccountNumber: boolean;
    auditMeta?: AuditRequestMeta;
  },
  tenant?: TenantAccessContext
): Promise<{ content: string; fileName: string }> => {
  const client = await dbPool.connect();

  try {
    await assertTenantAccessForContratoId(client, tenant, input.contrato_id);

    const selectedIds = input.scope === 'SELECCIONADOS' ? input.selected_vinculacion_ids : [];
    const params: unknown[] = [input.contrato_id, input.fecha ?? new Date().toISOString().slice(0, 10)];
    const conditions: string[] = ['v.contrato_id = $1::bigint', '$2::date IS NOT NULL'];
    let paramIndex = 3;

    if (input.municipio_id !== null && input.municipio_id !== undefined) {
      params.push(input.municipio_id);
      conditions.push(`EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
          AND ff_f.municipio_id = $${paramIndex}::bigint
      )`);
      paramIndex += 1;
    }

    if (input.institucion_id !== null && input.institucion_id !== undefined) {
      params.push(input.institucion_id);
      conditions.push(`EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
          AND ff_f.institucion_id = $${paramIndex}::bigint
      )`);
      paramIndex += 1;
    }

    if (input.sede_id !== null && input.sede_id !== undefined) {
      params.push(input.sede_id);
      conditions.push(`EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
          AND ff_f.sede_id = $${paramIndex}::bigint
      )`);
      paramIndex += 1;
    }

    if (input.modalidad_id !== null && input.modalidad_id !== undefined) {
      params.push(input.modalidad_id);
      conditions.push(`EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        INNER JOIN focalizacion_final ff_f ON ff_f.id = ca_f.focalizacion_final_id
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
          AND ff_f.modalidad_id = $${paramIndex}::bigint
      )`);
      paramIndex += 1;
    }

    if (input.ubicacion_laboral_id !== null && input.ubicacion_laboral_id !== undefined) {
      params.push(input.ubicacion_laboral_id);
      conditions.push(`EXISTS (
        SELECT 1
        FROM personal_asignaciones_laborales pal_f
        WHERE pal_f.vinculacion_id = v.id
          AND pal_f.ubicacion_laboral_id = $${paramIndex}::bigint
          AND pal_f.estado = 'ACTIVA'
          AND pal_f.vigencia_desde <= $2::date
          AND (pal_f.vigencia_hasta IS NULL OR pal_f.vigencia_hasta >= $2::date)
      )`);
      paramIndex += 1;
    }

    if (input.cobertura === 'SI') {
      conditions.push(`EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
      )`);
    }

    if (input.cobertura === 'NO') {
      conditions.push(`NOT EXISTS (
        SELECT 1
        FROM cobertura_asignaciones ca_f
        WHERE ca_f.vinculacion_id = v.id
          AND ca_f.activo = TRUE
          AND ca_f.fecha_inicio <= $2::date
          AND (ca_f.fecha_fin IS NULL OR ca_f.fecha_fin >= $2::date)
      )`);
    }

    if (input.cobertura === 'RETIRADA') {
      conditions.push(`v.fecha_fin IS NOT NULL AND v.fecha_fin < $2::date`);
    }

    if (input.licitacion === 'PRESENTADA') {
      conditions.push(`EXISTS (
        SELECT 1
        FROM personal_presentaciones_licitacion ppl_f
        WHERE ppl_f.vinculacion_id = v.id
          AND ppl_f.estado = 'PRESENTADA'
          AND ppl_f.vigencia_desde <= $2::date
          AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $2::date)
      )`);
    }

    if (input.licitacion === 'NO_PRESENTADA') {
      conditions.push(`NOT EXISTS (
        SELECT 1
        FROM personal_presentaciones_licitacion ppl_f
        WHERE ppl_f.vinculacion_id = v.id
          AND ppl_f.estado = 'PRESENTADA'
          AND ppl_f.vigencia_desde <= $2::date
          AND (ppl_f.vigencia_hasta IS NULL OR ppl_f.vigencia_hasta >= $2::date)
      )`);
    }

    if (input.contrato_cargo_id !== null && input.contrato_cargo_id !== undefined) {
      params.push(input.contrato_cargo_id);
      conditions.push(`v.contrato_cargo_id = $${paramIndex}::bigint`);
      paramIndex += 1;
    }

    if (input.estado_vinculacion) {
      if (input.estado_vinculacion === 'ACTIVA') {
        conditions.push(`v.estado_vinculacion = ANY(ARRAY['ACTIVA', 'ACTIVO'])`);
      } else {
        params.push(input.estado_vinculacion);
        conditions.push(`v.estado_vinculacion = $${paramIndex}`);
        paramIndex += 1;
      }
    }

    if (input.search) {
      params.push(`%${input.search}%`);
      conditions.push(`(
        p.numero_documento ILIKE $${paramIndex}
        OR p.primer_nombre ILIKE $${paramIndex}
        OR COALESCE(p.segundo_nombre, '') ILIKE $${paramIndex}
        OR p.primer_apellido ILIKE $${paramIndex}
        OR COALESCE(p.segundo_apellido, '') ILIKE $${paramIndex}
      )`);
      paramIndex += 1;
    }

    if (selectedIds.length > 0) {
      params.push(selectedIds);
      conditions.push(`v.id = ANY($${paramIndex}::bigint[])`);
      paramIndex += 1;
    } else if (input.scope === 'SELECCIONADOS') {
      throw new AppError('At least one selected vinculation is required', 400, 'PERSONAL_EXPORT_SELECTED_REQUIRED');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const result = await client.query<QueryResultRow & Record<string, unknown>>(
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
          ORDER BY ca.vinculacion_id, ca.fecha_inicio DESC, ca.id DESC
        ),
        asignacion_laboral_actual AS (
          SELECT DISTINCT ON (pal.vinculacion_id)
            pal.vinculacion_id,
            cul.nombre_ubicacion
          FROM personal_asignaciones_laborales pal
          INNER JOIN contrato_ubicaciones_laborales cul ON cul.id = pal.ubicacion_laboral_id
          WHERE pal.estado = 'ACTIVA'
          ORDER BY pal.vinculacion_id, pal.vigencia_desde DESC, pal.id DESC
        ),
        afiliacion_actual AS (
          SELECT DISTINCT ON (va.vinculacion_id)
            va.vinculacion_id,
            e.nombre AS eps,
            fp.nombre AS afp,
            a.nombre AS arl,
            cc.nombre AS caja
          FROM vinculacion_afiliaciones va
          LEFT JOIN eps e ON e.id = va.eps_id
          LEFT JOIN fondos_pension fp ON fp.id = va.pension_id
          LEFT JOIN arl a ON a.id = va.arl_id
          LEFT JOIN cajas_compensacion cc ON cc.id = va.caja_compensacion_id
          WHERE va.activo = TRUE
          ORDER BY va.vinculacion_id, va.id DESC
        ),
        cuenta_bancaria_actual AS (
          SELECT DISTINCT ON (pcb.persona_id)
            pcb.persona_id,
            pcb.entidad_bancaria,
            pcb.tipo_cuenta,
            pcb.numero_cuenta
          FROM persona_cuentas_bancarias pcb
          WHERE pcb.es_vigente = TRUE
          ORDER BY pcb.persona_id, pcb.vigencia_desde DESC, pcb.id DESC
        )
        SELECT
          td.nombre_documento AS tipo_documento,
          p.numero_documento AS documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre_completo,
          p.telefono,
          p.correo,
          p.direccion,
          e.nombre_empresa AS empresa,
          c.numero_contrato AS contrato,
          cc.nombre_cargo AS cargo,
          v.fecha_inicio AS fecha_ingreso,
          v.fecha_fin AS fecha_retiro,
          v.estado_vinculacion AS estado,
          ca.municipio_actual AS municipio,
          ca.institucion,
          ca.sede,
          ca.modalidad,
          ala.nombre_ubicacion AS ubicacion_laboral,
          af.eps,
          af.afp,
          af.arl,
          af.caja,
          cba.entidad_bancaria AS banco,
          cba.tipo_cuenta,
          cba.numero_cuenta
        FROM vinculaciones v
        INNER JOIN personas p ON p.id = v.persona_id
        LEFT JOIN tipos_documentos td ON td.id = p.tipo_documento_id
        LEFT JOIN empresas e ON e.id = v.empresa_id
        LEFT JOIN contratos c ON c.id = v.contrato_id
        LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
        LEFT JOIN cobertura_actual ca ON ca.vinculacion_id = v.id
        LEFT JOIN asignacion_laboral_actual ala ON ala.vinculacion_id = v.id
        LEFT JOIN afiliacion_actual af ON af.vinculacion_id = v.id
        LEFT JOIN cuenta_bancaria_actual cba ON cba.persona_id = p.id
        ${whereClause}
        ORDER BY nombre_completo ASC, documento ASC
      `,
      params
    );

    const requestedFields = input.fields.filter((field) => PERSONAL_EXPORT_HEADERS.has(field));
    if (requestedFields.length === 0) {
      throw new AppError('At least one valid field is required', 400, 'PERSONAL_EXPORT_FIELDS_REQUIRED');
    }

    const headerLine = requestedFields
      .map((field) => serializeForCsv(PERSONAL_EXPORT_HEADERS.get(field) ?? field))
      .join(',');

    const rows = result.rows.map((row) =>
      requestedFields
        .map((field) => {
          const raw = row[field] == null
            ? ''
            : field === 'numero_cuenta' && !options.canViewFullAccountNumber
              ? maskAccountNumber(String(row[field]))
              : String(row[field]);
          return serializeForCsv(raw);
        })
        .join(',')
    );

    const content = [headerLine, ...rows].join('\n');

    await registerAuditEntry({
      accion: 'EXPORTAR_PERSONAL_MASTER',
      after: {
        contrato_id: input.contrato_id,
        fields: requestedFields,
        rows: result.rows.length,
        scope: input.scope
      },
      descripcion: 'Exportacion configurable de personal',
      registro_id: `${input.contrato_id}:${Date.now()}`,
      tabla: 'personal_export_templates',
      usuario_id: options.actorUserId,
      ...options.auditMeta
    });

    return {
      content,
      fileName: `personal-${input.contrato_id}-${new Date().toISOString().slice(0, 10)}.csv`
    };
  } finally {
    client.release();
  }
};
