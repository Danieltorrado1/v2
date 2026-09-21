const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const formatFocalizacionName = (year: unknown, month: unknown) => {
  const y = Number(year);
  const m = Number(month);
  return Number.isInteger(y) && m >= 1 && m <= 12 ? `${MONTHS_ES[m - 1]} ${y}` : 'Focalización sin fecha';
};

export function buildInstitutionPeriodsQuery(source: string, tenantScope: string, contractParam: number, params: unknown[]) {
  return {
    text: `SELECT DISTINCT fv.id::text focalizacion_id,EXTRACT(YEAR FROM fv.vigente_desde)::int anio,EXTRACT(MONTH FROM fv.vigente_desde)::int mes ${source} WHERE ${tenantScope} AND ff.contrato_id=$${contractParam}::bigint ORDER BY anio DESC,mes DESC`,
    params: params.slice(0, contractParam),
  };
}

export function buildInstitutionManagersQuery(source: string, where: string, params: unknown[]) {
  return {
    text: `SELECT DISTINCT gestor.id,gestor.nombre ${source} ${where} AND gestor.id IS NOT NULL ORDER BY gestor.nombre`,
    params,
  };
}
