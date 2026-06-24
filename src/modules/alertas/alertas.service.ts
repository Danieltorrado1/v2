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
  contrato_id: string | null;
  created_at: Date;
  descripcion: string;
  estado: EstadoAlerta;
  fecha_alerta: Date | string;
  fecha_vencimiento: Date | string | null;
  id: string;
  modulo: string;
  persona_id: string | null;
  prioridad: PrioridadAlerta;
  referencia_id: string | null;
  referencia_tabla: string | null;
  tipo_alerta: TipoAlerta;
  titulo: string;
  vinculacion_id: string | null;
}

interface NotificacionRow extends QueryResultRow {
  contrato_id: string | null;
  created_at: Date;
  entidad_origen: string | null;
  entidad_origen_id: string | null;
  estado: string | null;
  fecha_evento: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: string;
  leida: boolean;
  mensaje: string;
  metadata: Record<string, unknown> | null;
  persona_id: string | null;
  prioridad: string | null;
  referencia_id: string | null;
  referencia_tabla: string | null;
  resuelto_en: Date | string | null;
  archivado_en: Date | string | null;
  tipo: string;
  titulo: string;
  url_accion: string | null;
  usuario_email: string | null;
  usuario_id: string;
  usuario_nombre: string | null;
  vinculacion_id: string | null;
}

interface UserTargetRow extends QueryResultRow {
  id: string;
}

export interface AlertaItem {
  activo: boolean;
  contrato_id: string | null;
  created_at: string;
  descripcion: string;
  estado: EstadoAlerta;
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  id: string;
  modulo: string;
  persona_id: string | null;
  prioridad: PrioridadAlerta;
  referencia: {
    id: string | null;
    tabla: string | null;
  };
  tipo_alerta: TipoAlerta;
  titulo: string;
  vinculacion_id: string | null;
}

export interface NotificacionItem {
  archivado: boolean;
  archivado_en: string | null;
  contrato_id: string | null;
  created_at: string;
  estado: string | null;
  fecha_evento: string | null;
  fecha_vencimiento: string | null;
  id: string;
  leida: boolean;
  mensaje: string;
  metadata: Record<string, unknown> | null;
  origen: {
    id: string | null;
    tabla: string | null;
  };
  persona_id: string | null;
  prioridad: string | null;
  resuelto_en: string | null;
  tipo: string;
  titulo: string;
  url_accion: string | null;
  usuario: {
    email: string | null;
    id: string;
    nombre: string | null;
  };
  vinculacion_id: string | null;
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
    modulo: row.modulo,
    referencia: {
      tabla: row.referencia_tabla,
      id: row.referencia_id
    },
    persona_id: row.persona_id,
    vinculacion_id: row.vinculacion_id,
    contrato_id: row.contrato_id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha_alerta: toDateString(row.fecha_alerta) ?? '',
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    activo: row.activo,
    created_at: row.created_at.toISOString()
  };
};

const mapNotificacion = (row: NotificacionRow): NotificacionItem => {
  return {
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    mensaje: row.mensaje,
    leida: row.leida,
    prioridad: row.prioridad,
    estado: row.estado,
    origen: {
      tabla: row.entidad_origen ?? row.referencia_tabla,
      id: row.entidad_origen_id ?? row.referencia_id
    },
    persona_id: row.persona_id,
    vinculacion_id: row.vinculacion_id,
    contrato_id: row.contrato_id,
    fecha_evento: toDateString(row.fecha_evento),
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    url_accion: row.url_accion,
    resuelto_en: row.resuelto_en ? toDateString(row.resuelto_en) : null,
    archivado: row.archivado_en !== null,
    archivado_en: row.archivado_en ? toDateString(row.archivado_en) : null,
    metadata: row.metadata,
    created_at: row.created_at.toISOString(),
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
      a.modulo,
      a.referencia_tabla,
      a.referencia_id::text AS referencia_id,
      a.persona_id::text AS persona_id,
      a.vinculacion_id::text AS vinculacion_id,
      a.contrato_id::text AS contrato_id,
      a.titulo,
      a.descripcion,
      a.fecha_alerta,
      a.fecha_vencimiento,
      a.activo,
      a.created_at
    FROM alertas_sistema a
  `;
};

const getNotificacionSelect = (): string => {
  return `
    SELECT
      n.id::text AS id,
      n.usuario_id::text AS usuario_id,
      u.correo AS usuario_email,
      u.nombre_completo AS usuario_nombre,
      n.tipo,
      n.prioridad,
      n.estado,
      n.referencia_tabla,
      n.referencia_id::text AS referencia_id,
      n.entidad_origen,
      n.entidad_origen_id::text AS entidad_origen_id,
      n.persona_id::text AS persona_id,
      n.vinculacion_id::text AS vinculacion_id,
      n.contrato_id::text AS contrato_id,
      n.titulo,
      n.mensaje,
      n.leida,
      n.fecha_evento,
      n.fecha_vencimiento,
      n.url_accion,
      n.resuelto_en,
      n.archivado_en,
      n.metadata,
      n.created_at
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
        AND referencia_tabla = $2
        AND referencia_id::text = $3
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
      WHERE referencia_tabla = 'alertas_sistema'
        AND referencia_id::text = $1
        AND usuario_id::text = $2
        AND archivado_en IS NULL
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
        referencia_tabla,
        referencia_id,
        tipo,
        prioridad,
        titulo,
        mensaje,
        leida,
        metadata
      )
      VALUES ($1::bigint, 'alertas_sistema', $2::bigint, $3, $4, $5, $6, FALSE, $7::jsonb)
    `,
    [
      input.usuarioId,
      input.alertId,
      input.candidate.tipo_alerta,
      input.candidate.prioridad,
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

const deriveModuloFromTipoAlerta = (tipoAlerta: TipoAlerta): string => {
  if (tipoAlerta.startsWith('DOCUMENTO_')) return 'DOCUMENTOS';
  if (tipoAlerta.startsWith('CONTRATO_') || tipoAlerta.startsWith('VINCULACION_')) return 'VINCULACIONES';
  if (tipoAlerta.startsWith('COBERTURA') || tipoAlerta === 'SOBRECOBERTURA') return 'COBERTURA';
  if (tipoAlerta.startsWith('NOMINA_')) return 'NOMINA';
  if (tipoAlerta.startsWith('PLAN_SST_')) return 'SST';
  return 'SISTEMA';
};

const createAlertFromCandidate = async (
  client: PoolClient,
  candidate: GeneratedAlertCandidate,
  actorUserId: string
): Promise<string> => {
  void actorUserId; // alertas_sistema no tiene columna de autor; se conserva el parametro por compatibilidad de firma.
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO alertas_sistema (
        tipo_alerta,
        prioridad,
        estado,
        modulo,
        referencia_tabla,
        referencia_id,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        activo
      )
      VALUES (
        $1,
        $2,
        'ACTIVA',
        $3,
        $4,
        $5::bigint,
        $6,
        $7,
        CURRENT_DATE,
        $8,
        TRUE
      )
      RETURNING id::text AS id
    `,
    [
      candidate.tipo_alerta,
      candidate.prioridad,
      deriveModuloFromTipoAlerta(candidate.tipo_alerta),
      candidate.entidad,
      candidate.registro_id,
      candidate.titulo,
      candidate.descripcion,
      candidate.fecha_vencimiento
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

  if (filters.modulo) {
    params.push(filters.modulo);
    conditions.push(`a.modulo = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`a.persona_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`a.vinculacion_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`a.contrato_id::text = $${params.length}`);
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
  // archivado_en es el equivalente a "activo" en notificaciones: por defecto solo
  // se listan las no archivadas (igual que el resto del sistema oculta lo inactivo).
  const conditions: string[] = ['n.archivado_en IS NULL'];
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
        SET estado = $2
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          tipo_alerta,
          prioridad,
          estado,
          modulo,
          referencia_tabla,
          referencia_id::text AS referencia_id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          titulo,
          descripcion,
          fecha_alerta,
          fecha_vencimiento,
          activo,
          created_at
      `,
      [alertId, updater.estado]
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
          estado = 'DESCARTADA'
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          tipo_alerta,
          prioridad,
          estado,
          modulo,
          referencia_tabla,
          referencia_id::text AS referencia_id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          titulo,
          descripcion,
          fecha_alerta,
          fecha_vencimiento,
          activo,
          created_at
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
        SET leida = TRUE
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          usuario_id::text AS usuario_id,
          (SELECT correo FROM usuarios WHERE id = notificaciones.usuario_id) AS usuario_email,
          (SELECT nombre_completo FROM usuarios WHERE id = notificaciones.usuario_id) AS usuario_nombre,
          tipo,
          prioridad,
          estado,
          referencia_tabla,
          referencia_id::text AS referencia_id,
          entidad_origen,
          entidad_origen_id::text AS entidad_origen_id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          titulo,
          mensaje,
          leida,
          fecha_evento,
          fecha_vencimiento,
          url_accion,
          resuelto_en,
          archivado_en,
          metadata,
          created_at
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
      SET leida = TRUE
      WHERE usuario_id::text = $1
        AND archivado_en IS NULL
        AND leida = FALSE
    `,
    [usuarioId]
  );

  return {
    updated: result.rowCount ?? 0
  };
};
