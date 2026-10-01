export const FOCALIZACION_OPTIONS_SQL = `SELECT fc.id::text id,c.empresa_id::text empresa_id,fc.contrato_id::text contrato_id,
  fc.fecha_inicio_vigencia::text fecha_inicio,fc.fecha_fin_vigencia::text fecha_fin,
  EXTRACT(YEAR FROM fc.fecha_inicio_vigencia)::int anio,EXTRACT(MONTH FROM fc.fecha_inicio_vigencia)::int mes,
  fc.estado,fc.version,fc.es_vigente,
  ARRAY_AGG(DISTINCT fv.id::text ORDER BY fv.id::text) vigencia_ids
  FROM focalizacion_cargas fc JOIN contratos c ON c.id=fc.contrato_id
  JOIN focalizacion_vigencias fv ON fv.carga_id=fc.id AND fv.contrato_id=fc.contrato_id
  WHERE fc.contrato_id=$1::bigint AND fc.activo=TRUE AND fv.activo=TRUE
    AND fc.estado IN ('PROCESADO','PROCESADO_CON_ALERTAS') AND fc.fecha_inicio_vigencia IS NOT NULL
  GROUP BY fc.id,c.empresa_id ORDER BY fc.fecha_inicio_vigencia DESC,fc.version DESC,fc.id DESC`;

const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export function focalizacionLabel(anio: number, mes: number): string {
  return `${months[mes - 1] ?? 'Mes desconocido'} ${anio}`;
}
export function defaultFocalizacion<T extends { id: string; fecha_inicio: string; fecha_fin: string | null }>(options: T[], today: string): T | null {
  return options.find(row => row.fecha_inicio <= today && (!row.fecha_fin || row.fecha_fin >= today))
    ?? options.find(row => row.fecha_inicio <= today) ?? options[0] ?? null;
}
export const NOMINA_POR_FECHA_SQL = `SELECT np.id::text nomina_periodo_id,c.empresa_id::text empresa_id,np.contrato_id::text contrato_id,
  np.nombre_periodo,np.fecha_inicio::text,np.fecha_fin::text,np.estado
  FROM nomina_periodos np JOIN contratos c ON c.id=np.contrato_id
  WHERE np.contrato_id=$1::bigint AND np.activo=TRUE AND np.estado='ABIERTO'
    AND np.fecha_inicio<=$2::date AND np.fecha_fin>=$2::date ORDER BY np.id`;
