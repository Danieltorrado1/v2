import { getCoberturaResumen, type CoberturaDashboardResponse } from './cobertura.service';
import type { CoberturaResumenQuery } from './cobertura.schemas';

export const getCoberturaDashboard = async (filters: CoberturaResumenQuery): Promise<CoberturaDashboardResponse> => {
  const first = await getCoberturaResumen({ ...filters, page: 1, limit: 100 });
  const pages = [first];
  for (let page = 2; page <= first.pagination.total_pages; page += 1) pages.push(await getCoberturaResumen({ ...filters, page, limit: 100 }));
  const items = pages.flatMap((page) => page.items);
  const result = first;
  const modalities = new Map<string, { sedes: Set<string>; sede_modalidades: number; asignadas: number; requeridas: number }>();
  const municipalities = new Map<string, { asignadas: number; requeridas: number }>();
  let deficit = 0;
  let excess = 0;
  let complete = 0;
  let deficitarias = 0;
  let conExceso = 0;
  let sinPersonal = 0;

  const detalle = items.map((item) => {
    const requeridas = item.manipuladores_requeridos;
    const asignadas = item.asignados;
    const diferencia = Number((asignadas - requeridas).toFixed(6));
    if (diferencia < 0) { deficit += Math.abs(diferencia); deficitarias += 1; }
    if (diferencia > 0) { excess += diferencia; conExceso += 1; }
    if (diferencia === 0) complete += 1;
    if (asignadas === 0 && requeridas > 0) sinPersonal += 1;
    const modalidad = item.modalidad_original || item.modalidad_base;
    const modality = modalities.get(modalidad) ?? { sedes: new Set<string>(), sede_modalidades: 0, asignadas: 0, requeridas: 0 };
    modality.sedes.add(item.sede_id ?? item.sede ?? item.focalizacion_final_id);
    modality.sede_modalidades += 1;
    modality.asignadas += asignadas;
    modality.requeridas += requeridas;
    modalities.set(modalidad, modality);
    const municipio = item.municipio_nombre ?? item.municipio_texto ?? 'Sin municipio';
    const municipality = municipalities.get(municipio) ?? { asignadas: 0, requeridas: 0 };
    municipality.asignadas += asignadas;
    municipality.requeridas += requeridas;
    municipalities.set(municipio, municipality);
    return { focalizacion_final_id: Number(item.focalizacion_final_id), municipio, institucion: item.institucion, sede: item.sede, modalidad, requeridas, asignadas, diferencia, estado: item.estado_cobertura };
  });
  const requeridas = items.reduce((sum, item) => sum + item.manipuladores_requeridos, 0);
  const asignadas = items.reduce((sum, item) => sum + item.asignados, 0);
  return {
    fecha_consulta: result.fecha_consulta,
    kpis: { focalizacion_total: items.reduce((sum, item) => sum + item.cupos_aprobados, 0), cobertura_requerida: requeridas, asignadas, deficit_distribuido: deficit, exceso_distribuido: excess, cumplimiento_nominal: requeridas ? Number((asignadas / requeridas * 100).toFixed(2)) : 0 },
    estado_sede_modalidad: { completas: complete, deficitarias, con_exceso: conExceso, sin_personal: sinPersonal },
    modalidades: [...modalities.entries()].map(([modalidad, value]) => ({ modalidad, sedes: value.sedes.size, sede_modalidades: value.sede_modalidades, asignadas: value.asignadas, requeridas: value.requeridas })),
    municipios: [...municipalities.entries()].map(([municipio, value]) => ({ municipio, ...value })),
    detalle
  };
};

