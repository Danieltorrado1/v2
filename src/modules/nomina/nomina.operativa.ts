import type { PoolClient, QueryResultRow } from 'pg';

import { AppError } from '../../utils/AppError';

export type NominaEmpleadoOperativoEstado = 'PENDIENTE' | 'REVISADO' | 'CERRADO';
export type NominaRevisionOperativaDetalleEstado = 'PENDIENTE' | 'REVISADO' | 'REQUIERE_REVISION';

export interface NominaEmpleadoOperativoContextRow extends QueryResultRow {
  nomina_empleado_id: string;
  periodo_id: string;
  periodo_estado: string;
  persona_id: string;
  revision_estado: NominaRevisionOperativaDetalleEstado | null;
  revisado: boolean | null;
  revisado_at: Date | null;
  estado: string | null;
  vinculacion_id: string;
}

const NOMINA_OPERATIVA_ESTADOS = new Set<NominaEmpleadoOperativoEstado>([
  'PENDIENTE',
  'REVISADO',
  'CERRADO'
]);

const OPERATIVE_CONTEXT_SELECT = `
  SELECT
    ne.id::text AS nomina_empleado_id,
    ne.periodo_id::text AS periodo_id,
    np.estado AS periodo_estado,
    v.persona_id::text AS persona_id,
    ne.vinculacion_id::text AS vinculacion_id,
    ne.estado AS estado,
    ne.revisado AS revisado,
    ro.estado_revision AS revision_estado,
    ro.revisado_at
  FROM nomina_empleados ne
  INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
  INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
  LEFT JOIN nomina_revision_operativa ro
    ON ro.periodo_id = ne.periodo_id
   AND ro.nomina_empleado_id = ne.id
`;

export const normalizeNominaEmpleadoOperativoEstado = (
  estado: string | null | undefined
): NominaEmpleadoOperativoEstado => {
  const normalized = (estado ?? '').trim().toUpperCase();
  return NOMINA_OPERATIVA_ESTADOS.has(normalized as NominaEmpleadoOperativoEstado)
    ? (normalized as NominaEmpleadoOperativoEstado)
    : 'PENDIENTE';
};

export const isNominaEmpleadoCerrado = (estado: string | null | undefined): boolean =>
  normalizeNominaEmpleadoOperativoEstado(estado) === 'CERRADO';

export const assertNominaEmpleadoEditable = (
  context: Pick<NominaEmpleadoOperativoContextRow, 'estado'>,
  action: string
): void => {
  if (!isNominaEmpleadoCerrado(context.estado)) {
    return;
  }

  throw new AppError(
    `La nomina individual del trabajador esta cerrada. Reabre la nomina antes de ${action}.`,
    409,
    'NOMINA_EMPLEADO_CERRADO'
  );
};

export const loadNominaEmpleadoOperativoContextByIdOrThrow = async (
  client: PoolClient,
  nominaEmpleadoId: string
): Promise<NominaEmpleadoOperativoContextRow> => {
  const result = await client.query<NominaEmpleadoOperativoContextRow>(
    `${OPERATIVE_CONTEXT_SELECT}
     WHERE ne.id = $1::bigint
       AND COALESCE(ne.activo, TRUE) = TRUE
     LIMIT 1`,
    [nominaEmpleadoId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Payroll employee not found', 404, 'NOMINA_EMPLEADO_NOT_FOUND');
  }
  return row;
};

export const loadNominaEmpleadoOperativoContextByPeriodoVinculacionOrThrow = async (
  client: PoolClient,
  periodoId: string,
  vinculacionId: string
): Promise<NominaEmpleadoOperativoContextRow> => {
  const result = await client.query<NominaEmpleadoOperativoContextRow>(
    `${OPERATIVE_CONTEXT_SELECT}
     WHERE ne.periodo_id = $1::bigint
       AND ne.vinculacion_id = $2::bigint
       AND COALESCE(ne.activo, TRUE) = TRUE
     LIMIT 1`,
    [periodoId, vinculacionId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(
      'Payroll employee does not belong to the provided period',
      404,
      'NOMINA_EMPLEADO_PERIODO_NOT_FOUND'
    );
  }
  return row;
};

export const syncNominaEmpleadoOperativoEstado = async (
  client: PoolClient,
  nominaEmpleadoId: string,
  estado: NominaEmpleadoOperativoEstado
): Promise<void> => {
  await client.query(
    `
      UPDATE nomina_empleados
      SET
        revisado = $2,
        estado = $3
      WHERE id = $1::bigint
    `,
    [nominaEmpleadoId, estado === 'REVISADO' || estado === 'CERRADO', estado]
  );
};

export const invalidateNominaEmpleadoRevisionState = async (
  client: PoolClient,
  nominaEmpleadoId: string
): Promise<void> => {
  await client.query(
    `
      UPDATE nomina_empleados
      SET
        revisado = FALSE,
        estado = 'PENDIENTE'
      WHERE id = $1::bigint
        AND UPPER(COALESCE(estado, 'PENDIENTE')) = 'REVISADO'
    `,
    [nominaEmpleadoId]
  );
};
