export interface ModalidadVigencia {
  modalidad_id?: string | number | null;
  modalidad?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
}

export interface CategoriaSalarialCandidata {
  id: string | number;
  modalidad?: string | null;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
}

export type CategoriaSalarialPropuesta =
  | { estado: 'PROPUESTA'; categoria_id: string | number; fecha_efectiva: string }
  | { estado: 'REQUIERE_REVISION_SALARIAL'; fecha_efectiva: string; candidatos: Array<string | number> };

const normalize = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

export const resolveModalidadVigente = (historial: ModalidadVigencia[], fecha: string): ModalidadVigencia | null => historial
  .filter((item) => item.fecha_inicio <= fecha && (!item.fecha_fin || item.fecha_fin >= fecha))
  .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio))[0] ?? null;

export const buildModalidadTramos = (historial: ModalidadVigencia[], periodoInicio: string, periodoFin: string) => {
  const cortes = new Set<string>([periodoInicio, periodoFin]);
  for (const item of historial) if (item.fecha_inicio > periodoInicio && item.fecha_inicio <= periodoFin) cortes.add(item.fecha_inicio);
  const fechas = [...cortes].sort();
  return fechas.slice(0, -1).map((inicio, index) => {
    const siguiente = fechas[index + 1]!;
    const finDate = new Date(`${siguiente}T00:00:00Z`);
    finDate.setUTCDate(finDate.getUTCDate() - 1);
    const modalidad = resolveModalidadVigente(historial, inicio);
    return { fecha_inicio: inicio, fecha_fin: siguiente === periodoFin ? periodoFin : finDate.toISOString().slice(0, 10), modalidad_id: modalidad?.modalidad_id ?? null, modalidad: modalidad?.modalidad ?? null };
  }).filter((item) => item.fecha_inicio <= item.fecha_fin);
};

export const proposeSalaryCategory = (categorias: CategoriaSalarialCandidata[], modalidad: { modalidad?: string | null }, fechaEfectiva: string): CategoriaSalarialPropuesta => {
  const modality = normalize(modalidad.modalidad);
  const validas = categorias.filter((categoria) => normalize(categoria.modalidad) === modality && (!categoria.vigente_desde || categoria.vigente_desde <= fechaEfectiva) && (!categoria.vigente_hasta || categoria.vigente_hasta >= fechaEfectiva));
  if (validas.length === 1) return { estado: 'PROPUESTA', categoria_id: validas[0]!.id, fecha_efectiva: fechaEfectiva };
  return { estado: 'REQUIERE_REVISION_SALARIAL', fecha_efectiva: fechaEfectiva, candidatos: validas.map((item) => item.id) };
};
