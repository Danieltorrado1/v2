import { useEffect, useMemo, useRef, useState } from 'react';
import { importPlanillaExcel, type PlanillaImportResponse } from '../../services/nominaPlanillaImportApi';
import {ApiClientError} from '../../services/apiClient';
import './PlanillaExcelImport.css';

export default function PlanillaExcelImport({periodId,empresaId,disabled,onApplied}:{periodId:string;empresaId:string;disabled?:boolean;onApplied:()=>void}) {
  const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[result,setResult]=useState<PlanillaImportResponse|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[motivo,setMotivo]=useState(''),[accepted,setAccepted]=useState(false);
  const [filter,setFilter]=useState('CAMBIOS'),[town,setTown]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [failureReport,setFailureReport]=useState<unknown>(null);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setOpen(false);setFile(null);setResult(null);setAccepted(false);setError('');setFailureReport(null);setMotivo('');setBusy(false);return()=>{generation.current++;};},[periodId,empresaId]);
  const plan=result?.plan;
  const towns=useMemo(()=>[...new Set(plan?.filas.map(r=>r.municipio) ?? [])].sort(),[plan]);
  const filtered=useMemo(()=>plan?.filas.filter(r=>(!town || r.municipio===town) && (!search || `${r.trabajadora} ${r.documento} ${r.fecha} ${r.nuevo} ${r.anterior}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) &&
    (filter==='TODAS' || filter==='CAMBIOS' && ['CREAR','SUSTITUIR','MODIFICAR_RANGO','RETIRAR','ASISTENCIA','SUSTITUIR_ASISTENCIA','CONFLICTO'].includes(r.accion) || filter===r.accion)) ?? [],[plan,town,search,filter]);
  useEffect(()=>setPage(1),[filter,town,search,result]);
  const send=async(confirm:boolean)=>{
    if (!file || busy || disabled || confirm && (!result?.token || !accepted || motivo.trim().length<10)) return;
    const version=generation.current;setBusy(true);setError('');setFailureReport(null);
    try {
      const response=await importPlanillaExcel(periodId,empresaId,file,confirm ? {token:result!.token!,motivo:motivo.trim()} : undefined);
      if (version!==generation.current) return;
      setResult(response);setAccepted(false);
      if (response.estado!=='VISTA_PREVIA') onApplied();
    } catch(e) {
      if (version!==generation.current) return;
      setError(`${e instanceof Error ? e.message : 'No fue posible procesar el archivo.'}${confirm ? ' Vuelva a validar el mismo archivo para consultar si se aplicó antes de reintentar.' : ''}`);
      setFailureReport(e instanceof ApiClientError ? e.details : null);
      setResult(null);setAccepted(false);
    } finally {if (version===generation.current) setBusy(false);}
  };
  return <>
    <button type="button" disabled={disabled || !periodId || !empresaId || busy} onClick={()=>setOpen(true)}>IMPORTAR EXCEL OPERATIVO</button>
    {open ? <div className="planilla-import-backdrop"><section className="planilla-import-dialog" role="dialog" aria-modal="true" aria-labelledby="planilla-import-title" aria-busy={busy}>
      <header><h2 id="planilla-import-title">Importar Excel Operativo</h2><button type="button" disabled={busy} onClick={()=>setOpen(false)} aria-label="Cerrar importación">Cerrar</button></header>
      <p>Seleccione la plantilla descargada para este período. La validación y la vista previa no modifican registros ni sincronizan personal.</p>
      <label>Archivo XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e=>{setFile(e.target.files?.[0] ?? null);setResult(null);setAccepted(false);setError('');setFailureReport(null);}} /></label>
      <button type="button" disabled={disabled || !file || busy || (file?.size ?? 0)>12*1024*1024} onClick={()=>void send(false)}>{busy ? 'PROCESANDO…' : 'VALIDAR Y VER VISTA PREVIA'}</button>
      {disabled ? <p role="alert">La planilla no está disponible para importar en este momento. Revise su estado y guarde los cambios pendientes antes de continuar.</p> : null}
      {file && file.size>12*1024*1024 ? <p role="alert">El archivo supera 12 MiB.</p> : null}
      {error ? <p className="planilla-import-error" role="alert">{error}</p> : null}
      {failureReport ? <details><summary>Reporte de la operación rechazada o pendiente de verificación</summary><pre>{JSON.stringify(failureReport,null,2)}</pre></details> : null}
      {plan ? <>
        <div className="planilla-import-summary" aria-live="polite"><span>Analizados: {plan.registros_analizados}</span><span>Nuevas: {plan.nuevas}</span><span>Sustituciones: {plan.sustituciones}</span><span>Rangos modificados: {plan.modificaciones_rango}</span><span>Retiradas: {plan.retiradas}</span><span>Asistencias: {plan.asistencias}</span><span>Sin cambios: {plan.sin_cambios}</span><span>Filas sin operaciones: {plan.filas_omitidas}</span><span>Celdas vacías en Excel: {plan.celdas_vacias}</span><strong>Conflictos: {plan.conflictos}</strong></div>
        <p>Un valor igual al original no cambia nada. Vaciar un original propone retirarlo solo si es un único evento seguro; vacíos originalmente vacíos se conservan. Las operaciones usan historial V1 y la confirmación aplica el archivo completo o revierte el lote.</p>
        <div className="planilla-import-filters"><label>Municipio<select value={town} onChange={e=>setTown(e.target.value)}><option value="">Todos los autorizados</option>{towns.map(t=><option key={t}>{t}</option>)}</select></label>
          <label>Operación<select value={filter} onChange={e=>setFilter(e.target.value)}>{['CAMBIOS','TODAS','CREAR','SUSTITUIR','MODIFICAR_RANGO','RETIRAR','ASISTENCIA','SUSTITUIR_ASISTENCIA','CONFLICTO','SIN_CAMBIOS','CONSERVAR'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>Trabajadora, fecha o código<input value={search} onChange={e=>setSearch(e.target.value)} /></label></div>
        <div className="planilla-import-table"><table><thead><tr>{['Municipio','Trabajadora / cédula','Fecha','Actual EMPIRIA','Excel','Operación','Motivo / eventos anteriores'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
          {filtered.slice((page-1)*50,page*50).map((r,i)=><tr key={`${r.empleado_id}-${r.novedad_id ?? r.fecha}-${i}`} className={r.accion==='CONFLICTO' ? 'planilla-import-conflict' : ''}><td>{r.municipio}</td><td>{r.trabajadora}<br/>{r.documento}</td><td>{r.novedad_id ? `Novedad ${r.novedad_id}` : r.fecha}{r.rango_anterior ? <><br/>Anterior: {r.rango_anterior.fecha_inicio}–{r.rango_anterior.fecha_fin} ({r.rango_anterior.dias} días)</> : null}</td><td>{r.anterior || 'Vacío'}</td><td>{r.nuevo || 'Conservar'}{r.rango_nuevo ? <><br/>Nuevo: {r.rango_nuevo.fecha_inicio}–{r.rango_nuevo.fecha_fin} ({r.rango_nuevo.dias} días)</> : null}</td><td>{r.accion}</td><td>{r.motivo}{r.sustituir_ids.length ? ` · IDs: ${r.sustituir_ids.join(', ')}` : ''}</td></tr>)}
        </tbody></table></div>
        <nav aria-label="Páginas de vista previa"><button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page} de {Math.max(1,Math.ceil(filtered.length/50))} · {filtered.length} resultados</span><button type="button" disabled={page*50>=filtered.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></nav>
        {result?.token ? <div className="planilla-import-confirm"><label>Motivo de la importación<textarea value={motivo} minLength={10} maxLength={1000} disabled={busy} onChange={e=>setMotivo(e.target.value)} /></label>
          <label><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)} />Revisé las diferencias y confirmo expresamente el archivo completo. Si existe algún conflicto, no se aplicará ninguna operación.</label>
          <button type="button" disabled={disabled || busy || !accepted || motivo.trim().length<10} onClick={()=>void send(true)}>CONFIRMAR IMPORTACIÓN</button><small>La vista previa vence en 15 minutos. Los permisos y registros se vuelven a validar al confirmar.</small></div> : <p>No hay operaciones confirmables o existen conflictos. Corrija el archivo o resuelva los conflictos mediante los flujos V1 y vuelva a descargar.</p>}
      </> : null}
      {result?.resultado ? <div role="status"><h3>{result.estado==='YA_APLICADO' ? 'Archivo ya aplicado; no se duplicaron registros' : 'Importación aplicada'}</h3><p>Recibo {result.resultado.id} · {result.resultado.aplicadas.length} operaciones · {result.resultado.omitidas} filas omitidas · {result.resultado.rechazadas} rechazadas.</p>
        <details><summary>Reporte detallado de operaciones</summary><pre>{JSON.stringify(result.resultado,null,2)}</pre></details>
        <button type="button" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result.resultado,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`importacion-${result.resultado!.id}.json`;link.click();URL.revokeObjectURL(url);}}>Descargar reporte JSON</button></div> : null}
    </section></div> : null}
  </>;
}
