import type { PoolClient } from 'pg';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';

/** DATE is read as text: a payroll calendar range must never cross a timezone conversion. */
export const loadNominaExternalTurnRange = async (client: PoolClient, movimientoId: string) => {
  const result = await client.query<{ fecha_inicio: string; fecha_fin: string; dias: number }>(`
    SELECT DISTINCT nn.fecha_inicio::text AS fecha_inicio,
      COALESCE(nn.fecha_fin, nn.fecha_inicio)::text AS fecha_fin,
      (COALESCE(nn.fecha_fin, nn.fecha_inicio) - nn.fecha_inicio + 1)::int AS dias
    FROM nomina_novedad_turnos nt
    JOIN nomina_novedades nn ON nn.id = nt.nomina_novedad_id
    WHERE nt.movimiento_id = $1::bigint AND nt.tipo_turno = 'EXTERNO'
      AND COALESCE(nt.activo, TRUE) AND COALESCE(nn.activo, TRUE)
  `, [movimientoId]);
  if (result.rows.length > 1 || (result.rows[0] && !(result.rows[0].dias > 0))) {
    throw new AppError('El turno externo requiere un rango unico y valido', 409, 'NOMINA_TURNO_EXTERNO_RANGO_INVALIDO');
  }
  return result.rows[0] ?? null;
};

/** Repair quantities without re-pricing or re-approving an existing positive snapshot.
 * The caller owns the transaction. Closed periods and ambiguous links require a
 * separate reviewed correction. Guarded UPDATE + row locks make retries a no-op.
 */
export const repairPositiveExternalTurnSnapshots = async (
  periodoId: string,
  actorUserId: string,
  client: PoolClient,
  nominaEmpleadoIds?: string[],
): Promise<number> => {
  const result = await client.query<{
    id: string; cantidad_anterior: string; total_anterior: string;
    calculado_anterior: string | null; cantidad: string; valor_unitario: string;
    valor_total: string; valor_calculado: string; afecta_seguridad_social: boolean;
  }>(`
    WITH candidates AS MATERIALIZED (
      SELECT nm.id, nm.cantidad AS cantidad_anterior, nm.valor_total AS total_anterior,
        nm.valor_calculado AS calculado_anterior, ranges.dias
      FROM nomina_movimientos nm
      JOIN nomina_periodos np ON np.id = nm.periodo_id
      JOIN LATERAL (
        SELECT MIN(COALESCE(nn.fecha_fin, nn.fecha_inicio) - nn.fecha_inicio + 1)::int AS dias
        FROM nomina_novedad_turnos nt
        JOIN nomina_novedades nn ON nn.id = nt.nomina_novedad_id
        WHERE nt.movimiento_id = nm.id AND nt.periodo_id = nm.periodo_id
          AND nt.tipo_turno = 'EXTERNO'
          AND COALESCE(nt.activo, TRUE) AND COALESCE(nn.activo, TRUE)
        HAVING COUNT(DISTINCT (nn.fecha_inicio, COALESCE(nn.fecha_fin, nn.fecha_inicio))) = 1
          AND BOOL_AND(nn.fecha_inicio IS NOT NULL
            AND COALESCE(nn.fecha_fin, nn.fecha_inicio) >= nn.fecha_inicio)
      ) ranges ON ranges.dias > 0
      WHERE nm.periodo_id = $1::bigint AND np.estado = 'ABIERTO'
        AND ($2::bigint[] IS NULL OR nm.nomina_empleado_id = ANY($2::bigint[]))
        AND nm.tipo_movimiento = 'TURNO_EXTERNO' AND COALESCE(nm.activo, TRUE)
        AND COALESCE(nm.estado, 'PENDIENTE') <> 'RECHAZADO'
        AND nm.tarifa_config_id IS NOT NULL AND nm.valor_unitario > 0 AND nm.valor_total > 0
        AND (nm.cantidad IS DISTINCT FROM ranges.dias
          OR nm.valor_calculado IS DISTINCT FROM ROUND(nm.valor_unitario * ranges.dias, 2)
          OR nm.valor_total IS DISTINCT FROM ROUND(nm.valor_unitario * ranges.dias, 2))
      ORDER BY nm.id
      FOR UPDATE OF nm
    )
    UPDATE nomina_movimientos nm SET cantidad = c.dias,
      valor_calculado = ROUND(nm.valor_unitario * c.dias, 2),
      valor_total = ROUND(nm.valor_unitario * c.dias, 2),
      afecta_seguridad_social = FALSE, updated_by = $3::bigint, updated_at = NOW()
    FROM candidates c WHERE nm.id = c.id
      AND (nm.cantidad IS DISTINCT FROM c.dias
        OR nm.valor_calculado IS DISTINCT FROM ROUND(nm.valor_unitario * c.dias, 2)
        OR nm.valor_total IS DISTINCT FROM ROUND(nm.valor_unitario * c.dias, 2))
    RETURNING nm.id::text, c.cantidad_anterior::text, c.total_anterior::text,
      c.calculado_anterior::text, nm.cantidad::text, nm.valor_unitario::text,
      nm.valor_total::text, nm.valor_calculado::text, nm.afecta_seguridad_social
  `, [periodoId, nominaEmpleadoIds?.length ? nominaEmpleadoIds : null, actorUserId]);
  for (const row of result.rows) {
    await registerAuditEntry({
      client, usuario_id: actorUserId, accion: 'NOMINA_TURNO_EXTERNO_SNAPSHOT_RANGE_REPAIR',
      tabla: 'nomina_movimientos', registro_id: row.id,
      descripcion: 'Ajuste de cantidad y total del turno externo al rango inclusivo; tarifa conservada',
      before: { cantidad: row.cantidad_anterior, valor_total: row.total_anterior, valor_calculado: row.calculado_anterior },
      after: { cantidad: row.cantidad, valor_total: row.valor_total, valor_calculado: row.valor_calculado,
        valor_unitario: row.valor_unitario, afecta_seguridad_social: row.afecta_seguridad_social },
    });
  }
  return result.rows.length;
};
