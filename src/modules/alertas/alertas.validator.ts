import { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';

interface ExistsRow extends QueryResultRow {
  exists: boolean;
}

interface AlertaLookupRow extends QueryResultRow {
  activo: boolean;
  estado: string;
  id: string;
  referencia_id: string | null;
  tipo_alerta: string;
}

interface NotificacionLookupRow extends QueryResultRow {
  id: string;
  leida: boolean;
  usuario_id: string;
}

type QueryExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
};

const getExecutor = (client?: PoolClient): QueryExecutor => {
  if (client) {
    return {
      query: <T extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<T>> => client.query<T>(text, params)
    };
  }

  return {
    query: dbQuery
  };
};

export const ensureUserExists = async (
  userId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = getExecutor(client);
  const result = await executor.query<ExistsRow>(
    'SELECT EXISTS (SELECT 1 FROM usuarios WHERE id::text = $1) AS exists',
    [userId]
  );

  if (!result.rows[0]?.exists) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
};

export const ensureAlertaExists = async (
  alertaId: string,
  client?: PoolClient
): Promise<AlertaLookupRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<AlertaLookupRow>(
    `
      SELECT
        id::text AS id,
        tipo_alerta,
        referencia_id::text AS referencia_id,
        estado,
        activo
      FROM alertas_sistema
      WHERE id::text = $1
      LIMIT 1
    `,
    [alertaId]
  );

  const alerta = result.rows[0];

  if (!alerta) {
    throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
  }

  return alerta;
};

export const ensureNotificacionExists = async (
  notificacionId: string,
  client?: PoolClient
): Promise<NotificacionLookupRow> => {
  const executor = getExecutor(client);
  const result = await executor.query<NotificacionLookupRow>(
    `
      SELECT
        id::text AS id,
        usuario_id::text AS usuario_id,
        leida
      FROM notificaciones
      WHERE id::text = $1
      LIMIT 1
    `,
    [notificacionId]
  );

  const notificacion = result.rows[0];

  if (!notificacion) {
    throw new AppError('Notification not found', 404, 'NOTIFICACION_NOT_FOUND');
  }

  return notificacion;
};

export const ensureNotificationOwnership = async (
  notificacionId: string,
  usuarioId: string,
  client?: PoolClient
): Promise<NotificacionLookupRow> => {
  const notificacion = await ensureNotificacionExists(notificacionId, client);

  if (notificacion.usuario_id !== usuarioId) {
    throw new AppError(
      'Notification does not belong to the authenticated user',
      403,
      'NOTIFICACION_FORBIDDEN'
    );
  }

  return notificacion;
};
