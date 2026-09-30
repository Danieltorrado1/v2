import type { NominaTipoNovedad } from '../../types/nomina.types';

export type CambioTipo = 'CAMBIO_DE_MODALIDAD' | 'CAMBIO_DE_SEDE' | 'CAMBIO_COMBINADO';
export type ContextoCambio = Record<string, unknown> & {
  municipio_id?: string | null; municipio?: string | null;
  institucion_id?: string | null; institucion?: string | null;
  sede_id?: string | null; sede?: string | null;
  modalidad_id?: string | null; modalidad?: string | null;
};
export type OpcionCambio = ContextoCambio & { id: string };

export interface CambioPreview {
  modalidadAnterior: string;
  modalidadNueva: string;
  fechaEfectiva: string;
  categoriaEstado: 'VALIDAR' | 'REQUIERE_REVISION_SALARIAL';
}

export interface CategoryOption { id: string; contrato_id?: string | number; modalidad?: string | null; vigente_desde?: string | null; vigente_hasta?: string | null; activo?: boolean; }

export function proposeCategoryForChange(categories: CategoryOption[], contratoId: string | number | null | undefined, modalidad: string | null | undefined, fecha: string) {
  const normalized = String(modalidad ?? '').trim().toLocaleLowerCase();
  const candidates = categories.filter((category) => String(category.contrato_id ?? '') === String(contratoId ?? '') && String(category.modalidad ?? '').trim().toLocaleLowerCase() === normalized && category.activo !== false && (!category.vigente_desde || category.vigente_desde <= fecha) && (!category.vigente_hasta || category.vigente_hasta >= fecha));
  return candidates.length === 1 ? { estado: 'PROPUESTA' as const, categoriaId: candidates[0]!.id } : { estado: 'REQUIERE_REVISION_SALARIAL' as const, categoriaId: null };
}

export function buildCambioPreview(anterior: ContextoCambio, nuevo: ContextoCambio, fechaEfectiva: string, categoryAmbiguous: boolean, categoryId: string | null | undefined): CambioPreview {
  return {
    modalidadAnterior: String(anterior.modalidad ?? anterior.modalidad_id ?? 'Sin modalidad'),
    modalidadNueva: String(nuevo.modalidad ?? nuevo.modalidad_id ?? 'Sin modalidad'),
    fechaEfectiva,
    categoriaEstado: categoryAmbiguous || !categoryId ? 'REQUIERE_REVISION_SALARIAL' : 'VALIDAR',
  };
}

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
