import {useEffect,useRef,useState} from 'react';
import {apiClient} from '../../services/apiClient';
import type {ApiResponse} from '../../types/api.types';
import type {PlanillaCambio} from './planillaOperativa.domain';
import type {ContextoCambio,OpcionCambio} from './cambioOperativo.domain';

interface Preview {
  revision:string;anterior:{id:string;modalidad:string;desde:string;hasta:string|null};
  nuevo:OpcionCambio;fecha_efectiva:string;cierre_anterior:string|null;
  nueva_vigencia:{desde:string;hasta:string|null};categoria_actual_id:string|null;
  categoria_propuesta:{id:string;nombre_categoria:string}|null;estado_salarial:string;
  periodos_abiertos:Array<{id:string}>;requiere_recalculo:boolean;sin_cambio:boolean;
  historial:Array<{id:string;modalidad:string;desde:string;hasta:string|null}>;
}
type Props={periodoId:string;empleadoId:string;vinculacionId:string;fecha:string;canSave:boolean;
  onSaved:(change:PlanillaCambio)=>void;onCancel:()=>void;onFechaChange?:(fecha:string)=>void;
  onSavingChange?:(saving:boolean)=>void;sourceInstitutionId?:string;sourceSedeId?:string};

export default function CambioModalidadFields(props:Props) {
  const [fecha,setFecha]=useState(props.fecha);
  const [options,setOptions]=useState<OpcionCambio[]>([]);
  const [base,setBase]=useState<ContextoCambio|null>(null);
  const [modalidad,setModalidad]=useState('');
  const [motivo,setMotivo]=useState('');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [confirmed,setConfirmed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const busy=useRef(false);
  useEffect(()=>{
    let live=true;setLoading(true);setBase(null);setPreview(null);setConfirmed(false);setError('');
    Promise.all([
      apiClient.get<ApiResponse<OpcionCambio[]>>(`/nomina/periodos/${props.periodoId}/vinculaciones/${props.vinculacionId}/modalidad-opciones`),
      apiClient.get<ApiResponse<{contexto:ContextoCambio}>>(`/nomina/periodos/${props.periodoId}/vinculaciones/${props.vinculacionId}/modalidad-contexto/${fecha}`),
    ]).then(([catalog,current])=>{if(!live)return;
      if((props.sourceInstitutionId && current.data.contexto.institucion_id!==props.sourceInstitutionId)
        || (props.sourceSedeId && current.data.contexto.sede_id!==props.sourceSedeId))
        throw new Error('El trabajador no pertenece a la institución y sede seleccionadas en esta fecha.');
      setOptions(catalog.data);setBase(current.data.contexto);setModalidad(String(current.data.contexto.modalidad_id??''));})
      .catch(err=>live&&setError(err instanceof Error?err.message:'No fue posible cargar el contexto.'))
      .finally(()=>live&&setLoading(false));
    return()=>{live=false;};
  },[props.periodoId,props.vinculacionId,fecha,props.sourceInstitutionId,props.sourceSedeId,attempt]);
  const target=options.find(row=>row.institucion_id===base?.institucion_id && row.sede_id===base?.sede_id && row.modalidad_id===modalidad);
  useEffect(()=>{
    let live=true;setPreview(null);setConfirmed(false);
    if(!target)return;
    setLoading(true);setError('');
    apiClient.get<ApiResponse<Preview>>('/nomina/cambios-operativos/preview-modalidad',{params:{
      periodo_id:props.periodoId,nomina_empleado_id:props.empleadoId,vinculacion_id:props.vinculacionId,
      fecha_inicio_efectiva:fecha,institucion_id:target.institucion_id,sede_id:target.sede_id,modalidad_id:target.modalidad_id,
    }}).then(result=>live&&setPreview(result.data)).catch(err=>live&&setError(err instanceof Error?err.message:'Vista previa no disponible.'))
      .finally(()=>live&&setLoading(false));
    return()=>{live=false;};
  },[target,props.periodoId,props.empleadoId,props.vinculacionId,fecha]);
  const save=async()=>{
    if(busy.current || !preview || !confirmed || preview.sin_cambio || !props.canSave || motivo.trim().length<3)return;
    busy.current=true;setSaving(true);props.onSavingChange?.(true);setError('');
    try {
      const result=await apiClient.post<ApiResponse<PlanillaCambio>>('/nomina/cambios-operativos',{
        periodo_id:props.periodoId,nomina_empleado_id:props.empleadoId,vinculacion_id:props.vinculacionId,
        tipo:'CAMBIO_DE_MODALIDAD',fecha_inicio_efectiva:fecha,regla_fecha_efectiva:'MISMO_DIA',
        contexto_anterior:base,contexto_nuevo:target,motivo:motivo.trim(),preview_revision:preview.revision,
      });
      props.onSaved(result.data);
    } catch(err) {setError(err instanceof Error?err.message:'No fue posible guardar.');setConfirmed(false);}
    finally {busy.current=false;setSaving(false);props.onSavingChange?.(false);}
  };
  return <>
    <p>Municipio: {base?.municipio} · Institución: {base?.institucion} · Sede: {base?.sede}</p>
    <label>Fecha efectiva<input type="date" value={fecha} disabled={saving} onChange={e=>{
      setPreview(null);setConfirmed(false);if(props.onFechaChange)props.onFechaChange(e.target.value);else setFecha(e.target.value);
    }}/></label>
    <label>Modalidad nueva<select value={modalidad} disabled={saving||!base||!props.canSave} onChange={e=>{setPreview(null);setConfirmed(false);setModalidad(e.target.value);}}>
      <option value="">Seleccionar modalidad del contrato</option>{options.filter(row=>row.institucion_id===base?.institucion_id&&row.sede_id===base?.sede_id).map(row=><option key={row.modalidad_id} value={row.modalidad_id??''}>{row.modalidad}</option>)}
    </select></label>
    <label>Motivo<textarea value={motivo} disabled={saving} onChange={e=>setMotivo(e.target.value)}/></label>
    {loading&&<p role="status">Consultando vista previa…</p>}{error&&<p role="alert">{error} <button type="button" disabled={saving} onClick={()=>setAttempt(value=>value+1)}>Actualizar vista previa</button></p>}
    {preview&&<section aria-label="Vista previa de vigencia">
      <p>Antes: {preview.anterior.modalidad} · Vigencia: {preview.anterior.desde} a {preview.anterior.hasta??'sin fin'}</p>
      <p>Después: {preview.nuevo.modalidad} · Desde {preview.nueva_vigencia.desde} hasta {preview.nueva_vigencia.hasta??'sin fin'}</p>
      <p>Cierre anterior: {preview.cierre_anterior??'Versión sustituida en su primer día; se conserva en historial'}</p>
      <p>Categoría salarial actual: {preview.categoria_actual_id??'Sin categoría'} · Propuesta: {preview.categoria_propuesta?.nombre_categoria??'Ninguna categoría inequívoca'}</p>
      <p>Períodos abiertos afectados: {preview.periodos_abiertos.length} · Requiere recálculo: {preview.requiere_recalculo?'Sí; no se ejecutará automáticamente':'No'}</p>
      {preview.estado_salarial==='REQUIERE_REVISION_SALARIAL'&&<p role="alert">REQUIERE_REVISION_SALARIAL: el cálculo económico queda bloqueado hasta resolver una categoría válida.</p>}
      <details><summary>Historial operativo</summary>{preview.historial.map(row=><p key={row.id}>{row.modalidad}: {row.desde} a {row.hasta??'sin fin'}</p>)}</details>
      {!preview.sin_cambio&&<label><input type="checkbox" checked={confirmed} disabled={saving} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo la nueva vigencia y sus impactos</label>}
    </section>}
    <div className="op-modal-actions"><button type="button" disabled={saving} onClick={props.onCancel}>Cancelar</button>
      <button type="button" disabled={loading||saving||!confirmed||!preview||preview.sin_cambio||!props.canSave||motivo.trim().length<3} onClick={()=>void save()}>{saving?'Guardando…':'Guardar cambio confirmado'}</button></div>
  </>;
}
