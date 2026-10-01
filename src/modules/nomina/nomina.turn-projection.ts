import type { QueryResult, QueryResultRow } from 'pg';

interface ReadExecutor {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

// Response projection only: the historical record and monetary snapshot stay intact.
// A linkage is stable across payroll periods; a materialized employee ID is not.
export async function projectInternalTurnEmployees(
  rows: Array<Record<string, unknown>>,
  periodoId: string | null | undefined,
  executor: ReadExecutor,
): Promise<Array<Record<string, unknown>>> {
  if (!periodoId) return rows;
  const isInternal = (row: Record<string, unknown>) =>
    row.tipo_turno === 'INTERNO' || row.tipo_movimiento === 'TURNO_INTERNO';
  const links = [...new Set(rows.filter(isInternal).map(row => String(row.vinculacion_id ?? '')).filter(Boolean))];
  if (!links.length) return rows;
  const result = await executor.query<{ id: string; vinculacion_id: string }>(`
    SELECT ne.id::text AS id, ne.vinculacion_id::text AS vinculacion_id
    FROM nomina_empleados ne
    JOIN nomina_periodos np ON np.id = ne.periodo_id
    JOIN contratos c ON c.id = np.contrato_id
    JOIN vinculaciones v ON v.id = ne.vinculacion_id
      AND v.contrato_id = np.contrato_id AND v.empresa_id = c.empresa_id
    WHERE ne.periodo_id = $1::bigint AND ne.vinculacion_id = ANY($2::bigint[])
  `, [periodoId, links]);
  const byLink = new Map<string, string[]>();
  for (const employee of result.rows) {
    const ids = byLink.get(employee.vinculacion_id) ?? [];
    ids.push(employee.id);
    byLink.set(employee.vinculacion_id, ids);
  }
  return rows.map(row => {
    if (!isInternal(row)) return row;
    const candidates = byLink.get(String(row.vinculacion_id)) ?? [];
    return {
      ...row,
      nomina_empleado_origen_id: row.nomina_empleado_id,
      nomina_empleado_id: candidates.length === 1 ? candidates[0] : null,
      estado_proyeccion: candidates.length === 1 ? 'RESUELTO' :
        candidates.length === 0 ? 'SIN_EMPLEADO_DESTINO' : 'EMPLEADO_DESTINO_AMBIGUO',
    };
  });
}
