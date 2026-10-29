import { AppError } from '../../utils/AppError';
import type { PlanillaSnapshot, PlanillaWorker } from './planilla-operativa.xlsx';
import { isIncompatibleNominaNovedadOverlap, type NominaNovedad, type NominaTipoNovedadCatalogItem } from './nomina.service';
import type { ImportCell, UploadedPlanilla } from './planilla-importacion.xlsx';

export type ImportAction='CREAR'|'SUSTITUIR'|'ASISTENCIA'|'SIN_CAMBIOS'|'CONSERVAR'|'CONFLICTO';
export interface ImportPlanRow { empleado_id:string; vinculacion_id:string; municipio:string; municipio_id:string; trabajadora:string;
  documento:string; fecha:string; anterior:string; nuevo:string; accion:ImportAction; motivo:string; sustituir_ids:string[]; tipo_id?:string; equivalente_id?:string }
export interface ImportPlan { registros_analizados:number; nuevas:number; sustituciones:number; asistencias:number; sin_cambios:number;
  filas_omitidas:number; celdas_vacias:number; conflictos:number; filas:ImportPlanRow[] }
const code=(n:NominaNovedad)=>n.tipo_novedad.codigo_operativo_registrado ?? n.tipo_novedad.codigo_operativo ?? '';
export const specialImportType=(t:NominaTipoNovedadCatalogItem|NominaNovedad['tipo_novedad'])=> t.requiere_horas || t.requiere_valor || t.requiere_soporte ||
  t.requiere_solicitud_permiso || t.requiere_autorizacion_descuento || t.afecta_cobertura || t.efecto_cobertura!=='SIN_EFECTO' ||
  t.modelo_registro==='EVENTO_CANONICO_RANGO' || t.efecto_operativo!=='SIN_EFECTO' ||
  ['TA','TURNO_ADICIONAL','FECHA_RETIRO','CAMBIO_DE_MODALIDAD','CAMBIO_DE_SEDE','CAMBIO_COMBINADO'].includes(t.codigo_operativo ?? '');

export function assertImportWorkerScope(upload:UploadedPlanilla,current:PlanillaSnapshot):void {
  if (current.periodo.id!==upload.baseline.periodo.id || current.periodo.empresa_id!==upload.baseline.periodo.empresa_id || current.periodo.contrato_id!==upload.baseline.periodo.contrato_id) {
    throw new AppError('Empresa, contrato o periodo incompatibles',403,'PLANILLA_SCOPE_MISMATCH');
  }
  const currentById=new Map(current.trabajadores.map(w=>[w.id,w]));
  for (const w of upload.baseline.trabajadores) {
    const live=currentById.get(w.id);
    if (!live) throw new AppError('El archivo contiene personal fuera de sus permisos actuales',403,'PLANILLA_ACCESS_DENIED');
    for (const field of ['vinculacion_id','persona_id','documento','nombre','municipio_id','institucion_id','sede_id','modalidad_id','municipio','institucion','sede','modalidad','fecha_inicio','fecha_fin','tipo_contexto','solo_lectura'] as const) {
      if (live[field]!==w[field]) throw new AppError('La identidad o el contexto laboral cambiaron: descargue nuevamente',409,'PLANILLA_CONTEXTO_CAMBIO');
    }
  }
}

export function buildImportPlan(upload:UploadedPlanilla,current:PlanillaSnapshot,cells:ImportCell[],permissions:string[]):ImportPlan {
  assertImportWorkerScope(upload,current);
  const workers=new Map(current.trabajadores.map(w=>[w.id,w]));
  const guards=new Map(current.import_guard?.map(g=>[g.id,g]));
  const oldGuards=new Map(upload.baseline.import_guard!.map(g=>[g.id,g]));
  const byWorker=new Map<string,NominaNovedad[]>();
  for (const n of current.novedades) byWorker.set(n.nomina_empleado_id,[...(byWorker.get(n.nomina_empleado_id) ?? []),n]);
  const attendance=new Map<string,PlanillaSnapshot['asistencias']>();
  for (const a of current.asistencias) { const k=`${a.vinculacion_id}:${a.fecha}`; attendance.set(k,[...(attendance.get(k) ?? []),a]); }
  const plan:ImportPlan={registros_analizados:cells.length,nuevas:0,sustituciones:0,asistencias:0,sin_cambios:0,filas_omitidas:0,celdas_vacias:0,conflictos:0,filas:[]};
  const row=(w:PlanillaWorker,fecha:string,anterior:string,nuevo:string,accion:ImportAction,motivo:string,replace:string[]=[],type?:string):ImportPlanRow=>({
    empleado_id:w.id,vinculacion_id:w.vinculacion_id,municipio:w.municipio,municipio_id:w.municipio_id!,trabajadora:w.nombre,documento:w.documento,
    fecha,anterior,nuevo,accion,motivo,sustituir_ids:replace,...(type ? {tipo_id:type} : {}) });
  for (const worker of upload.baseline.trabajadores) if (!guards.get(worker.id) || guards.get(worker.id)!.revision!==oldGuards.get(worker.id)?.revision) {
    plan.filas.push(row(workers.get(worker.id)!,current.periodo.fecha_inicio,'Revision de descarga','Revision actual','CONFLICTO','REGISTROS_CAMBIARON_DESDE_DESCARGA: vuelva a descargar y revisar'));
  }
  for (const cell of cells) {
    const w=workers.get(cell.empleado_id)!;
    const all=byWorker.get(w.id) ?? [];
    const events=all.filter(n=>n.fecha_inicio && n.fecha_fin && n.fecha_inicio<=cell.fecha && n.fecha_fin>=cell.fecha);
    const asist=attendance.get(`${w.vinculacion_id}:${cell.fecha}`) ?? [];
    const anterior=[...asist.map(a=>a.estado_dia ?? ''),...events.map(code)].filter(Boolean).join(' + ');
    const add=(action:ImportAction,reason:string,replace:string[]=[],type?:string,equivalent?:string)=>plan.filas.push({...row(w,cell.fecha,anterior,cell.valor,action,reason,replace,type),...(equivalent?{equivalente_id:equivalent}:{})});
    if (!cell.valor) { add('CONSERVAR','Celda vacia: conserva originales, sin bajas'); plan.celdas_vacias++; continue; }
    // The reader trims daily input, but retains the signed original verbatim.
    // Compare text with the same edge-whitespace rule; never rewrite the original,
    // normalize internal spaces/case, or treat a non-text cell as unchanged.
    if (cell.texto && cell.valor===cell.original.trim()) { add('SIN_CAMBIOS','Valor original sin cambios: preserva todos los eventos'); continue; }
    if (w.solo_lectura) { add('CONFLICTO',`CONSULTA_PROTEGIDA: ${w.solo_lectura}`); continue; }
    const simpleMultiple=events.length>1 && !asist.length && events.every(n=>n.registro_tipo==='ORDINARIA' && !specialImportType(n.tipo_novedad) && !n.requiere_cobertura && !n.cobertura);
    if (!cell.editable && !simpleMultiple) { add('CONFLICTO','CELDA_PROTEGIDA: detalle multiple/especial, estado o fecha fuera de vinculacion'); continue; }
    if (!cell.texto) { add('CONFLICTO','CODIGO_NO_TEXTO: seleccione un codigo del catalogo'); continue; }
    if (cell.fecha<w.fecha_inicio || (w.fecha_fin && cell.fecha>w.fecha_fin)) { add('CONFLICTO','FUERA_VINCULACION'); continue; }
    if (current.periodo.estado!=='ABIERTO' || w.estado.toUpperCase()!=='PENDIENTE' && ['CERRADO','CERRADA','INACTIVO','RETIRADO'].includes(w.estado.toUpperCase())) { add('CONFLICTO','PERIODO_O_PERSONA_NO_EDITABLE'); continue; }
    const guard=guards.get(w.id)!;
    if (guard.bloqueado) { add('CONFLICTO','PROCESAMIENTO_O_MOVIMIENTOS_ASOCIADOS: resolver mediante flujos V1'); continue; }
    if (['PRESENTE','PENDIENTE'].includes(cell.valor)) {
      if (!permissions.includes('nomina.periodos.update')) { add('CONFLICTO','SIN_PERMISO_ASISTENCIA'); continue; }
      if (asist.length>1 || cell.valor==='PRESENTE' && events.some(n=>!current.catalogo.find(t=>t.id===n.tipo_novedad.id)?.permite_asistencia_simultanea)) { add('CONFLICTO','ASISTENCIA_CON_NOVEDAD_O_DUPLICADOS: no transforma novedades'); continue; }
      if (asist.length===1 && asist[0]!.estado_dia===cell.valor) { add('SIN_CAMBIOS','Asistencia equivalente'); continue; }
      add('ASISTENCIA','Flujo V1 de asistencia; conserva novedades'); continue;
    }
    const types=current.catalogo.filter(t=>t.activo && t.codigo_operativo===cell.valor);
    if (types.length!==1) { add('CONFLICTO','CODIGO_INEXISTENTE_INACTIVO_O_AMBIGUO'); continue; }
    const type=types[0]!;
    const equivalent=events.find(n=>n.tipo_novedad.id===type.id);
    const incompatible=events.filter(n=>n.tipo_novedad.id!==type.id && isIncompatibleNominaNovedadOverlap(type,{ ...n.tipo_novedad,
      tipo_novedad_id:n.tipo_novedad.id,id:n.id,fecha_conflicto:cell.fecha,fecha_inicio:n.fecha_inicio!,fecha_fin:n.fecha_fin!,
      origen:n.registro_tipo==='ORDINARIA' ? 'ORDINARIA' : 'CANONICA' }));
    if (equivalent && !incompatible.length) { add('SIN_CAMBIOS','Novedad equivalente: no duplica ni reemplaza detalles'); continue; }
    if (!equivalent && !permissions.includes('nomina.novedades.create')) { add('CONFLICTO','SIN_PERMISO_CREAR_NOVEDAD'); continue; }
    if (specialImportType(type)) { add('CONFLICTO','TIPO_REQUIERE_FLUJO_ADICIONAL: soportes, cantidades no representadas, turnos, contexto o evento canonico'); continue; }
    if (all.some(n=>!n.fecha_inicio || !n.fecha_fin)) { add('CONFLICTO','NOVEDAD_SIN_FECHAS: no es posible determinar compatibilidad'); continue; }
    if (!type.permite_asistencia_simultanea && asist.some(a=>a.estado_dia==='PRESENTE')) { add('CONFLICTO','ASISTENCIA_EXISTENTE: no transforma asistencia en novedad'); continue; }
    if (incompatible.length && !permissions.includes('nomina.novedades.deactivate')) { add('CONFLICTO','SIN_PERMISO_SUSTITUIR_NOVEDAD'); continue; }
    if (incompatible.some(n=>n.registro_tipo!=='ORDINARIA' || specialImportType(n.tipo_novedad) || n.requiere_cobertura || n.cobertura ||
      n.documento_persona_id || n.valor_manual!==null && n.valor_manual!==undefined || n.revisado || guard.novedades_dependientes.includes(n.id) ||
      n.fecha_inicio!==cell.fecha || n.fecha_fin!==cell.fecha || Object.values(n.documentos).some(d=>d.cargado))) {
      add('CONFLICTO','SUSTITUCION_CON_DEPENDENCIAS_O_RANGO: resolver expresamente mediante flujos V1'); continue;
    }
    add(incompatible.length ? 'SUSTITUIR' : 'CREAR',incompatible.length ? 'Prevalece Excel; baja logica solo de eventos incompatibles y auditoria integra' : 'Nueva novedad; conserva eventos compatibles',incompatible.map(n=>n.id),type.id,equivalent?.id);
  }
  plan.nuevas=plan.filas.filter(r=>r.accion==='CREAR').length;
  plan.sustituciones=plan.filas.filter(r=>r.accion==='SUSTITUIR').length;
  plan.asistencias=plan.filas.filter(r=>r.accion==='ASISTENCIA').length;
  plan.sin_cambios=plan.filas.filter(r=>r.accion==='SIN_CAMBIOS').length;
  plan.conflictos=plan.filas.filter(r=>r.accion==='CONFLICTO').length;
  const changed=new Set(plan.filas.filter(r=>['CREAR','SUSTITUIR','ASISTENCIA'].includes(r.accion)).map(r=>r.empleado_id));
  plan.filas_omitidas=upload.baseline.trabajadores.filter(w=>!changed.has(w.id)).length;
  return plan;
}
