import type { CatalogoItem } from '../../types/configuracion.types';
import type { ContractPersonalListItem } from '../../types/vinculaciones.types';
import type { ChecklistItemApi, VinculacionChecklistApi } from '../../types/expediente.types';
import type { RepositorioDocumentoApi } from '../../types/repositorio.types';

export type CanonicalCode = 'DATOS_PERSONALES'|'AUTORIZACIONES'|'FORMACION'|'CONTRATACION'|'SEGURIDAD_SOCIAL'|'SST'|'MANIPULACION'|'ANTECEDENTES'|'ACREDITACIONES';
export type Delivery = { id: number; persona_id: number; tipo: 'DOTACION'|'EPP'; fecha: string; elemento: string; cantidad: string; estado: string; documento_id: number|null };
export type MatrixItem = { aplica?: boolean; obligatorio?: boolean; tipo_requisito?: string|null; entregas?: Delivery[] | null; proceso?: boolean; canonical_code: string; group: CanonicalCode; label: string; ambito_documental: 'PERSONA'|'VINCULACION'; tipo_documento_id: number|null; tipo_documento_ids: number[]; identity_type_ids?: number[]; codigo: string|null; nombre_requisito: string; tipo_documento_nombre: string|null; documento_id: number|null; documento_count?: number; fuente_documento: 'PERSONA'|'VINCULACION'|null; estado_detallado: ChecklistItemApi['estado_detallado']|'SIN_DOCUMENTO'|'PARCIAL'|'ACREDITABLE'; requisitos?: ChecklistItemApi[]; cuenta_cumplimiento?: boolean; requiere_fecha_expedicion?: boolean; requiere_fecha_vencimiento?: boolean; multi_record?: boolean; component_codes?: string[] };
export type RepositoryRow = { entregas?: Delivery[] | null; documents?: RepositorioDocumentoApi[]; worker: ContractPersonalListItem; checklist?: VinculacionChecklistApi; error?: string };
export const repositoryGroups = ['DATOS_PERSONALES','AUTORIZACIONES','FORMACION','CONTRATACION','SEGURIDAD_SOCIAL','SST','MANIPULACION','ANTECEDENTES','ACREDITACIONES'] as const;
type Spec = [string, CanonicalCode, string, boolean, string[], boolean?];
const specs: Spec[] = [
 ['HOJA_VIDA','DATOS_PERSONALES','Hoja de vida',true,['HOJA_VIDA','HV']], ['IDENTIDAD','DATOS_PERSONALES','Identidad',true,['IDENTIDAD','CEDULA','PPT']], ['CERT_BANCARIA','DATOS_PERSONALES','Banco',true,['CERT_BANCARIA']], ['RESIDENCIA','DATOS_PERSONALES','Residencia',false,['RESIDENCIA']], ['SISBEN','DATOS_PERSONALES','SISBEN',false,['SISBEN']],
 ['AUT_DATOS','AUTORIZACIONES','Datos personales',true,['AUT_DATOS_PERSONALES','AUT_TRATAMIENTO_DATOS']], ['AUT_INHABILIDADES','AUTORIZACIONES','Inhabilidades',true,['AUT_INHABILIDADES','AUT_CONSULTA_DELITOS_SEXUALES']],
 ['FORMACION','FORMACION','Formación académica',false,['DIPLOMA_BACHILLER','ACTA_BACHILLER','DIPLOMA_TECNICO','ACTA_TECNICO','DIPLOMA_TECNOLOGO','ACTA_TECNOLOGO','DIPLOMA_PROFESIONAL','ACTA_PROFESIONAL','DIPLOMA_ESPECIALIZACION','ACTA_ESPECIALIZACION','DIPLOMA_MAESTRIA','ACTA_MAESTRIA','TITULO_PROFESIONAL'],true], ['TARJETA_PROFESIONAL','FORMACION','Tarjeta profesional',true,['TARJETA_PROFESIONAL']], ['ANTECEDENTES_PROFESIONALES','FORMACION','Antecedentes profesionales',true,['ANTECEDENTES_PROFESIONALES']],
 ['CONTRATO','CONTRATACION','Contrato',true,['CONTRATO']], ['EPS','SEGURIDAD_SOCIAL','EPS',true,['AFILIACION_EPS']], ['ARL','SEGURIDAD_SOCIAL','ARL',true,['AFILIACION_ARL']], ['PENSION','SEGURIDAD_SOCIAL','Pensión',true,['AFILIACION_PENSION']], ['CAJA','SEGURIDAD_SOCIAL','Caja',true,['AFILIACION_CAJA_COMPENSACION']],
 ['EXAMEN_OCUPACIONAL','SST','Examen ocupacional',true,['INGRESO','EXAMEN_SALUD_OCUPACIONAL'],true], ['VACUNACION','SST','Vacunación',true,['CARNET_VACUNACION']], ['INDUCCION','SST','Inducción',true,['INDUCCION']],
 ['DOTACION','SST','Dotación',true,['DOTACION'],true], ['EPP','SST','Entrega EPP',false,[],true],
 ['MANIPULACION','MANIPULACION','Manipulación',true,['CURSO MAN DE ALIMENTOS','EXAMENES MAN DE ALIMENTOS'],true],
 ['ANT_CONTRALORIA','ANTECEDENTES','Contraloría',true,['ANT_CONTRALORIA']], ['ANT_PROCURADURIA','ANTECEDENTES','Procuraduría',true,['ANT_PROCURADURIA']], ['ANT_JUDICIALES','ANTECEDENTES','Judiciales',true,['ANT_JUDICIALES']], ['ANT_MEDIDAS_CORRECTIVAS','ANTECEDENTES','Medidas correctivas',true,['ANT_MEDIDAS_CORRECTIVAS']], ['ANT_REDAM','ANTECEDENTES','REDAM',true,['ANT_REDAM']], ['ANT_INHABILIDADES','ANTECEDENTES','Inhabilidades',true,['ANT_INHABILIDADES']],
 ['CERT_LABORAL','ACREDITACIONES','Certificaciones laborales',false,['CERT_LABORAL'],true]
];
export const repositoryKey = (item: MatrixItem) => `canonical:${item.ambito_documental}:${item.canonical_code}`;
export function repositoryGroup(item: MatrixItem): CanonicalCode { return item.group; }
export function catalogDocument(type: CatalogoItem): MatrixItem { return { canonical_code: type.codigo ?? type.label, group: 'DATOS_PERSONALES', label: type.label, ambito_documental: type.alcance==='VINCULACION'?'VINCULACION':'PERSONA', tipo_documento_id:type.id, tipo_documento_ids:[type.id], codigo:type.codigo??null, nombre_requisito:type.label, tipo_documento_nombre:type.label, documento_id:null, fuente_documento:null, estado_detallado:'SIN_DOCUMENTO' }; }
export function canonicalColumns(catalog: CatalogoItem[]): MatrixItem[] { return specs.map(([code,group,label,_required,aliases,multi]) => { const matches=catalog.filter(t=>aliases.includes(t.codigo??'')); const identity=code==='IDENTIDAD'?matches.map(t=>t.id):undefined; return {proceso:code==='EPP',canonical_code:code,group,label,ambito_documental:'PERSONA',tipo_documento_id:matches[0]?.id??null,tipo_documento_ids:matches.map(t=>t.id),identity_type_ids:identity,codigo:code,nombre_requisito:label,tipo_documento_nombre:label,documento_id:null,fuente_documento:null,estado_detallado:'SIN_DOCUMENTO',cuenta_cumplimiento:false,multi_record:multi,component_codes:code==='MANIPULACION'?['CURSO','EXAMENES']:undefined,requiere_fecha_expedicion:matches.some(t=>t.requiere_fecha_expedicion),requiere_fecha_vencimiento:matches.some(t=>t.requiere_fecha_vencimiento)}; }); }
export function repositoryCell(row: RepositoryRow, column: MatrixItem): MatrixItem {
  if (column.proceso) return { ...column, entregas: row.entregas?.filter(e => e.tipo === column.canonical_code) ?? null, cuenta_cumplimiento: false };
  const requirements = row.checklist?.requisitos.filter(item => item.codigo === column.canonical_code || (column.canonical_code==='DOTACION'&&item.codigo==='DOTACION_HISTORICA') ||
    (item.tipo_documento_ids?.length ? item.tipo_documento_ids : [item.tipo_documento_id])
      .some(id => id !== null && column.tipo_documento_ids.includes(id))) ?? [];
  const origin = column.ambito_documental === 'PERSONA' ? 'persona' : 'vinculacion';
  const docs = row.documents?.filter(d => d.tipo_documento_id !== null && column.tipo_documento_ids.includes(d.tipo_documento_id) && d.origen === origin) ?? [];
  const source = requirements.find(r => r.documento_id) ?? requirements[0];
  const evidence = requirements.flatMap(r => r.documentos ?? []);
  // The server evaluates review and validity. File presence never means approval.
  const state: MatrixItem['estado_detallado'] = source?.estado_detallado ?? (docs.length ? 'PENDIENTE_REVISION' : 'SIN_DOCUMENTO');
  return { ...column, aplica:source?.aplica, obligatorio:source?.obligatorio, tipo_requisito:source?.tipo_requisito,
    ambito_documental:source?.ambito_documental??column.ambito_documental,
    tipo_documento_ids:source?.tipo_documento_ids??column.tipo_documento_ids,
    entregas:column.canonical_code==='DOTACION'?row.entregas?.filter(e=>e.tipo==='DOTACION')??null:column.entregas,
    documento_id: source?.documento_id ?? docs[0]?.documento_id ?? null,
    documento_count: Math.max(docs.length, evidence.length),
    fuente_documento: source?.fuente_documento ?? (docs[0]?.origen === 'persona' ? 'PERSONA' : docs[0]?.origen === 'vinculacion' ? 'VINCULACION' : null),
    cuenta_cumplimiento: source?.cuenta_cumplimiento ?? column.cuenta_cumplimiento,
    estado_detallado: state, requisitos: requirements };
}

export function repositoryOptionalLabel(item:Pick<MatrixItem,'aplica'|'obligatorio'|'tipo_requisito'>) {
  if(item.aplica!==true||item.obligatorio!==false)return null;
  if(item.tipo_requisito==='ACREDITABLE')return 'Acreditable';
  if(['OPCIONAL','CONDICIONAL'].includes(item.tipo_requisito??''))return 'Opcional';
  return null;
}
