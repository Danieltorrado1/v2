import type { ContractPersonalFilterOptions } from '../../types/vinculaciones.types';

type Dimension = 'municipio_id' | 'institucion_id' | 'sede_id';
type Selection = Partial<Record<Dimension, string>>;

// Use the contract catalog's actual combinations, never infer a site's municipality.
// Keep an incompatible selection visible: its AND intersection is empty until edited.
export function contextualPersonalOptions(catalog: ContractPersonalFilterOptions, selected: Selection): ContractPersonalFilterOptions {
  const options = (dimension: Dimension, items: Array<{ id: number; nombre: string }>) => {
    const ids = new Set(catalog.asignaciones_operativas.filter(row =>
      (Object.keys(selected) as Dimension[]).every(key => key === dimension || !selected[key] || String(row[key]) === selected[key])
    ).map(row => row[dimension]));
    return items.filter(item => item.id != null && (ids.has(item.id) || String(item.id) === selected[dimension]));
  };
  return {
    ...catalog,
    municipios: options('municipio_id', catalog.municipios) as typeof catalog.municipios,
    instituciones: options('institucion_id', catalog.instituciones) as typeof catalog.instituciones,
    sedes: options('sede_id', catalog.sedes) as typeof catalog.sedes,
  };
}
