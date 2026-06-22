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
  descripcion: string;
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

const isUuidLike = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
  const beforeData = input.before ?? null;
  const afterData = input.after ?? null;

  await client.query(
    `
      INSERT INTO auditoria (
        usuario_id,
        accion,
        tabla,
        registro_id,
        descripcion,
        before_data,
        after_data,
        ip,
        user_agent
      )
      VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [
      input.usuario_id ?? null,
      input.accion,
      input.tabla,
      input.registro_id,
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
        accion,
        tabla,
        registro_id,
        descripcion,
        before_data,
        after_data,
        ip,
        user_agent
      )
      VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [
      input.usuario_id ?? null,
      input.accion,
      input.tabla,
      input.registro_id,
      input.descripcion,
      JSON.stringify(beforeData),
      JSON.stringify(afterData),
      input.ip ?? null,
      input.user_agent ?? null
    ]
  );
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

  if (!isUuidLike(input.registro_id)) {
    return;
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
