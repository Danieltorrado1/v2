import type { NominaTipoNovedad } from '../../types/nomina.types';

export type CambioTipo = 'CAMBIO_DE_MODALIDAD' | 'CAMBIO_DE_SEDE' | 'CAMBIO_COMBINADO';
export type ContextoCambio = Record<string, unknown> & {
  municipio_id?: string | null; municipio?: string | null;
  institucion_id?: string | null; institucion?: string | null;
  sede_id?: string | null; sede?: string | null;
  modalidad_id?: string | null; modalidad?: string | null;
};
export type OpcionCambio = ContextoCambio & { id: string };

// The catalog IDs are installation-specific; use the existing type's name/code.
export function tipoCambioOperativo(type: Pick<NominaTipoNovedad, 'nombre' | 'codigo_operativo'> | null): CambioTipo | null {
  const name = (type?.codigo_operativo || type?.nombre || '').trim().toUpperCase().replaceAll(' ', '_');
  return ['CAMBIO_DE_MODALIDAD', 'CAMBIO_DE_SEDE', 'CAMBIO_COMBINADO'].includes(name) ? name as CambioTipo : null;
}

export function opcionesContexto(rows: OpcionCambio[], institucion: string, sede: string) {
  const unique = (key: 'institucion_id' | 'sede_id' | 'modalidad_id', items: OpcionCambio[]) =>
    [...new Map(items.filter(row => row[key]).map(row => [row[key], row])).values()];
  const valid = rows.filter(row => row.institucion_id && row.sede_id && row.modalidad_id);
  return {
    instituciones: unique('institucion_id', valid),
    sedes: unique('sede_id', valid.filter(row => row.institucion_id === institucion)),
    modalidades: unique('modalidad_id', valid.filter(row => row.institucion_id === institucion && row.sede_id === sede)),
  };
}

export function contextoDestino(base: ContextoCambio, option: OpcionCambio): ContextoCambio {
  return { ...base, municipio_id: option.municipio_id, municipio: option.municipio,
    institucion_id: option.institucion_id, institucion: option.institucion,
    sede_id: option.sede_id, sede: option.sede,
    modalidad_id: option.modalidad_id, modalidad: option.modalidad };
}

export function canSavePension(permissions: string[], roles: string[]) {
  return roles.some(role => ['ADMINISTRADOR', 'TALENTO_HUMANO'].includes(role.toUpperCase())) &&
    ['nomina.movimientos.create', 'nomina.movimientos.update'].every(permission => permissions.includes(permission));
}
