import type { InstitutionPeriod } from '../../services/operacionApi';

const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/** IDs are focalizacion_cargas IDs, never row/vigencia IDs or payroll IDs. */
export function focalizacionOptions(rows: InstitutionPeriod[], empresaId: number | null, contratoId: number | null): InstitutionPeriod[] {
  const unique = new Map<string, InstitutionPeriod>();
  for (const row of rows) {
    if (row.empresa_id !== undefined && String(row.empresa_id) !== String(empresaId)) continue;
    if (row.contrato_id !== undefined && String(row.contrato_id) !== String(contratoId)) continue;
    if (row.activo === false || (row.estado && !['PROCESADO','PROCESADO_CON_ALERTAS'].includes(row.estado))) continue;
    if (!row.id || !months[row.mes - 1] || !Number.isInteger(row.anio)) continue;
    unique.set(String(row.id), { ...row, id: String(row.id), nombre: `${months[row.mes - 1]} ${row.anio}` });
  }
  const options = [...unique.values()].sort((a,b) => b.anio*100+b.mes-(a.anio*100+a.mes) || (b.version ?? 0)-(a.version ?? 0) || Number(b.id)-Number(a.id));
  return options.map(row => options.some(other => other.id !== row.id && other.mes === row.mes && other.anio === row.anio)
    ? { ...row, nombre: `${row.nombre} · versión ${row.version ?? row.id}` } : row);
}
