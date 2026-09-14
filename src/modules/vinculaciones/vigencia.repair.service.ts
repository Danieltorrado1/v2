import type { AuditRequestMeta } from '../auditoria/auditoria.helper';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { dbPool } from '../../config/db';
import { effectiveRetirementSql } from './vigencia';

export type VigenciaRepairMode = 'DRY_RUN' | 'APPLY';

export interface VigenciaRepairCandidate {
  vinculacion_id: string;
  persona_id: string;
  nombre: string;
  numero_documento: string | null;
  estado_actual: string | null;
  estado_esperado: 'RETIRADA' | 'NO_REPARAR';
  fecha_inicio: string;
  fecha_fin: string | null;
  fecha_retiro_novedad: string | null;
  fecha_retiro_efectiva: string | null;
  novedad_id: string | null;
  novedad_observacion: string | null;
  evento_usuario_id: string | null;
  evento_usuario_nombre: string | null;
  evento_origen: string | null;
  evento_fecha: string | null;
  motivo: string;
  elegible: boolean;
  aplicado: boolean;
}

const repairCandidatesSql = `
  WITH retiros AS (
    SELECT
      v.id,
      ${effectiveRetirementSql('v')}::date AS fecha_retiro_efectiva,
      MIN(CASE WHEN t.id IS NOT NULL THEN COALESCE(n.fecha_inicio, n.fecha_fin) END)::date AS fecha_retiro_novedad,
      MIN(CASE WHEN t.id IS NOT NULL THEN n.id END)::text AS novedad_id,
      MIN(CASE WHEN t.id IS NOT NULL THEN n.observacion END) AS novedad_observacion,
      COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN COALESCE(n.fecha_inicio, n.fecha_fin) END)::int AS retiros_activos
    FROM vinculaciones v
    LEFT JOIN nomina_novedades n
      ON n.vinculacion_id = v.id
     AND COALESCE(n.activo, TRUE)
    LEFT JOIN nomina_tipos_novedad t
      ON t.id = n.tipo_novedad_id
     AND UPPER(TRIM(t.nombre)) = 'FECHA DE RETIRO'
    GROUP BY v.id
  ), duplicadas AS (
    SELECT DISTINCT v1.id
    FROM vinculaciones v1
    JOIN vinculaciones v2
      ON v2.persona_id = v1.persona_id
     AND v2.empresa_id = v1.empresa_id
     AND v2.contrato_id = v1.contrato_id
     AND v2.id <> v1.id
     AND v1.fecha_inicio <= COALESCE(${effectiveRetirementSql('v2')}, DATE '9999-12-31')
     AND v2.fecha_inicio <= COALESCE(${effectiveRetirementSql('v1')}, DATE '9999-12-31')
  ), candidatos AS (
    SELECT
      v.id::text AS vinculacion_id,
      v.persona_id::text AS persona_id,
      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
      p.numero_documento,
      v.estado_vinculacion AS estado_actual,
      v.fecha_inicio::text AS fecha_inicio,
      v.fecha_fin::text AS fecha_fin,
      r.fecha_retiro_novedad::text AS fecha_retiro_novedad,
      r.fecha_retiro_efectiva::text AS fecha_retiro_efectiva,
      r.novedad_id,
      r.novedad_observacion,
      r.retiros_activos,
      (d.id IS NOT NULL) AS tiene_duplicidad,
      (v.fecha_fin IS NOT NULL AND r.fecha_retiro_novedad IS NOT NULL AND v.fecha_fin <> r.fecha_retiro_novedad) AS fechas_inconsistentes,
      ae.usuario_id::text AS evento_usuario_id,
      u.nombre_completo AS evento_usuario_nombre,
      ae.accion AS evento_origen,
      ae.fecha_evento::text AS evento_fecha
    FROM vinculaciones v
    JOIN personas p ON p.id = v.persona_id
    JOIN retiros r ON r.id = v.id
    LEFT JOIN duplicadas d ON d.id = v.id
    LEFT JOIN LATERAL (
      SELECT a.usuario_id, a.accion, a.fecha_evento
      FROM auditoria_eventos a
      WHERE a.entidad = 'nomina_novedades'
        AND a.entidad_id = r.novedad_id
        AND a.accion IN ('NOMINA_NOVEDAD_CREATE', 'NOMINA_NOVEDAD_UPDATE')
      ORDER BY a.fecha_evento ASC
      LIMIT 1
    ) ae ON TRUE
    LEFT JOIN usuarios u ON u.id = ae.usuario_id
    WHERE v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')
      AND r.fecha_retiro_efectiva < CURRENT_DATE
  )
  SELECT
    vinculacion_id,
    persona_id,
    nombre,
    numero_documento,
    estado_actual,
    CASE WHEN retiros_activos <= 1 AND NOT tiene_duplicidad AND NOT fechas_inconsistentes THEN 'RETIRADA' ELSE 'NO_REPARAR' END AS estado_esperado,
    fecha_inicio,
    fecha_fin,
    fecha_retiro_novedad,
    fecha_retiro_efectiva,
    novedad_id,
    novedad_observacion,
    evento_usuario_id,
    evento_usuario_nombre,
    evento_origen,
    evento_fecha,
    CASE
      WHEN retiros_activos > 1 THEN 'No reparar: existen múltiples retiros activos'
      WHEN tiene_duplicidad THEN 'No reparar: existe vinculación solapada'
      WHEN fechas_inconsistentes THEN 'No reparar: fecha_fin y novedad de retiro difieren'
      ELSE 'Reparación inequívoca de proyección ACTIVA a RETIRADA'
    END AS motivo,
    (retiros_activos <= 1 AND NOT tiene_duplicidad AND NOT fechas_inconsistentes) AS elegible
  FROM candidatos
  ORDER BY vinculacion_id::bigint
`;

const applyRepair = async (
  candidate: VigenciaRepairCandidate,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<boolean> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query<{
      id: string;
      estado_vinculacion: string | null;
      fecha_retiro_efectiva: string | null;
    }>(
      `SELECT v.id::text AS id, v.estado_vinculacion,
        ${effectiveRetirementSql('v')}::text AS fecha_retiro_efectiva
       FROM vinculaciones v
       WHERE v.id = $1::bigint
       FOR UPDATE`,
      [candidate.vinculacion_id]
    );
    const row = current.rows[0];
    if (!row || !['ACTIVA', 'ACTIVO'].includes(row.estado_vinculacion ?? '') || !row.fecha_retiro_efectiva || row.fecha_retiro_efectiva >= new Date().toISOString().slice(0, 10)) {
      await client.query('ROLLBACK');
      return false;
    }

    const updated = await client.query(
      `UPDATE vinculaciones
       SET estado_vinculacion = 'RETIRADA'
       WHERE id = $1::bigint
       RETURNING id::text AS id, estado_vinculacion`,
      [candidate.vinculacion_id]
    );
    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'VIGENCIA_REPAIR',
      tabla: 'vinculaciones',
      registro_id: candidate.vinculacion_id,
      descripcion: 'Reparacion controlada de proyeccion de vigencia efectiva',
      before: { estado_vinculacion: row.estado_vinculacion, fecha_retiro_efectiva: row.fecha_retiro_efectiva },
      after: { estado_vinculacion: updated.rows[0]?.estado_vinculacion ?? 'RETIRADA', fecha_retiro_efectiva: row.fecha_retiro_efectiva, motivo: candidate.motivo },
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reconcileVinculacionesVigencia = async (
  mode: VigenciaRepairMode,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<{ mode: VigenciaRepairMode; candidates: VigenciaRepairCandidate[]; applied: number }> => {
  const result = await dbPool.query<Omit<VigenciaRepairCandidate, 'estado_esperado' | 'aplicado'> & { estado_esperado: 'RETIRADA' | 'NO_REPARAR'; elegible: boolean }>(repairCandidatesSql);
  const candidates: VigenciaRepairCandidate[] = result.rows.map((row) => ({ ...row, aplicado: false }));

  if (mode === 'DRY_RUN') {
    return { mode, candidates, applied: 0 };
  }

  for (const candidate of candidates.filter((item) => item.elegible)) {
    candidate.aplicado = await applyRepair(candidate, actorUserId, auditMeta);
  }

  return {
    mode,
    candidates,
    applied: candidates.filter((candidate) => candidate.aplicado).length
  };
};
