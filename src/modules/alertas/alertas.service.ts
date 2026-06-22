import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import { GeneratedAlertCandidate, generateSystemAlertCandidates } from './alertas.generator';
import {
  EstadoAlerta,
  GenerateAlertasInput,
  ListAlertasQuery,
  ListNotificacionesQuery,
  PrioridadAlerta,
  TipoAlerta
} from './alertas.schemas';
import {
  ensureAlertaExists,
  ensureNotificationOwnership,
  ensureUserExists
} from './alertas.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface AlertaRow extends QueryResultRow {
  activo: boolean;
  created_at: Date;
  descripcion: string;
  entidad: string;
  estado: EstadoAlerta;
  fecha_alerta: Date | string;
  fecha_resolucion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  prioridad: PrioridadAlerta;
  registro_id: string;
  tipo_alerta: TipoAlerta;
  titulo: string;
  updated_at: Date;
  usuario_email: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
}

interface NotificacionRow extends QueryResultRow {
  activo: boolean;
  alerta_id: string | null;
  created_at: Date;
  fecha_lectura: Date | string | null;
  id: string;
  leida: boolean;
  mensaje: string;
  metadata: Record<string, unknown> | null;
  tipo: string;
  titulo: string;
  updated_at: Date;
  usuario_email: string | null;
  usuario_id: string;
  usuario_nombre: string | null;
}

interface UserTargetRow extends QueryResultRow {
  id: string;
}

export interface AlertaItem {
  activo: boolean;
  created_at: string;
  descripcion: string;
  entidad: string;
  estado: EstadoAlerta;
  fecha_alerta: string;
  fecha_resolucion: string | null;
  fecha_vencimiento: string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  prioridad: PrioridadAlerta;
  registro_id: string;
  tipo_alerta: TipoAlerta;
  titulo: string;
  updated_at: string;
  usuario: {
    email: string | null;
    id: string | null;
    nombre: string | null;
  };
}

export interface NotificacionItem {
  activo: boolean;
  alerta_id: string | null;
  created_at: string;
  fecha_lectura: string | null;
  id: string;
  leida: boolean;
  mensaje: string;
  metadata: Record<string, unknown> | null;
  tipo: string;
  titulo: string;
  updated_at: string;
  usuario: {
    email: string | null;
    id: string;
    nombre: string | null;
  };
}

export interface PaginatedAlertas {
  items: AlertaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedNotificaciones {
  items: NotificacionItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface AlertGenerationResult {
  generated: number;
  notifications_created: number;
  skipped_duplicates: number;
  tipos_alerta: TipoAlerta[];
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const mapAlerta = (row: AlertaRow): AlertaItem => {
  return {
    id: row.id,
    tipo_alerta: row.tipo_alerta,
    prioridad: row.prioridad,
    estado: row.estado,
    entidad: row.entidad,
    registro_id: row.registro_id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha_alerta: toDateString(row.fecha_alerta) ?? '',
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    fecha_resolucion: toDateString(row.fecha_resolucion),
    metadata: row.metadata,
    activo: row.activo,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    usuario: {
      id: row.usuario_id,
      email: row.usuario_email,
      nombre: row.usuario_nombre
    }
  };
};

const mapNotificacion = (row: NotificacionRow): NotificacionItem => {
  return {
    id: row.id,
    alerta_id: row.alerta_id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje,
    leida: row.leida,
    fecha_lectura: toDateString(row.fecha_lectura),
    metadata: row.metadata,
    activo: row.activo,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    usuario: {
      id: row.usuario_id,
      email: row.usuario_email,
      nombre: row.usuario_nombre
    }
  };
};

const getAlertaSelect = (): string => {
  return `
    SELECT
      a.id::text AS id,
      a.tipo_alerta,
      a.prioridad,
      a.estado,
      a.entidad,
      a.registro_id::text AS registro_id,
      a.usuario_id::text AS usuario_id,
      u.email AS usuario_email,
      u.nombre AS usuario_nombre,
      a.titulo,
      a.descripcion,
      a.fecha_alerta,
      a.fecha_vencimiento,
      a.fecha_resolucion,
      a.metadata,
      a.activo,
      a.created_at,
      a.updated_at
    FROM alertas_sistema a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
  `;
};

const getNotificacionSelect = (): string => {
  return `
    SELECT
      n.id::text AS id,
      n.alerta_id::text AS alerta_id,
      n.usuario_id::text AS usuario_id,
      u.email AS usuario_email,
      u.nombre AS usuario_nombre,
      n.tipo,
      n.titulo,
      n.mensaje,
      n.leida,
      n.fecha_lectura,
      n.metadata,
      n.activo,
      n.created_at,
      n.updated_at
    FROM notificaciones n
    INNER JOIN usuarios u ON u.id = n.usuario_id
  `;
};

const ensureNoDuplicateActiveAlert = async (
  client: PoolClient,
  candidate: GeneratedAlertCandidate
): Promise<boolean> => {
  const result = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM alertas_sistema
      WHERE tipo_alerta = $1
        AND entidad = $2
        AND registro_id::text = $3
        AND activo = TRUE
        AND estado IN ('ACTIVA', 'LEIDA')
      LIMIT 1
    `,
    [candidate.tipo_alerta, candidate.entidad, candidate.registro_id]
  );

  return Boolean(result.rows[0]);
};

const ensureNotificationForUser = async (
  client: PoolClient,
  input: {
    alertId: string;
    candidate: GeneratedAlertCandidate;
    usuarioId: string;
  }
): Promise<boolean> => {
  const duplicateResult = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM notificaciones
      WHERE alerta_id::text = $1
        AND usuario_id::text = $2
        AND activo = TRUE
      LIMIT 1
    `,
    [input.alertId, input.usuarioId]
  );

  if (duplicateResult.rows[0]) {
    return false;
  }

  await client.query(
    `
      INSERT INTO notificaciones (
        usuario_id,
        alerta_id,
        tipo,
        titulo,
        mensaje,
        leida,
        metadata,
        activo
      )
      VALUES ($1::uuid, $2::uuid, $3, $4, $5, FALSE, $6::jsonb, TRUE)
    `,
    [
      input.usuarioId,
      input.alertId,
      input.candidate.tipo_alerta,
      input.candidate.titulo,
      input.candidate.descripcion,
      JSON.stringify(input.candidate.metadata ?? {})
    ]
  );

  return true;
};

const getNotificationTargets = async (
  client: PoolClient,
  explicitUserIds?: string[]
): Promise<string[]> => {
  if (explicitUserIds && explicitUserIds.length > 0) {
    for (const userId of explicitUserIds) {
      await ensureUserExists(userId, client);
    }

    return explicitUserIds;
  }

  const result = await client.query<UserTargetRow>(
    `
      SELECT DISTINCT u.id::text AS id
      FROM usuarios u
      WHERE u.activo = TRUE
    `
  );

  return result.rows.map((row) => row.id);
};

const createAlertFromCandidate = async (
  client: PoolClient,
  candidate: GeneratedAlertCandidate,
  actorUserId: string
): Promise<string> => {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO alertas_sistema (
        tipo_alerta,
        prioridad,
        estado,
        entidad,
        registro_id,
        usuario_id,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        metadata,
        activo,
        created_by
      )
      VALUES (
        $1,
        $2,
        'ACTIVA',
        $3,
        $4::uuid,
        $5::uuid,
        $6,
        $7,
        CURRENT_DATE,
        $8,
        $9::jsonb,
        TRUE,
        $10::uuid
      )
      RETURNING id::text AS id
    `,
    [
      candidate.tipo_alerta,
      candidate.prioridad,
      candidate.entidad,
      candidate.registro_id,
      candidate.usuario_id ?? null,
      candidate.titulo,
      candidate.descripcion,
      candidate.fecha_vencimiento,
      JSON.stringify(candidate.metadata ?? {}),
      actorUserId
    ]
  );

  const alertId = result.rows[0]?.id;

  if (!alertId) {
    throw new AppError('Failed to create alert', 500, 'ALERTA_CREATE_FAILED');
  }

  return alertId;
};

const recordAlertAudit = async (
  client: PoolClient,
  input: {
    accion: 'CREATE' | 'UPDATE' | 'DELETE_LOGICO';
    actorUserId: string;
    after?: unknown;
    alertId: string;
    auditMeta?: AuditRequestMeta;
    before?: unknown;
    descripcion: string;
  }
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: input.actorUserId,
    accion: input.accion,
    tabla: 'alertas_sistema',
    registro_id: input.alertId,
    descripcion: input.descripcion,
    before: input.before,
    after: input.after,
    ip: input.auditMeta?.ip ?? null,
    user_agent: input.auditMeta?.user_agent ?? null
  });
};

const buildAlertasFilters = (
  filters: ListAlertasQuery
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.tipo_alerta) {
    params.push(filters.tipo_alerta);
    conditions.push(`a.tipo_alerta = $${params.length}`);
  }

  if (filters.prioridad) {
    params.push(filters.prioridad);
    conditions.push(`a.prioridad = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`a.estado = $${params.length}`);
  }

  if (filters.entidad) {
    params.push(filters.entidad);
    conditions.push(`a.entidad = $${params.length}`);
  }

  if (filters.registro_id) {
    params.push(filters.registro_id);
    conditions.push(`a.registro_id::text = $${params.length}`);
  }

  if (filters.usuario_id) {
    params.push(filters.usuario_id);
    conditions.push(`a.usuario_id::text = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`a.fecha_alerta >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`a.fecha_alerta <= $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`a.activo = $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildNotificacionesFilters = (
  filters: ListNotificacionesQuery
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.usuario_id) {
    params.push(filters.usuario_id);
    conditions.push(`n.usuario_id::text = $${params.length}`);
  }

  if (filters.leida !== undefined) {
    params.push(filters.leida);
    conditions.push(`n.leida = $${params.length}`);
  }

  if (filters.tipo) {
    params.push(filters.tipo);
    conditions.push(`n.tipo = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`n.created_at::date >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`n.created_at::date <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

export const listAlertas = async (filters: ListAlertasQuery): Promise<PaginatedAlertas> => {
  const { params, whereClause } = buildAlertasFilters(filters);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM alertas_sistema a
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<AlertaRow>(
    `
      ${getAlertaSelect()}
      ${whereClause}
      ORDER BY a.fecha_alerta DESC, a.created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapAlerta),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getAlertaById = async (alertaId: string): Promise<AlertaItem | null> => {
  const result = await dbQuery<AlertaRow>(
    `
      ${getAlertaSelect()}
      WHERE a.id::text = $1
      LIMIT 1
    `,
    [alertaId]
  );

  const row = result.rows[0];
  return row ? mapAlerta(row) : null;
};

export const generateAlertas = async (
  input: GenerateAlertasInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<AlertGenerationResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const candidates = await generateSystemAlertCandidates(client, input.tipos_alerta);
    const notificationTargets = await getNotificationTargets(client, input.usuario_ids);
    let generated = 0;
    let skippedDuplicates = 0;
    let notificationsCreated = 0;

    for (const candidate of candidates) {
      const duplicate = await ensureNoDuplicateActiveAlert(client, candidate);

      if (duplicate) {
        skippedDuplicates += 1;
        continue;
      }

      const alertId = await createAlertFromCandidate(client, candidate, actorUserId);
      const createdAlert = await getAlertaById(alertId);

      if (!createdAlert) {
        throw new AppError('Created alert could not be loaded', 500, 'ALERTA_LOAD_FAILED');
      }

      await recordAlertAudit(client, {
        accion: 'CREATE',
        actorUserId,
        after: createdAlert,
        alertId,
        auditMeta,
        descripcion: 'Generacion de alerta del sistema'
      });

      generated += 1;

      for (const usuarioId of notificationTargets) {
        const created = await ensureNotificationForUser(client, {
          alertId,
          candidate,
          usuarioId
        });

        if (created) {
          notificationsCreated += 1;
        }
      }
    }

    await client.query('COMMIT');

    return {
      generated,
      notifications_created: notificationsCreated,
      skipped_duplicates: skippedDuplicates,
      tipos_alerta:
        input.tipos_alerta && input.tipos_alerta.length > 0
          ? input.tipos_alerta
          : [
              'DOCUMENTO_VENCIDO',
              'DOCUMENTO_POR_VENCER',
              'CONTRATO_POR_VENCER',
              'VINCULACION_POR_VENCER',
              'COBERTURA_INSUFICIENTE',
              'SOBRECOBERTURA',
              'NOMINA_PENDIENTE',
              'NOMINA_PERIODO_ABIERTO',
              'PLAN_SST_VENCIDO',
              'PLAN_SST_POR_VENCER'
            ]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateAlertState = async (
  alertId: string,
  actorUserId: string,
  auditMeta: AuditRequestMeta | undefined,
  updater: {
    descripcion: string;
    estado: EstadoAlerta;
    markResolved?: boolean;
  }
): Promise<AlertaItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureAlertaExists(alertId, client);
    const current = await getAlertaById(alertId);

    if (!current) {
      throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
    }

    const result = await client.query<AlertaRow>(
      `
        UPDATE alertas_sistema
        SET
          estado = $2,
          fecha_resolucion = CASE
            WHEN $3 = TRUE THEN CURRENT_DATE
            ELSE fecha_resolucion
          END,
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          tipo_alerta,
          prioridad,
          estado,
          entidad,
          registro_id::text AS registro_id,
          usuario_id::text AS usuario_id,
          (SELECT email FROM usuarios WHERE id = alertas_sistema.usuario_id) AS usuario_email,
          (SELECT nombre FROM usuarios WHERE id = alertas_sistema.usuario_id) AS usuario_nombre,
          titulo,
          descripcion,
          fecha_alerta,
          fecha_vencimiento,
          fecha_resolucion,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [alertId, updater.estado, updater.markResolved ?? false]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to update alert state', 500, 'ALERTA_UPDATE_FAILED');
    }

    const alerta = mapAlerta(updated);
    await recordAlertAudit(client, {
      accion: 'UPDATE',
      actorUserId,
      before: current,
      after: alerta,
      alertId,
      auditMeta,
      descripcion: updater.descripcion
    });

    await client.query('COMMIT');
    return alerta;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const markAlertaAsLeida = async (
  alertId: string,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<AlertaItem> => {
  return updateAlertState(alertId, actorUserId, auditMeta, {
    estado: 'LEIDA',
    descripcion: 'Alerta marcada como leida'
  });
};

export const markAlertaAsResuelta = async (
  alertId: string,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<AlertaItem> => {
  return updateAlertState(alertId, actorUserId, auditMeta, {
    estado: 'RESUELTA',
    markResolved: true,
    descripcion: 'Alerta marcada como resuelta'
  });
};

export const deactivateAlerta = async (
  alertId: string,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<AlertaItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureAlertaExists(alertId, client);
    const current = await getAlertaById(alertId);

    if (!current) {
      throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
    }

    const result = await client.query<AlertaRow>(
      `
        UPDATE alertas_sistema
        SET
          activo = FALSE,
          estado = 'DESCARTADA',
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          tipo_alerta,
          prioridad,
          estado,
          entidad,
          registro_id::text AS registro_id,
          usuario_id::text AS usuario_id,
          (SELECT email FROM usuarios WHERE id = alertas_sistema.usuario_id) AS usuario_email,
          (SELECT nombre FROM usuarios WHERE id = alertas_sistema.usuario_id) AS usuario_nombre,
          titulo,
          descripcion,
          fecha_alerta,
          fecha_vencimiento,
          fecha_resolucion,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [alertId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to deactivate alert', 500, 'ALERTA_DEACTIVATE_FAILED');
    }

    const alerta = mapAlerta(updated);
    await recordAlertAudit(client, {
      accion: 'DELETE_LOGICO',
      actorUserId,
      before: current,
      after: alerta,
      alertId,
      auditMeta,
      descripcion: 'Alerta desactivada logicamente'
    });

    await client.query('COMMIT');
    return alerta;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listNotificaciones = async (
  filters: ListNotificacionesQuery
): Promise<PaginatedNotificaciones> => {
  const { params, whereClause } = buildNotificacionesFilters(filters);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM notificaciones n
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<NotificacionRow>(
    `
      ${getNotificacionSelect()}
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapNotificacion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listMisNotificaciones = async (
  usuarioId: string,
  filters: Omit<ListNotificacionesQuery, 'usuario_id'>
): Promise<PaginatedNotificaciones> => {
  return listNotificaciones({
    ...filters,
    usuario_id: usuarioId
  });
};

export const markNotificacionAsLeida = async (
  notificacionId: string,
  usuarioId: string
): Promise<NotificacionItem> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureNotificationOwnership(notificacionId, usuarioId, client);

    const result = await client.query<NotificacionRow>(
      `
        UPDATE notificaciones
        SET
          leida = TRUE,
          fecha_lectura = COALESCE(fecha_lectura, CURRENT_DATE),
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          alerta_id::text AS alerta_id,
          usuario_id::text AS usuario_id,
          (SELECT email FROM usuarios WHERE id = notificaciones.usuario_id) AS usuario_email,
          (SELECT nombre FROM usuarios WHERE id = notificaciones.usuario_id) AS usuario_nombre,
          tipo,
          titulo,
          mensaje,
          leida,
          fecha_lectura,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [notificacionId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to mark notification as read',
        500,
        'NOTIFICACION_UPDATE_FAILED'
      );
    }

    await client.query('COMMIT');
    return mapNotificacion(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const markAllNotificacionesAsLeidas = async (
  usuarioId: string
): Promise<{ updated: number }> => {
  const result = await dbQuery(
    `
      UPDATE notificaciones
      SET
        leida = TRUE,
        fecha_lectura = COALESCE(fecha_lectura, CURRENT_DATE),
        updated_at = NOW()
      WHERE usuario_id::text = $1
        AND activo = TRUE
        AND leida = FALSE
    `,
    [usuarioId]
  );

  return {
    updated: result.rowCount ?? 0
  };
};
