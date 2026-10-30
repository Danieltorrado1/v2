import { AppError } from '../../utils/AppError';
import type { PlanillaSnapshot, PlanillaWorker } from './planilla-operativa.xlsx';
import { isIncompatibleNominaNovedadOverlap, type NominaNovedad, type NominaTipoNovedadCatalogItem } from './nomina.service';
import type { ImportCell, UploadedPlanilla } from './planilla-importacion.xlsx';

export type ImportAction='CREAR'|'SUSTITUIR'|'MODIFICAR_RANGO'|'RETIRAR'|'RETIRAR_RANGO'|'ASISTENCIA'|'SUSTITUIR_ASISTENCIA'|'SIN_CAMBIOS'|'CONSERVAR'|'CONFLICTO';
export interface ImportPlanRow { empleado_id:string; vinculacion_id:string; municipio:string; municipio_id:string; trabajadora:string;
  documento:string; fecha:string; anterior:string; nuevo:string; accion:ImportAction; motivo:string; sustituir_ids:string[]; tipo_id?:string; equivalente_id?:string;
  novedad_id?:string; rango_anterior?:{fecha_inicio:string;fecha_fin:string;dias:number}; rango_nuevo?:{fecha_inicio:string;fecha_fin:string;dias:number} }
export interface ImportPlan { registros_analizados:number; nuevas:number; sustituciones:number; modificaciones_rango:number; retiradas:number; asistencias:number; sin_cambios:number;
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
  const innocuousPendingIds = new Set(current.asistencias_pendientes_inocuas ?? []);
  const signedAttendance = new Map<string, typeof upload.baseline.asistencias>();
  for (const a of upload.baseline.asistencias) {
    const key = `${a.vinculacion_id}:${a.fecha}`;
    signedAttendance.set(key, [...(signedAttendance.get(key) ?? []), a]);
  }
  const plan:ImportPlan={registros_analizados:cells.length,nuevas:0,sustituciones:0,modificaciones_rango:0,retiradas:0,asistencias:0,sin_cambios:0,filas_omitidas:0,celdas_vacias:0,conflictos:0,filas:[]};
  const row=(w:PlanillaWorker,fecha:string,anterior:string,nuevo:string,accion:ImportAction,motivo:string,replace:string[]=[],type?:string):ImportPlanRow=>({
    empleado_id:w.id,vinculacion_id:w.vinculacion_id,municipio:w.municipio,municipio_id:w.municipio_id!,trabajadora:w.nombre,documento:w.documento,
    fecha,anterior,nuevo,accion,motivo,sustituir_ids:replace,...(type ? {tipo_id:type} : {}) });
  const safelyRemovable=(n:NominaNovedad,fecha:string,guard:NonNullable<PlanillaSnapshot['import_guard']>[number],allowPnr:boolean)=>
    n.registro_tipo==='ORDINARIA' && n.fecha_inicio===fecha && n.fecha_fin===fecha && !n.requiere_cobertura && !n.cobertura &&
    !n.evento_canonico_id && !n.documento_persona_id && (n.valor_manual===null || n.valor_manual===undefined) && !n.revisado &&
    !guard.bloqueado && !guard.novedades_dependientes.includes(n.id) && !Object.values(n.documentos).some(d=>d.cargado) &&
    (!specialImportType(n.tipo_novedad) || allowPnr && code(n)==='PNR');
  const staleWorkers=new Set<string>();
  for (const worker of upload.baseline.trabajadores) if (!guards.get(worker.id) || guards.get(worker.id)!.revision!==oldGuards.get(worker.id)?.revision) {
    staleWorkers.add(worker.id);
    plan.filas.push(row(workers.get(worker.id)!,current.periodo.fecha_inicio,'Revision de descarga','Revision actual','CONFLICTO','REGISTROS_CAMBIARON_DESDE_DESCARGA: vuelva a descargar y revisar'));
  }
  const cellsByWorkerDate=new Map(cells.map(c=>[`${c.empleado_id}:${c.fecha}`,c]));
  const handledRangeCells=new Set<string>();
  const dayRange=(start:string,end:string)=>{
    const dates:string[]=[];
    for(let d=new Date(`${start}T00:00:00.000Z`),limit=new Date(`${end}T00:00:00.000Z`);d<=limit;d.setUTCDate(d.getUTCDate()+1)) dates.push(d.toISOString().slice(0,10));
    return dates;
  };
  // A signed multi-day event is one logical operation. Group boundary edits
  // before per-cell handling so blanked dates cannot become independent removals.
  for(const base of upload.baseline.novedades) {
    if(!base.fecha_inicio || !base.fecha_fin || base.fecha_inicio>=base.fecha_fin) continue;
    const oldStart=base.fecha_inicio,oldEnd=base.fecha_fin;
    const worker=workers.get(base.nomina_empleado_id);
    if(!worker || staleWorkers.has(worker.id)) continue;
    const originalCode=base.codigo.trim();
    const dates=dayRange(oldStart,oldEnd);
    const visibleDates=dates.filter(date=>cellsByWorkerDate.has(`${worker.id}:${date}`));
    if(!visibleDates.length) continue;
    const rangeCells=visibleDates.map(date=>cellsByWorkerDate.get(`${worker.id}:${date}`));
    if(rangeCells.some(c=>!c)) continue;
    const complete=rangeCells as NonNullable<typeof rangeCells[number]>[];
    const changed=complete.some(c=>c.valor!==c.original.trim());
    if(!changed) continue;
    const currentEvent=current.novedades.find(n=>n.id===base.id && n.nomina_empleado_id===base.nomina_empleado_id);
    const type=current.catalogo.find(t=>t.id===base.tipo_id);
    const guard=guards.get(worker.id);
    const otherEvents=current.novedades.filter(n=>n.nomina_empleado_id===worker.id && n.id!==base.id && n.fecha_inicio && n.fecha_fin &&
      n.fecha_inicio<=oldEnd && n.fecha_fin>=oldStart);
    const dependency=!!currentEvent && (currentEvent.requiere_cobertura || currentEvent.cobertura || currentEvent.documento_persona_id ||
      currentEvent.valor_manual!==null && currentEvent.valor_manual!==undefined || currentEvent.revisado ||
      Object.values(currentEvent.documentos).some(d=>d.cargado));
    const hasAttendance=complete.some(c=>(attendance.get(`${worker.vinculacion_id}:${c.fecha}`)??[]).length>0);
    const innocuousSignedPending = (c: ImportCell): boolean => {
      const key = `${worker.vinculacion_id}:${c.fecha}`;
      const live = attendance.get(key) ?? [], signed = signedAttendance.get(key) ?? [];
      return live.length === 1 && signed.length === 1 && live[0]!.id === signed[0]!.id &&
        live[0]!.estado_dia === 'PENDIENTE' && signed[0]!.estado_dia === 'PENDIENTE' && innocuousPendingIds.has(live[0]!.id);
    };
    // Only range reduction may preserve an unchanged, signed, inert pending row.
    // Keep the original strict attendance/original checks for RETIRAR_RANGO.
    const hasBlockingRangeAttendance = complete.some(c =>
      (attendance.get(`${worker.vinculacion_id}:${c.fecha}`) ?? []).length > 0 && !innocuousSignedPending(c));
    const originalMatchesRange = (c: ImportCell): boolean => {
      if (!c.texto) return false;
      if (c.original.trim() === originalCode) return true;
      const signedEvents = upload.baseline.novedades.filter(n => n.nomina_empleado_id === worker.id &&
        n.fecha_inicio && n.fecha_fin && n.fecha_inicio <= c.fecha && n.fecha_fin >= c.fecha);
      return originalCode === 'S' && c.original === 'PENDIENTE + S [DET]' && innocuousSignedPending(c) &&
        signedEvents.length === 1 && signedEvents[0]!.id === base.id;
    };
    // An unchanged signed aggregate retains this event only with the same
    // strict evidence used to validate its original. It cannot hide a gap.
    const retainsOriginal = (c: ImportCell): boolean => c.valor === originalCode ||
      c.valor === c.original.trim() && originalMatchesRange(c);
    const retainedDates=complete.filter(retainsOriginal).map(c=>c.fecha).sort();
    const newDates=retainedDates.length?dayRange(retainedDates[0]!,retainedDates[retainedDates.length-1]!):[];
    const allCleared=complete.every(c=>c.valor==='');
    const fullyRepresented=visibleDates.length===dates.length;
    const contiguous=fullyRepresented && retainedDates.length>0 && newDates.length===retainedDates.length &&
      complete.every(c=>c.valor==='' || retainsOriginal(c)) && retainedDates[0]!>=oldStart && retainedDates.at(-1)!<=oldEnd;
    const start=retainedDates[0]??oldStart,end=retainedDates.at(-1)??oldEnd;
    const retireSafe=allCleared && fullyRepresented && complete.every(c=>c.original.trim()===originalCode && c.texto) &&
      !!currentEvent && currentEvent.activo!==false && currentEvent.fecha_inicio===oldStart && currentEvent.fecha_fin===oldEnd &&
      currentEvent.dias===base.dias && currentEvent.tipo_novedad.id===base.tipo_id && code(currentEvent).trim()===originalCode &&
      currentEvent.registro_tipo==='ORDINARIA' && base.registro_tipo==='ORDINARIA' && !base.evento_canonico_id && !currentEvent.evento_canonico_id &&
      !!type?.activo && type.permite_rango && !specialImportType(type) && !base.detalle_restringido && !dependency &&
      !!guard && !guard.bloqueado && !guard.novedades_dependientes.includes(base.id) && !otherEvents.length && !hasAttendance &&
      oldStart>=worker.fecha_inicio && (!worker.fecha_fin || oldEnd<=worker.fecha_fin) && current.periodo.estado==='ABIERTO' &&
      !['CERRADO','CERRADA','INACTIVO','RETIRADO'].includes(worker.estado.toUpperCase()) && permissions.includes('nomina.novedades.deactivate');
    const safe=contiguous && complete.every(originalMatchesRange) &&
      !!currentEvent && currentEvent.activo!==false && currentEvent.registro_tipo==='ORDINARIA' && currentEvent.fecha_inicio===oldStart && currentEvent.fecha_fin===oldEnd &&
      currentEvent.dias===base.dias && currentEvent.tipo_novedad.id===base.tipo_id && code(currentEvent).trim()===originalCode &&
      base.registro_tipo==='ORDINARIA' && !base.evento_canonico_id && !currentEvent.evento_canonico_id &&
      !!type?.activo && type.permite_rango && !specialImportType(type) && !base.detalle_restringido && !dependency &&
      !!guard && !guard.bloqueado && !guard.novedades_dependientes.includes(base.id) && !otherEvents.length && !hasBlockingRangeAttendance &&
      start>=worker.fecha_inicio && (!worker.fecha_fin || end<=worker.fecha_fin) && current.periodo.estado==='ABIERTO' &&
      !['CERRADO','CERRADA','INACTIVO','RETIRADO'].includes(worker.estado.toUpperCase()) && permissions.includes('nomina.novedades.update');
    const reason=retireSafe?'Rango completo retirado por baja lógica V1; conserva auditoría':safe?'Rango actualizado por V1; conserva ID y auditoría':
      !fullyRepresented?'RANGO_EXCEDE_PERIODO_NO_REPRESENTABLE':
      allCleared && !permissions.includes('nomina.novedades.deactivate')?'SIN_PERMISO_RETIRAR_NOVEDAD':
      allCleared && (!guard || guard.bloqueado || guard.novedades_dependientes.includes(base.id) || dependency)?'RETIRO_RANGO_CON_DEPENDENCIA_O_PROCESAMIENTO':
      allCleared && (otherEvents.length || hasAttendance)?'RETIRO_RANGO_CON_EVENTO_O_ASISTENCIA_CONCURRENTE':
      allCleared && (base.registro_tipo!=='ORDINARIA' || base.evento_canonico_id || !type?.activo || !type.permite_rango || specialImportType(type))?'RETIRO_RANGO_REQUIERE_FLUJO_V1':
      !permissions.includes('nomina.novedades.update')?'SIN_PERMISO_MODIFICAR_RANGO':
      !contiguous?'MODIFICACION_RANGO_NO_CONTIGUA_O_SIN_DIAS_RESTANTES':
      !currentEvent || currentEvent.fecha_inicio!==oldStart || currentEvent.fecha_fin!==oldEnd || currentEvent.dias!==base.dias?'NOVEDAD_CAMBIO_DESDE_DESCARGA':
      !guard || guard.bloqueado || guard.novedades_dependientes.includes(base.id) || dependency?'RANGO_CON_DEPENDENCIA_O_PROCESAMIENTO':
      otherEvents.length || hasBlockingRangeAttendance?'RANGO_CON_EVENTO_O_ASISTENCIA_CONCURRENTE':
      base.registro_tipo!=='ORDINARIA' || base.evento_canonico_id || !type?.activo || !type.permite_rango || specialImportType(type)?'TIPO_O_ESTADO_REQUIERE_FLUJO_V1':
      'RANGO_NO_EDITABLE_POR_ESTADO_O_VINCULACION';
    for(const c of complete) handledRangeCells.add(`${c.empleado_id}:${c.fecha}`);
    const oldRange={fecha_inicio:oldStart,fecha_fin:oldEnd,dias:Number(base.dias??dates.length)};
    const nextRange=contiguous?{fecha_inicio:start,fecha_fin:end,dias:newDates.length}:undefined;
    const display=(r:{fecha_inicio:string;fecha_fin:string;dias:number})=>`${originalCode} · ${r.fecha_inicio} a ${r.fecha_fin} · ${r.dias} días`;
    const action=retireSafe?'RETIRAR_RANGO':safe?'MODIFICAR_RANGO':'CONFLICTO';
    plan.filas.push({...row(worker,retireSafe?oldStart:start,display(oldRange),nextRange?display(nextRange):retireSafe?'Vacío':'No aplicable',action,reason,(safe||retireSafe)?[base.id]:[],base.tipo_id),
      novedad_id:base.id,rango_anterior:oldRange,...(nextRange?{rango_nuevo:nextRange}:{})});
  }
  for (const cell of cells) {
    if(handledRangeCells.has(`${cell.empleado_id}:${cell.fecha}`) || staleWorkers.has(cell.empleado_id)) continue;
    const w=workers.get(cell.empleado_id)!;
    const all=byWorker.get(w.id) ?? [];
    const events=all.filter(n=>n.fecha_inicio && n.fecha_fin && n.fecha_inicio<=cell.fecha && n.fecha_fin>=cell.fecha);
    const asist=attendance.get(`${w.vinculacion_id}:${cell.fecha}`) ?? [];
    const anterior=[...asist.map(a=>a.estado_dia ?? ''),...events.map(code)].filter(Boolean).join(' + ');
    const add=(action:ImportAction,reason:string,replace:string[]=[],type?:string,equivalent?:string)=>plan.filas.push({...row(w,cell.fecha,anterior,cell.valor,action,reason,replace,type),...(equivalent?{equivalente_id:equivalent}:{})});
    if (cell.valor!==cell.original.trim() && w.solo_lectura) { add('CONFLICTO',`CONSULTA_PROTEGIDA: ${w.solo_lectura}`); continue; }
    const simpleMultiple=events.length>1 && !asist.length && events.every(n=>n.registro_tipo==='ORDINARIA' && !specialImportType(n.tipo_novedad) && !n.requiere_cobertura && !n.cobertura);
    // Daily input styling is a usability affordance only. Signed aggregate
    // markers remain blocked unless the existing per-event logic can safely
    // resolve ordinary independent records.
    if (cell.original.includes('[DET]') && cell.valor!==cell.original.trim() && !simpleMultiple) {
      add('CONFLICTO','DETALLE_NO_REPRESENTABLE_EN_CELDA: resolver con el flujo V1 correspondiente'); continue;
    }
    if (!cell.valor && !cell.original.trim()) { add('CONSERVAR','Celda vacia y original vacio: sin cambios'); plan.celdas_vacias++; continue; }
    if (!cell.valor && cell.original.trim()) {
      plan.celdas_vacias++;
      if (w.solo_lectura) { add('CONFLICTO',`CONSULTA_PROTEGIDA: ${w.solo_lectura}`); continue; }
      // Workbook protection is only a usability control. The signed baseline,
      // current V1 record, context, status, period and permissions authorize it.
      if (!permissions.includes('nomina.novedades.deactivate')) { add('CONFLICTO','SIN_PERMISO_RETIRAR_NOVEDAD'); continue; }
      if (cell.fecha<w.fecha_inicio || (w.fecha_fin && cell.fecha>w.fecha_fin)) { add('CONFLICTO','FUERA_VINCULACION'); continue; }
      if (current.periodo.estado!=='ABIERTO' || w.estado.toUpperCase()!=='PENDIENTE' && ['CERRADO','CERRADA','INACTIVO','RETIRADO'].includes(w.estado.toUpperCase())) { add('CONFLICTO','PERIODO_O_PERSONA_NO_EDITABLE'); continue; }
      const guard=guards.get(w.id)!;
      if (guard.bloqueado) { add('CONFLICTO','PROCESAMIENTO_O_MOVIMIENTOS_ASOCIADOS: resolver mediante flujos V1'); continue; }
      if (asist.length || events.length!==1) { add('CONFLICTO','RETIRO_REQUIERE_UN_EVENTO_UNICO_SIN_ASISTENCIA'); continue; }
      const old=events[0]!;
      if (code(old).trim()!==cell.original.trim()) { add('CONFLICTO','ORIGINAL_NO_COINCIDE_CON_EVENTO_ACTUAL: vuelva a descargar'); continue; }
      if (!safelyRemovable(old,cell.fecha,guard,false)) { add('CONFLICTO','RETIRO_CON_RANGO_SOPORTE_TURNO_COBERTURA_O_DEPENDENCIA: resolver mediante flujo V1'); continue; }
      add('RETIRAR','Retirar un evento ordinario de un día; baja lógica y auditoría V1 conservan historial',[old.id]); continue;
    }
    // The reader trims daily input, but retains the signed original verbatim.
    // Compare text with the same edge-whitespace rule; never rewrite the original,
    // normalize internal spaces/case, or treat a non-text cell as unchanged.
    if (cell.texto && cell.valor===cell.original.trim()) { add('SIN_CAMBIOS','Valor original sin cambios: preserva todos los eventos'); continue; }
    if (w.solo_lectura) { add('CONFLICTO',`CONSULTA_PROTEGIDA: ${w.solo_lectura}`); continue; }
    if (!cell.editable && !simpleMultiple) { add('CONFLICTO','CELDA_PROTEGIDA: detalle multiple/especial, estado o fecha fuera de vinculacion'); continue; }
    if (!cell.texto) { add('CONFLICTO','CODIGO_NO_TEXTO: seleccione un codigo del catalogo'); continue; }
    if (cell.fecha<w.fecha_inicio || (w.fecha_fin && cell.fecha>w.fecha_fin)) { add('CONFLICTO','FUERA_VINCULACION'); continue; }
    if (current.periodo.estado!=='ABIERTO' || w.estado.toUpperCase()!=='PENDIENTE' && ['CERRADO','CERRADA','INACTIVO','RETIRADO'].includes(w.estado.toUpperCase())) { add('CONFLICTO','PERIODO_O_PERSONA_NO_EDITABLE'); continue; }
    const guard=guards.get(w.id)!;
    if (guard.bloqueado) { add('CONFLICTO','PROCESAMIENTO_O_MOVIMIENTOS_ASOCIADOS: resolver mediante flujos V1'); continue; }
    if (['PRESENTE','PENDIENTE'].includes(cell.valor)) {
      if (!permissions.includes('nomina.periodos.update')) { add('CONFLICTO','SIN_PERMISO_ASISTENCIA'); continue; }
      if (cell.valor==='PRESENTE' && cell.original.trim()==='PNR' && events.length===1 && !asist.length) {
        const old=events[0]!,guard=guards.get(w.id)!;
        if (code(old).trim()!=='PNR' || !safelyRemovable(old,cell.fecha,guard,true)) { add('CONFLICTO','PNR_CON_SOPORTE_RANGO_PROCESAMIENTO_O_DEPENDENCIA: resolver mediante flujo V1'); continue; }
        if (!permissions.includes('nomina.novedades.deactivate')) { add('CONFLICTO','SIN_PERMISO_SUSTITUIR_NOVEDAD'); continue; }
        add('SUSTITUIR_ASISTENCIA','Sustituir PNR por asistencia PRESENTE; baja lógica y auditoría V1 dentro de la transacción',[old.id]); continue;
      }
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
  plan.sustituciones=plan.filas.filter(r=>r.accion==='SUSTITUIR' || r.accion==='SUSTITUIR_ASISTENCIA').length;
  plan.modificaciones_rango=plan.filas.filter(r=>r.accion==='MODIFICAR_RANGO').length;
  plan.retiradas=plan.filas.filter(r=>r.accion==='RETIRAR' || r.accion==='RETIRAR_RANGO').length;
  plan.asistencias=plan.filas.filter(r=>r.accion==='ASISTENCIA' || r.accion==='SUSTITUIR_ASISTENCIA').length;
  plan.sin_cambios=plan.filas.filter(r=>r.accion==='SIN_CAMBIOS').length;
  plan.conflictos=plan.filas.filter(r=>r.accion==='CONFLICTO').length;
  const changed=new Set(plan.filas.filter(r=>['CREAR','SUSTITUIR','MODIFICAR_RANGO','RETIRAR','RETIRAR_RANGO','ASISTENCIA','SUSTITUIR_ASISTENCIA'].includes(r.accion)).map(r=>r.empleado_id));
  plan.filas_omitidas=upload.baseline.trabajadores.filter(w=>!changed.has(w.id)).length;
  return plan;
}
