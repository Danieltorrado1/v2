import type { PoolClient, QueryResultRow } from 'pg';
import { AppError } from '../../utils/AppError';

export interface TurnContextOption extends QueryResultRow {
  municipio_id: string;
  municipio: string;
  institucion_id: string;
  institucion: string;
  sede_id: string;
  sede: string;
  modalidad_id: string;
  modalidad: string;
}

// Reuse the operational catalogue and its effective dates. No assignment of
// the performer or replaced employee determines the destination of a turn.
export async function listTurnContextOptions(
  client: Pick<PoolClient, 'query'>,
  contratoId: string,
  fecha: string,
  fechaFin = fecha,
): Promise<TurnContextOption[]> {
  const result = await client.query<TurnContextOption>(`
    SELECT DISTINCT s.municipio_id::text AS municipio_id, mu.nombre_municipio AS municipio,
      i.id::text AS institucion_id, i.nombre_institucion AS institucion,
      s.id::text AS sede_id, s.nombre_sede AS sede,
      m.id::text AS modalidad_id, m.nombre_modalidad AS modalidad
    FROM sede_modalidades sm
    JOIN sedes s ON s.id = sm.sede_id
    JOIN instituciones i ON i.id = s.institucion_id AND i.contrato_id = sm.contrato_id
    JOIN modalidades m ON m.id = sm.modalidad_id
    JOIN municipios mu ON mu.id = s.municipio_id
    WHERE sm.contrato_id = $1::bigint
      AND COALESCE(sm.activo, TRUE) AND COALESCE(s.activo, TRUE)
      AND COALESCE(i.activo, TRUE) AND COALESCE(m.activo, TRUE)
      AND EXISTS (
        SELECT 1 FROM focalizacion_vigencias fv
        WHERE fv.contrato_id = sm.contrato_id AND fv.institucion_id = i.id
          AND fv.sede_id = s.id AND fv.modalidad_id = m.id
          AND fv.vigente_desde <= $2::date
          AND (fv.vigente_hasta IS NULL OR fv.vigente_hasta >= $3::date)
      )
    ORDER BY institucion, sede, modalidad
  `, [contratoId, fecha, fechaFin]);
  return result.rows;
}

export function selectTurnContext(
  options: TurnContextOption[],
  input: { modalidad_id?: unknown; sede_id?: unknown; institucion_id?: unknown; municipio_id?: unknown },
): TurnContextOption {
  if (!input.institucion_id) {
    throw new AppError('Selecciona la institución del turno', 400, 'TURNO_INSTITUCION_REQUERIDA');
  }
  if (!input.sede_id) {
    throw new AppError('Selecciona la sede del turno', 400, 'TURNO_SEDE_REQUERIDA');
  }
  if (!input.modalidad_id) {
    throw new AppError('Selecciona la modalidad del turno', 400, 'TURNO_MODALIDAD_REQUERIDA');
  }
  const matches = options.filter(option =>
    option.modalidad_id === String(input.modalidad_id) &&
    option.sede_id === String(input.sede_id) &&
    option.institucion_id === String(input.institucion_id) &&
    (!input.municipio_id || option.municipio_id === String(input.municipio_id)),
  );
  if (matches.length !== 1) {
    throw new AppError('Selecciona institución, sede y modalidad vigentes del turno', 409, 'TURNO_CONTEXTO_INVALIDO');
  }
  return matches[0]!;
}
