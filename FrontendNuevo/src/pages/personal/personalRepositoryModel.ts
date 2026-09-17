import type { CatalogoItem } from '../../types/configuracion.types';
import type { ContractPersonalListItem } from '../../types/vinculaciones.types';
import type { ChecklistItemApi, VinculacionChecklistApi } from '../../types/expediente.types';
import type { RepositorioDocumentoApi } from '../../types/repositorio.types';

export type MatrixItem = Pick<ChecklistItemApi, 'ambito_documental' | 'tipo_documento_id' | 'codigo' | 'nombre_requisito' | 'tipo_documento_nombre' | 'documento_id' | 'fuente_documento' | 'requiere_fecha_expedicion' | 'requiere_fecha_vencimiento'> & {
  categoria_documento?: string | null;
  estado_detallado: ChecklistItemApi['estado_detallado'] | 'SIN_DOCUMENTO';
};
export type RepositoryRow = { documents?: RepositorioDocumentoApi[]; worker: ContractPersonalListItem; checklist?: VinculacionChecklistApi; error?: string };
export const repositoryGroups = ['Personales', 'Empresa', 'Seg. Social', 'Antecedentes'];
export const repositoryKey = (item: MatrixItem) => `${item.ambito_documental}:${item.tipo_documento_id ?? item.codigo ?? item.nombre_requisito}`;
export function repositoryGroup(item: MatrixItem) {
  const name = `${item.codigo} ${item.tipo_documento_nombre} ${item.nombre_requisito}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (item.categoria_documento === 'SEGURIDAD_SOCIAL') return 'Seg. Social';
  if (['VINCULACION', 'CAPACITACION', 'DOTACION', 'NOMINA'].includes(item.categoria_documento ?? '')) return 'Empresa';
  if (/anteced|procur|contral|judicial|correctiva|redam|inhabili/.test(name)) return 'Antecedentes';
  if (/\barl\b|\beps\b|pension|cofrem|caja.*compens|seguridad.social/.test(name)) return 'Seg. Social';
  return item.ambito_documental === 'PERSONA' ? 'Personales' : 'Empresa';
}
export function catalogDocument(type: CatalogoItem): MatrixItem {
  return { categoria_documento: type.categoria_documento, ambito_documental: type.alcance === 'VINCULACION' || type.categoria_documento === 'VINCULACION' ? 'VINCULACION' : 'PERSONA', tipo_documento_id: type.id, codigo: type.codigo ?? null, nombre_requisito: type.label, tipo_documento_nombre: type.label, documento_id: null, fuente_documento: null, estado_detallado: 'SIN_DOCUMENTO', requiere_fecha_expedicion: type.requiere_fecha_expedicion ?? false, requiere_fecha_vencimiento: type.requiere_fecha_vencimiento ?? false };
}

export function repositoryCell(row: RepositoryRow, column: MatrixItem): MatrixItem {
    const required = row.checklist?.requisitos.find(item => repositoryKey(item) === repositoryKey(column));
    if (required) return required;
    const doc = row.documents?.find(item => item.tipo_documento_id === column.tipo_documento_id && item.origen === (column.ambito_documental === 'PERSONA' ? 'persona' : 'vinculacion'));
    if (!doc) return column;
    return { ...column, documento_id: doc.documento_id, fuente_documento: column.ambito_documental, estado_detallado: doc.estado_documental === 'vencido' ? 'VENCIDO' : 'COMPLETO' };
  }
