import type { PoolClient } from 'pg';

import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { effectiveRetirementSql, resolveEstadoVinculacionProyectado } from './vigencia';

interface VinculacionVigenciaRow {
  id: string;
  estado_vinculacion: string | null;
  fecha_fin: string | null;
  fecha_retiro_efectiva: string | null;
}

export const syncVinculacionEstadoProjection = async (
  client: PoolClient,
  vinculacionId: string,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<VinculacionVigenciaRow | null> => {
  const result = await client.query<VinculacionVigenciaRow>(
    `
      SELECT
        v.id::text AS id,
        v.estado_vinculacion,
        v.fecha_fin::text AS fecha_fin,
        ${effectiveRetirementSql('v')}::text AS fecha_retiro_efectiva
      FROM vinculaciones v
      WHERE v.id = $1::bigint
      FOR UPDATE
    `,
    [vinculacionId]
  );
  const current = result.rows[0];
  if (!current) {
    return null;
  }

  const nextEstado = resolveEstadoVinculacionProyectado(
    current.estado_vinculacion,
    current.fecha_retiro_efectiva
  );

  if (current.estado_vinculacion === nextEstado) {
    return current;
  }

  const updated = await client.query<VinculacionVigenciaRow>(
    `
      UPDATE vinculaciones AS v
      SET estado_vinculacion = $2::text
      WHERE id = $1::bigint
      RETURNING id::text AS id, estado_vinculacion, fecha_fin::text AS fecha_fin,
        ${effectiveRetirementSql('v')}::text AS fecha_retiro_efectiva
    `,
    [vinculacionId, nextEstado]
  );
  const after = updated.rows[0] ?? { ...current, estado_vinculacion: nextEstado };

  await registerAuditEntry({
    client,
    usuario_id: actorUserId,
    accion: 'VINCULACION_ESTADO_PROYECCION_SYNC',
    tabla: 'vinculaciones',
    registro_id: vinculacionId,
    descripcion: 'Sincronización de estado desde vigencia efectiva',
    before: current,
    after,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return after;
};
