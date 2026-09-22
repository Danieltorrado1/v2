import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import type { ApiResponse } from '../../types/api.types';
import { getRepositorioDownloadUrl } from '../../services/repositorioApi';
import { repositoryOptionalLabel } from './personalRepositoryModel';
import type { MatrixItem, RepositoryRow } from './personalRepositoryModel';

import './PersonalDocumentReview.css';

type ManipulationMode = 'COMBINADO' | 'SEPARADO';
type Policy = {kind:string;emission:boolean;expiration:boolean;months:number|null;days:number|null};
type Evidence = {id:string;tipo_documento_id:number;nombre:string;version:number;actual:boolean;estado:string;estado_revision:string;fecha_expedicion:string|null;fecha_vencimiento:string|null;metadata:{manipulacion_modalidad?:ManipulationMode;componentes?:string[];sisben?:string;experiencia_inicio?:string;experiencia_fin?:string};cargado_por:string|null;fecha_carga:string;revisado_por:string|null;revisado_en:string|null;motivo_rechazo:string|null;documento_reemplaza_id:string|null};
type Dossier = {manipulacion_modalidad:ManipulationMode|null;types:{id:number;nombre:string;code:string;component:string|null;policy:Policy}[];documents:Evidence[];history:{entidad_id:string;accion:string;descripcion:string;fecha_evento:string;usuario_id:string}[];experiencia_dias:number};
export const reviewLabel=(state:string) => ({SIN_DOCUMENTO:'Sin documento',PENDIENTE_REVISION:'Pendiente de revisión',APROBADO:'\u2713 Aprobado',RECHAZADO:'Rechazado',POR_VENCER:'Por vencer',VENCIDO:'Vencido',NO_APLICA:'No aplica',COMPLETO:'Completo',PARCIAL:'Parcial',PENDIENTE:'Pendiente'}[state]??state);
const friendlyReviewError=(error:unknown) => {
 const message=error instanceof Error?error.message:'';
 return /\/api\/|https?:|route\s+(get|post|put|patch|delete)|not found|\b[45]\d\d\b|fetch|network/i.test(message)
   ? 'No fue posible cargar la información. Intenta nuevamente.'
   : message || 'No fue posible cargar la información. Intenta nuevamente.';
};
export default function PersonalDocumentReview({row,item,permissions,onChanged,onBusy}:{row:RepositoryRow;item:MatrixItem;permissions:string[];onChanged:()=>void;onBusy:(busy:boolean)=>void}){
 const [data,setData]=useState<Dossier|null>(null);const [type,setType]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [refresh,setRefresh]=useState(0);
 const [file,setFile]=useState<File|null>(null);const [emission,setEmission]=useState('');const [expiration,setExpiration]=useState('');const [start,setStart]=useState('');const [end,setEnd]=useState('');const [sisben,setSisben]=useState('');const [reason,setReason]=useState<Record<string,string>>({});
 const scope=item.ambito_documental==='PERSONA'?'persona':'vinculacion';const owner=scope==='persona'?row.worker.persona_id:row.worker.vinculacion_id;
 const ids=[...new Set([...(item.tipo_documento_ids??[]),...(item.requisitos??[]).flatMap(r=>r.tipo_documento_ids??(r.tipo_documento_id?[r.tipo_documento_id]:[]))])].join(',');
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');if(ids)void apiClient.get<ApiResponse<Dossier>>(`/documentos/revision/${scope}/${owner}`,{params:{tipos:ids},signal:controller.signal}).then(r=>{if(!controller.signal.aborted){setData(r.data);setType(previous=>r.data.types.some(t=>String(t.id)===previous)?previous:String(r.data.documents.find(d=>d.actual)?.tipo_documento_id??r.data.types[0]?.id??''));}}).catch(e=>{if(!controller.signal.aborted)setError(friendlyReviewError(e));});return()=>controller.abort();},[scope,owner,ids,refresh]);
 useEffect(()=>{setEmission('');setExpiration('');setStart('');setEnd('');setSisben('');setFile(null);},[type]);
 const inputRef=useRef<HTMLInputElement>(null);
 const [activeId,setActiveId]=useState('');const [preview,setPreview]=useState('');const [previewFailed,setPreviewFailed]=useState(false);const [noExpiry,setNoExpiry]=useState(false);
 const manipulation=item.canonical_code==='MANIPULACION';
 const mode=data?.manipulacion_modalidad;
 const [changingMode,setChangingMode]=useState(false);const [pendingMode,setPendingMode]=useState<ManipulationMode|null>(null);const [reuseDocumentId,setReuseDocumentId]=useState('');
 useEffect(()=>setChangingMode(false),[scope,owner,ids]);
 const needsMode=manipulation&&(!mode||changingMode);
 const selected=data?.types.find(t=>String(t.id)===type);const policy=manipulation&&mode==='COMBINADO'&&data ? {...selected?.policy,kind:'EXISTENTE',emission:data.types.some(t=>t.policy.emission),expiration:data.types.some(t=>t.policy.expiration),days:Math.min(...data.types.map(t=>t.policy.days??Infinity))===Infinity?null:Math.min(...data.types.map(t=>t.policy.days??Infinity))} : selected?.policy;
 async function action(work:()=>Promise<unknown>){setBusy(true);onBusy(true);setError('');try{await work();setRefresh(v=>v+1);onChanged();}catch(e){setError(friendlyReviewError(e));}finally{setBusy(false);onBusy(false);}}
 async function upload(event:React.FormEvent){event.preventDefault();if(!file||!selected)return;await action(async()=>{const form=new FormData();form.append('file',file);form.append('tipo_documento_id',type);if(manipulation&&mode)form.append('manipulacion_modalidad',mode);if(policy?.emission)form.append('fecha_expedicion',emission);if(policy?.expiration&&expiration)form.append('fecha_vencimiento',expiration);if(policy?.kind==='SISBEN')form.append('sisben',sisben);if(policy?.kind==='EXPERIENCIA'){if(start)form.append('experiencia_inicio',start);if(end)form.append('experiencia_fin',end);}await apiClient.post(`/documentos/${scope}/${owner}/upload`,form);setFile(null);});}
 async function download(id:string){setError('');try{const result=await getRepositorioDownloadUrl(scope,Number(id));window.open(result.signed_url,'_blank','noopener,noreferrer');}catch(e){setError(friendlyReviewError(e));}}
 const activeDocuments=data?.documents.filter(d=>d.actual)??[];
 async function applyMode(next:ManipulationMode, reuseId?:string){
  const hasDocuments=activeDocuments.length>0;
  if(hasDocuments&&!window.confirm(next==='COMBINADO'?'El archivo seleccionado se usará como soporte combinado para Curso + Exámenes y conservará su estado de revisión.':'El soporte combinado se conservará en el historial; deberás cargar Curso y Exámenes por separado. ¿Continuar?'))return;
  await action(async()=>{await apiClient.post(`/documentos/manipulacion/${scope}/${owner}/modalidad`,{modalidad:next,confirmado:hasDocuments,reutilizar_documento_id:reuseId||null});setChangingMode(false);setPendingMode(null);setReuseDocumentId('');setFile(null);});
 }
 async function chooseMode(next:ManipulationMode){
  if(next===mode){setChangingMode(false);return;}
  if(next==='COMBINADO'&&activeDocuments.length>1){setPendingMode(next);setReuseDocumentId('');return;}
  await applyMode(next,activeDocuments.length===1?String(activeDocuments[0]!.id):undefined);
 }
 const documents=data?.documents.filter(d=>manipulation ? (mode==='COMBINADO' ? (d.metadata?.manipulacion_modalidad==='COMBINADO' || !data.types.find(t=>t.id===d.tipo_documento_id)?.component) : data.types.find(t=>t.id===d.tipo_documento_id)?.component===selected?.component&&d.metadata?.manipulacion_modalidad!=='COMBINADO') : String(d.tipo_documento_id)===type)??[];
 const current=documents.filter(d=>d.actual);
 const doc=current.find(d=>d.id===activeId)??current[0];
 const historical=manipulation ? data?.documents.filter(d=>!d.actual&&(mode==='COMBINADO'||d.metadata?.manipulacion_modalidad==='COMBINADO'||data?.types.find(t=>t.id===d.tipo_documento_id)?.component===selected?.component))??[] : documents.filter(d=>!d.actual);
 const canUpload=permissions.includes('documentos.upload');
 const canDownload=permissions.includes('documentos.download');
 const isCollection=selected?.code==='CERT_LABORAL';
 const date=(value:string|null|undefined)=>value?new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('es-CO'):'No registrada';
 useEffect(()=>{setNoExpiry(false);setActiveId('');},[type]);
 useEffect(()=>{
  let cancelled=false;let objectUrl='';const controller=new AbortController();setPreview('');setPreviewFailed(false);
  if(doc&&canDownload)void getRepositorioDownloadUrl(scope,Number(doc.id)).then(async result=>{const response=await fetch(result.signed_url,{signal:controller.signal});if(!response.ok)throw new Error('preview');const blob=await response.blob();if(/\.pdf$/i.test(doc.nombre)&&!(await blob.slice(0,5).text()).startsWith('%PDF-'))throw new Error('preview');if(cancelled)return;objectUrl=URL.createObjectURL(blob);setPreview(objectUrl);}).catch(()=>{if(!cancelled)setPreviewFailed(true);});
  return()=>{cancelled=true;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[doc?.id,scope,canDownload,refresh]);
 function chooseFile(next:File|null){
  if(next&&manipulation&&mode==='COMBINADO'&&!/\.pdf$/i.test(next.name)){setFile(null);setError('Selecciona un único PDF con Curso + Exámenes.');return;}
  if(next&&!/\.(pdf|jpe?g|png)$/i.test(next.name)){setFile(null);setError('Selecciona un archivo PDF, JPG, JPEG o PNG.');return;}
  setError('');setFile(next);
 }
 const badge=(e:Evidence)=><span data-document-state={e.estado} className={`pdr-state pdr-${e.estado.toLowerCase()}`}>{reviewLabel(e.estado)}</span>;
 const fileButton=<button type="button" className="op-button primary" disabled={busy} onClick={()=>inputRef.current?.click()}>Seleccionar archivo</button>;
 return <div className="personal-document-review pdr" data-requirement={item.canonical_code} aria-busy={busy}>
  <header className="pdr-header"><div><small>DOCUMENTACIÓN DEL TRABAJADOR</small>{repositoryOptionalLabel(item)&&<small>{repositoryOptionalLabel(item)}</small>}<h3>{manipulation?'Manipulación de alimentos':item.nombre_requisito}</h3>{manipulation&&mode==='COMBINADO'&&<p>Curso + Exámenes</p>}</div>{doc?<div>{badge(doc)}<small>v{doc.version} · Carga {date(doc.fecha_carga)}{doc.revisado_en&&` · Revisión ${date(doc.revisado_en)}`}</small></div>:<span className="pdr-state" data-document-state="SIN_DOCUMENTO">Sin documento</span>}</header>
  {error&&<p role="alert" className="repo-request-notice">{error}</p>}
  {!ids&&<p>Este requisito no tiene un tipo documental configurado.</p>}
  {!data&&ids&&!error&&<p role="status">Cargando documentos y revisiones…</p>}
  {data&&<>
   {manipulation&&<section className="pdr-modality">{needsMode?<><h4>¿Cómo viene el soporte de manipulación de alimentos?</h4><div className="pdr-components"><button type="button" disabled={busy||!canUpload} onClick={()=>void chooseMode('COMBINADO')}><strong>Un solo PDF</strong><small>Curso y exámenes vienen en el mismo archivo.</small></button><button type="button" disabled={busy||!canUpload} onClick={()=>void chooseMode('SEPARADO')}><strong>Dos archivos</strong><small>Curso y exámenes vienen por separado.</small></button></div>{pendingMode==='COMBINADO'&&<div className="pdr-mode-confirm"><label>Soporte que se conservará como combinado<select value={reuseDocumentId} onChange={e=>setReuseDocumentId(e.target.value)}><option value="">Seleccionar archivo</option>{activeDocuments.map(d=><option key={d.id} value={d.id}>{d.nombre} · v{d.version} · {reviewLabel(d.estado)}</option>)}</select></label><button type="button" className="op-button primary" disabled={!reuseDocumentId||busy} onClick={()=>void applyMode('COMBINADO',reuseDocumentId)}>Usar este PDF como Curso + Exámenes</button></div>}{changingMode&&<button type="button" className="op-button secondary" onClick={()=>{setChangingMode(false);setPendingMode(null)}}>Cancelar</button>}</>:<div><span>{mode==='COMBINADO'?'Modalidad actual: Un solo PDF · Soporte combinado: Curso + Exámenes':'Modalidad actual: Dos PDFs separados · Curso y Exámenes'}</span>{canUpload&&<button type="button" className="op-button secondary" disabled={busy} onClick={()=>setChangingMode(true)}>Cambiar modalidad</button>}</div>}</section>}
   {!needsMode&&<>
   {!manipulation&&data.types.length>1&&<label className="pdr-type">{item.canonical_code==='MANIPULACION'?'Componente': 'Subtipo documental'}<select disabled={busy} value={type} onChange={e=>setType(e.target.value)}>{data.types.map(t=><option key={t.id} value={t.id}>{t.component==='CURSO'?'Curso':t.component==='EXAMENES'?'Exámenes':t.nombre}</option>)}</select></label>}
   {manipulation&&mode==='SEPARADO'&&<div className="pdr-components">{data.types.filter((t,index,all)=>all.findIndex(other=>other.component===t.component)===index).map(t=><button type="button" disabled={busy} aria-pressed={selected?.component===t.component} key={t.id} onClick={()=>setType(String(t.id))}>{t.component==='CURSO'?'Curso':t.component?.startsWith('EXAM')?'Exámenes':t.nombre}<small>{reviewLabel(data.documents.find(d=>d.actual&&data.types.find(type=>type.id===d.tipo_documento_id)?.component===t.component)?.estado??'SIN_DOCUMENTO')}</small></button>)}</div>}
   {isCollection&&<section className="pdr-collection"><h4>Certificaciones laborales</h4><p>Experiencia acumulada: {data.experiencia_dias} días (sin duplicar períodos superpuestos).</p>{current.map(e=><button type="button" key={e.id} aria-pressed={doc?.id===e.id} onClick={()=>setActiveId(e.id)}><strong>{e.nombre}</strong><small>{date(e.metadata?.experiencia_inicio)} · {date(e.metadata?.experiencia_fin)}{e.metadata?.experiencia_inicio&&e.metadata?.experiencia_fin&&` · ${Math.round((Date.parse(e.metadata.experiencia_fin)-Date.parse(e.metadata.experiencia_inicio))/86400000)+1} días`}</small>{badge(e)}</button>)}</section>}
   <div className="pdr-workspace">
    <section className="pdr-preview-card" aria-label="Vista previa del documento"><div className="pdr-card-heading"><h4>Vista previa</h4><span>{doc?`Versión ${doc.version}`:'PDF / JPG / JPEG / PNG'}</span></div>
     {!doc?<div className="pdr-empty" onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();if(canUpload&&!busy)chooseFile(e.dataTransfer.files[0]??null);}}><div className="pdr-file-icon" aria-hidden="true">↑</div><h4>Sin documento cargado</h4><p>{file?file.name:'Arrastra archivo aquí'}</p>{canUpload?fileButton:<p>No tienes permiso para cargar documentos.</p>}<small>Formatos: PDF / JPG / JPEG / PNG</small></div>:
      <div className="pdr-preview">{!canDownload?<p>No tienes permiso para visualizar este archivo.</p>:previewFailed||!(/\.(pdf|jpe?g|png)$/i.test(doc.nombre))?<div className="pdr-fallback"><p>No fue posible mostrar la vista previa.</p><button className="op-button secondary" onClick={()=>void download(doc.id)}>Descargar archivo</button></div>:!preview?<p role="status">Cargando vista previa…</p>:/\.pdf$/i.test(doc.nombre)?<object data={preview} type="application/pdf" aria-label={`Vista previa PDF: ${doc.nombre}`} onError={()=>setPreviewFailed(true)}><div className="pdr-fallback"><p>No fue posible mostrar la vista previa.</p><button className="op-button secondary" onClick={()=>void download(doc.id)}>Descargar archivo</button></div></object>:<img src={preview} alt={`Vista previa: ${doc.nombre}`} onError={()=>setPreviewFailed(true)}/>}</div>}
    </section>
    <div className="pdr-sidebar">
     <section className="pdr-card"><h4>Archivo</h4>{doc?<><strong className="pdr-filename">{doc.nombre}</strong><p>v{doc.version} · {date(doc.fecha_carga)}</p><p>Cargado por {doc.cargado_por??'No registrado'}</p><div className="pdr-buttons">{canDownload&&<button type="button" className="op-button secondary" onClick={()=>void download(doc.id)}>Descargar</button>}{canUpload&&<button type="button" className="op-button secondary" disabled={busy} onClick={()=>inputRef.current?.click()}>{isCollection?'Agregar certificación':'Reemplazar archivo'}</button>}</div></>:<p>Agrega el soporte para iniciar su revisión.</p>}</section>
     {canUpload&&selected&&<form className="pdr-card repo-upload" onSubmit={event=>void upload(event)}><fieldset disabled={busy}><legend>{isCollection?'Añadir certificación':doc?'Reemplazar documento':'Subir documento'}</legend>
      {(policy?.emission||policy?.expiration||['SISBEN','EXPERIENCIA'].includes(policy?.kind??''))&&<h4>Metadatos del documento</h4>}
      {policy?.emission&&<label>{policy.kind==='RESIDENCIA'?'Fecha inicio':'Fecha de emisión'}<input required type="date" value={emission} onChange={e=>setEmission(e.target.value)}/></label>}
      {policy?.kind==='ANTECEDENTE'&&<p>Vencimiento automático: fecha de emisión + 4 meses.</p>}
      {policy?.expiration&&<label>Fecha de vencimiento<input disabled={noExpiry} required={policy.kind!=='RESIDENCIA'&&!policy.days} type="date" value={expiration} onChange={e=>setExpiration(e.target.value)}/></label>}
      {policy?.kind==='RESIDENCIA'&&<><label className="pdr-check"><input type="checkbox" checked={noExpiry} onChange={e=>{setNoExpiry(e.target.checked);if(e.target.checked)setExpiration('');}}/>Sin vencimiento explícito</label><p>Sin una fecha indicada, se calcula fecha inicio + 6 meses.</p></>}
      {policy?.kind==='SISBEN'&&<label>Categoría/subgrupo SISBEN<input required maxLength={80} value={sisben} onChange={e=>setSisben(e.target.value)}/></label>}
      {policy?.kind==='EXPERIENCIA'&&<><label>Fecha inicio<input type="date" required={!!end} value={start} onChange={e=>setStart(e.target.value)}/></label><label>Fecha fin<input type="date" min={start||undefined} required={!!start} value={end} onChange={e=>setEnd(e.target.value)}/></label><p>Estas fechas registran experiencia; no determinan vencimiento.</p></>}
      <label>Archivo<input ref={inputRef} key={`${type}:${refresh}`} type="file" accept={manipulation&&mode==='COMBINADO'?'.pdf':'.pdf,.jpg,.jpeg,.png'} onChange={e=>chooseFile(e.target.files?.[0]??null)}/></label>{file&&<p role="status">Seleccionado: {file.name}</p>}
      <p>{doc&&!isCollection?'La versión anterior se conserva en el historial. ':''}El nuevo archivo quedará pendiente de revisión.</p><button type="submit" className="op-button primary" disabled={busy||!file}>Guardar archivo</button>
     </fieldset></form>}
     {doc&&<section className="pdr-card" data-document-id={doc.id} data-current="true" data-version={doc.version}><h4>Revisión del documento</h4>{badge(doc)}<dl>{policy?.kind!=='SISBEN'&&doc.fecha_expedicion&&<><dt>{policy?.kind==='RESIDENCIA'?'Inicio':'Emisión'}</dt><dd>{date(doc.fecha_expedicion)}</dd></>}{policy?.kind!=='SISBEN'&&doc.fecha_vencimiento&&<><dt>Vencimiento</dt><dd>{date(doc.fecha_vencimiento)}</dd></>}{doc.metadata?.sisben&&<><dt>SISBEN</dt><dd>{doc.metadata.sisben}</dd></>}<dt>Revisado por</dt><dd>{doc.revisado_por??'Pendiente'}</dd><dt>Fecha de revisión</dt><dd>{date(doc.revisado_en)}</dd></dl>{doc.motivo_rechazo&&<p className="pdr-rejection">Motivo: {doc.motivo_rechazo}</p>}
      {permissions.includes('documentos.update')&&<fieldset disabled={busy} className="pdr-review-actions"><legend>Decisión de revisión</legend><label>Motivo de rechazo (obligatorio)<textarea aria-label={`Motivo de rechazo ${doc.id}`} value={reason[doc.id]??''} onChange={e=>setReason({...reason,[doc.id]:e.target.value})}/></label><div className="pdr-buttons"><button type="button" className="op-button primary" onClick={()=>void action(()=>apiClient.post(`/documentos/revision/${scope}/${doc.id}`,{estado:'APROBADO'}))}>Aprobar</button><button type="button" className="op-button secondary" disabled={!reason[doc.id]?.trim()} onClick={()=>void action(()=>apiClient.post(`/documentos/revision/${scope}/${doc.id}`,{estado:'RECHAZADO',motivo:reason[doc.id]}))}>Rechazar</button></div></fieldset>}
     </section>}
     <section className="pdr-card pdr-history"><h4>Historial / versiones</h4>{!historical.length&&<p>No hay versiones anteriores.</p>}{historical.map(e=><article key={e.id} data-current="false" data-version={e.version}><strong>v{e.version} · {e.nombre}</strong>{manipulation&&<p>{e.metadata?.manipulacion_modalidad==='COMBINADO'?'Soporte combinado: Curso + Exámenes':data.types.find(t=>t.id===e.tipo_documento_id)?.component==='CURSO'?'Curso':'Exámenes'}</p>}{badge(e)}<p>{date(e.fecha_carga)} · Cargado por {e.cargado_por??'No registrado'}</p>{e.revisado_en&&<p>Revisado por {e.revisado_por??'No registrado'} · {date(e.revisado_en)}</p>}{e.motivo_rechazo&&<p>Motivo: {e.motivo_rechazo}</p>}{canDownload&&<button type="button" className="op-button secondary" onClick={()=>void download(e.id)}>Descargar v{e.version}</button>}</article>)}{!!data.history.filter(h=>documents.some(d=>d.id===String(h.entidad_id))).length&&<details><summary>Actividad de carga y revisión</summary>{data.history.filter(h=>documents.some(d=>d.id===String(h.entidad_id))).map((h,index)=><p key={index}>{date(h.fecha_evento)} · {h.descripcion}</p>)}</details>}</section>
    </div>
   </div>
   </>}
  </>}
 </div>;
}
