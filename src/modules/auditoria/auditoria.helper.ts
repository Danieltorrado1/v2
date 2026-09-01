import { Request } from 'express';
import type { PoolClient } from 'pg';

import { dbPool } from '../../config/db';
import { registerAuditEvent } from './auditoria.service';

export interface AuditRequestMeta {
  ip?: string | null;
  user_agent?: string | null;
}

export interface RegisterAuditEntryInput extends AuditRequestMeta {
  accion: string;
  after?: unknown;
  before?: unknown;
  client?: PoolClient;
  contrato_id?: string | number | null;
  descripcion: string;
  empresa_id?: string | number | null;
  registro_id: string;
  tabla: string;
  usuario_id?: string | null;
}

const createSavepointName = (): string => {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `audit_sp_${Date.now()}_${randomSuffix}`;
};

const shouldWriteHistorial = (input: RegisterAuditEntryInput): boolean => {
  return input.before !== undefined || input.after !== undefined;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeHistorialValue = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  return JSON.stringify(value);
};

const flattenAuditObject = (
  value: unknown,
  prefix = ''
): Record<string, string | null> => {
  if (!isPlainObject(value)) {
    return prefix
      ? { [prefix]: normalizeHistorialValue(value) }
      : { root: normalizeHistorialValue(value) };
  }

  const entries: Record<string, string | null> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(nestedValue)) {
      Object.assign(entries, flattenAuditObject(nestedValue, nextPrefix));
      continue;
    }

    entries[nextPrefix] = normalizeHistorialValue(nestedValue);
  }

  return entries;
};

const buildHistorialDiffRows = (
  input: RegisterAuditEntryInput
): Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }> => {
  const beforeFlat = flattenAuditObject(input.before ?? null);
  const afterFlat = flattenAuditObject(input.after ?? null);
  const keys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)]);
  const rows: Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }> =
    [];

  for (const key of keys) {
    const previousValue = beforeFlat[key] ?? null;
    const nextValue = afterFlat[key] ?? null;

    if (previousValue === nextValue) {
      continue;
    }

    rows.push({
      campo: key,
      valor_anterior: previousValue,
      valor_nuevo: nextValue
    });
  }

  return rows;
};

const insertHistorialDiffRows = async (
  client: PoolClient,
  input: RegisterAuditEntryInput,
  diffRows: Array<{ campo: string; valor_anterior: string | null; valor_nuevo: string | null }>
): Promise<void> => {
  if (diffRows.length === 0) {
    return;
  }

  await client.query(
    `
      INSERT INTO historial_cambios (
        usuario_id,
        tabla_afectada,
        registro_id,
        campo,
        valor_anterior,
        valor_nuevo,
        motivo
      )
      SELECT
        $1::bigint,
        $2,
        $3::bigint,
        diff.campo,
        diff.valor_anterior,
        diff.valor_nuevo,
        $4
      FROM UNNEST(
        $5::text[],
        $6::text[],
        $7::text[]
      ) AS diff(campo, valor_anterior, valor_nuevo)
    `,
    [
      toLegacyBigInt(input.usuario_id ?? null),
      input.tabla,
      toLegacyBigInt(input.registro_id),
      input.descripcion,
      diffRows.map((row) => row.campo),
      diffRows.map((row) => row.valor_anterior),
      diffRows.map((row) => row.valor_nuevo)
    ]
  );
};

const toLegacyBigInt = (value: string | null | undefined): number | null => {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const deriveModuleFromTable = (tableName: string): string => {
  const normalized = tableName.trim().toLowerCase();

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

  if (normalized.startsWith('alerta')) {
    return 'ALERTAS';
  }

  return tableName.toUpperCase();
};

const insertLegacyAuditRows = async (
  client: PoolClient,
  input: RegisterAuditEntryInput
): Promise<void> => {
  const legacyRegistroId = toLegacyBigInt(input.registro_id);
  const legacyUsuarioId = toLegacyBigInt(input.usuario_id ?? null);

  if (legacyRegistroId === null) {
    return;
  }

  const beforeData = input.before ?? null;
  const afterData = input.after ?? null;

  await client.query(
    `
      INSERT INTO auditoria (
        usuario_id,
        accion,
        tabla_afectada,
        registro_id,
        descripcion,
        datos_anteriores,
        datos_nuevos,
        ip,
        user_agent
      )
      VALUES ($1::bigint, $2, $3, $4::bigint, $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [
      legacyUsuarioId,
      input.accion,
      input.tabla,
      legacyRegistroId,
      input.descripcion,
      JSON.stringify(beforeData),
      JSON.stringify(afterData),
      input.ip ?? null,
      input.user_agent ?? null
    ]
  );

  if (!shouldWriteHistorial(input)) {
    return;
  }

  await client.query(
    `
      INSERT INTO historial_cambios (
        usuario_id,
        tabla_afectada,
        registro_id,
        campo,
        valor_anterior,
        valor_nuevo,
        motivo
      )
      VALUES ($1::bigint, $2, $3::bigint, $4, $5, $6, $7)
    `,
    [
      legacyUsuarioId,
      input.tabla,
      legacyRegistroId,
      '__snapshot__',
      beforeData === null ? null : JSON.stringify(beforeData),
      afterData === null ? null : JSON.stringify(afterData),
      input.descripcion
    ]
  );

  const diffRows = buildHistorialDiffRows(input);
  await insertHistorialDiffRows(client, input, diffRows);
};

export const registerAuditEntry = async (
  input: RegisterAuditEntryInput
): Promise<void> => {
  if (!input.tabla || !input.registro_id || !input.accion) {
    console.error('Audit entry skipped: missing required fields', {
      accion: input.accion,
      registro_id: input.registro_id,
      tabla: input.tabla
    });
    return;
  }

  try {
    await registerAuditEvent({
      accion: input.accion,
      client: input.client,
      datos_anteriores: input.before,
      datos_nuevos: input.after,
      descripcion: input.descripcion,
      entidad: input.tabla,
      entidad_id: input.registro_id,
      empresa_id: input.empresa_id ?? null,
      contrato_id: input.contrato_id ?? null,
      ip_address: input.ip ?? null,
      modulo: deriveModuleFromTable(input.tabla),
      user_agent: input.user_agent ?? null,
      usuario_id: input.usuario_id ?? null
    });
  } catch (error) {
    console.error('Failed to register centralized audit event', {
      accion: input.accion,
      error,
      registro_id: input.registro_id,
      tabla: input.tabla
    });
  }

  if (input.client) {
    const savepointName = createSavepointName();

    try {
      await input.client.query(`SAVEPOINT ${savepointName}`);
      await insertLegacyAuditRows(input.client, input);
      await input.client.query(`RELEASE SAVEPOINT ${savepointName}`);
    } catch (error) {
      try {
        await input.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        await input.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      } catch (rollbackError) {
        console.error('Failed to rollback audit savepoint', rollbackError);
      }

      console.error('Failed to register audit entry', {
        accion: input.accion,
        error,
        registro_id: input.registro_id,
        tabla: input.tabla
      });
    }

    return;
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await insertLegacyAuditRows(client, input);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback standalone audit transaction', rollbackError);
    }

    console.error('Failed to register audit entry', {
      accion: input.accion,
      error,
      registro_id: input.registro_id,
      tabla: input.tabla
    });
  } finally {
    client.release();
  }
};

export const getAuditRequestMeta = (req: Request): AuditRequestMeta => {
  return {
    ip: req.ip ?? null,
    user_agent: req.get('user-agent') ?? null
  };
};
