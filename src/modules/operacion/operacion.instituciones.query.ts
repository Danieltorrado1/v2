const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const formatFocalizacionName = (year: unknown, month: unknown) => {
  const y = Number(year);
  const m = Number(month);
  return Number.isInteger(y) && m >= 1 && m <= 12 ? `${MONTHS_ES[m - 1]} ${y}` : 'Focalización sin fecha';
};

export function buildInstitutionPeriodsQuery(source: string, tenantScope: string, contractParam: number, params: unknown[]) {
  return {
    text: `SELECT DISTINCT ON (fv.carga_id,fv.vigente_desde,fv.vigente_hasta) fv.carga_id::text focalizacion_id,fv.vigente_desde::date desde,fv.vigente_hasta::date hasta,EXTRACT(YEAR FROM fv.vigente_desde)::int anio,EXTRACT(MONTH FROM fv.vigente_desde)::int mes,fc.nombre_archivo ${source} JOIN focalizacion_cargas fc ON fc.id=fv.carga_id WHERE ${tenantScope} AND ff.contrato_id=$${contractParam}::bigint AND fv.carga_id IS NOT NULL ORDER BY fv.carga_id,fv.vigente_desde,fv.vigente_hasta,fv.id DESC`,
    params: params.slice(0, contractParam),
  };
}

export function buildInstitutionManagersQuery(source: string, where: string, params: unknown[]) {
  return {
    text: `SELECT DISTINCT gestor.id,gestor.nombre ${source} ${where} AND gestor.id IS NOT NULL ORDER BY gestor.nombre`,
    params,
  };
}
