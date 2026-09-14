import type { Pool, PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import { effectiveRetirementSql } from './vigencia';

export type VinculacionVigenciaInconsistencyType = 'A' | 'B' | 'C' | 'D' | 'E';

export interface VinculacionVigenciaInconsistency extends QueryResultRow {
  tipo: VinculacionVigenciaInconsistencyType;
  vinculacion_id: string;
  persona_id: string;
  numero_documento: string | null;
  nombre: string;
  estado_vinculacion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  fecha_retiro_efectiva: string | null;
  detalle: string;
}

type Executor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export const listVinculacionVigenciaInconsistencies = async (
  executor: Executor = dbPool
): Promise<VinculacionVigenciaInconsistency[]> => {
  const result = await executor.query<VinculacionVigenciaInconsistency>(
    `
      WITH retiros AS (
        SELECT
          v.id,
          ${effectiveRetirementSql('v')}::date AS fecha_retiro_efectiva,
          MIN(CASE WHEN t.id IS NOT NULL THEN COALESCE(n.fecha_inicio, n.fecha_fin) END)::date AS fecha_retiro_novedad,
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
         AND v1.fecha_inicio <= COALESCE(v2.fecha_fin, DATE '9999-12-31')
         AND v2.fecha_inicio <= COALESCE(v1.fecha_fin, DATE '9999-12-31')
      ), base AS (
        SELECT
          v.id::text AS vinculacion_id,
          v.persona_id::text AS persona_id,
          p.numero_documento,
          CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
          v.estado_vinculacion,
          v.fecha_inicio::text AS fecha_inicio,
          v.fecha_fin::text AS fecha_fin,
          r.fecha_retiro_efectiva::text AS fecha_retiro_efectiva,
          r.fecha_retiro_novedad::text AS fecha_retiro_novedad,
          r.retiros_activos,
          CASE
            WHEN v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')
              AND r.fecha_retiro_efectiva < CURRENT_DATE THEN 'A'
            WHEN v.estado_vinculacion = 'RETIRADA'
              AND r.fecha_retiro_efectiva IS NULL THEN 'B'
            WHEN v.fecha_fin IS NOT NULL
              AND r.fecha_retiro_novedad IS NOT NULL
              AND v.fecha_fin <> r.fecha_retiro_novedad THEN 'C'
            WHEN r.retiros_activos > 1 THEN 'D'
            WHEN d.id IS NOT NULL THEN 'E'
          END AS tipo,
          CASE
            WHEN v.estado_vinculacion IN ('ACTIVA', 'ACTIVO')
              AND r.fecha_retiro_efectiva < CURRENT_DATE THEN 'Estado activo con retiro efectivo vencido'
            WHEN v.estado_vinculacion = 'RETIRADA'
              AND r.fecha_retiro_efectiva IS NULL THEN 'Estado retirado sin fecha de retiro efectiva'
            WHEN v.fecha_fin IS NOT NULL
              AND r.fecha_retiro_novedad IS NOT NULL
              AND v.fecha_fin <> r.fecha_retiro_novedad THEN 'Fecha fin y novedad de retiro difieren'
            WHEN r.retiros_activos > 1 THEN 'Múltiples retiros activos incompatibles'
            WHEN d.id IS NOT NULL THEN 'Vinculación solapada para persona, empresa y contrato'
          END AS detalle
        FROM vinculaciones v
        JOIN personas p ON p.id = v.persona_id
        JOIN retiros r ON r.id = v.id
        LEFT JOIN duplicadas d ON d.id = v.id
      )
      SELECT vinculacion_id, persona_id, numero_documento, nombre, estado_vinculacion,
        fecha_inicio, fecha_fin, fecha_retiro_efectiva, tipo, detalle
      FROM base
      WHERE tipo IS NOT NULL
      ORDER BY tipo, numero_documento NULLS LAST, vinculacion_id
    `
  );
  return result.rows;
};
