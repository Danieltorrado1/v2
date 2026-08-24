import { useEffect, useMemo, useState } from "react";
import { getAllNominaPeriodoEmpleados, getNominaPeriodos } from "../../services/nominaApi";
import { apiClient } from "../../services/apiClient";
import type { NominaEmpleadoApi, NominaPeriodoApi } from "../../types/nomina.types";
import "./NominaPages.css";

type Contexto = { municipio_id?: string; institucion_id?: string; sede_id?: string; modalidad_id?: string; municipio?: string; institucion?: string; sede?: string; modalidad?: string };
type Tramo = { fecha_inicio:string;fecha_fin:string;dias:number;contexto:Contexto };
type Cambio = { id:string;vinculacion_id:string;fecha_inicio_efectiva:string;tipo:string;contexto_anterior:Contexto;contexto_nuevo:Contexto;motivo:string;activo:boolean };
const emptyContext:Contexto={};
const contextLabel=(c:Contexto)=>[c.municipio,c.institucion,c.sede,c.modalidad].filter(Boolean).join(" / ")||"Contexto por IDs";
export default function CambiosOperativosPage(){
  const [periodos,setPeriodos]=useState<NominaPeriodoApi[]>([]),[periodoId,setPeriodoId]=useState("");
  const [empleados,setEmpleados]=useState<NominaEmpleadoApi[]>([]),[empleadoId,setEmpleadoId]=useState("");
  const [cambios,setCambios]=useState<Cambio[]>([]),[tramos,setTramos]=useState<Tramo[]>([]);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [fecha,setFecha]=useState(""),[tipo,setTipo]=useState("CAMBIO_COMBINADO"),[motivo,setMotivo]=useState("");
  const [anterior,setAnterior]=useState<Contexto>(emptyContext),[nuevo,setNuevo]=useState<Contexto>(emptyContext),[message,setMessage]=useState("");
  const empleado=useMemo(()=>empleados.find(e=>String(e.id)===empleadoId),[empleados,empleadoId]);
  useEffect(()=>{void getNominaPeriodos({page:1,limit:100}).then(r=>{setPeriodos(r.items);setPeriodoId(String(r.items.find(p=>p.estado==="ABIERTO")?.id??r.items[0]?.id??""));});},[]);
  useEffect(()=>{if(!periodoId)return;void getAllNominaPeriodoEmpleados(periodoId).then(r=>{setEmpleados(r.items);setEmpleadoId(String(r.items[0]?.id??""));});},[periodoId]);
  const reload=async()=>{if(!periodoId||!empleado)return;const [cs,ts]=await Promise.all([apiClient.get<Cambio[]>("/nomina/cambios-operativos",{params:{periodo_id:periodoId,vinculacion_id:String(empleado.vinculacion_id),activo:true}}),apiClient.get<Tramo[]>(`/nomina/periodos/${periodoId}/vinculaciones/${empleado.vinculacion_id}/tramos-operativos`)]);setCambios(cs);setTramos(ts);};
  // reload reads the current period/employee selection; recreating it is intentional here.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{void reload().catch(()=>{setCambios([]);setTramos([]);});},[periodoId,empleadoId]);
  const setField=(setter:(v:Contexto)=>void,current:Contexto,key:keyof Contexto,value:string)=>setter({...current,[key]:value||undefined});
  const save=async()=>{if(!empleado)return;setMessage("");try{const payload={fecha_inicio_efectiva:fecha,regla_fecha_efectiva:"MISMO_DIA",tipo,contexto_anterior:anterior,contexto_nuevo:nuevo,motivo};if(editingId)await apiClient.patch(`/nomina/cambios-operativos/${editingId}`,payload);else await apiClient.post("/nomina/cambios-operativos",{periodo_id:periodoId,nomina_empleado_id:empleadoId,vinculacion_id:String(empleado.vinculacion_id),...payload});setMessage(`Cambio ${editingId?"actualizado":"creado"} y tramos recalculados.`);setEditingId(null);await reload();}catch(e){setMessage(e instanceof Error?e.message:"No fue posible guardar el cambio");}};
  const edit=(c:Cambio)=>{setEditingId(c.id);setFecha(c.fecha_inicio_efectiva);setTipo(c.tipo);setAnterior(c.contexto_anterior);setNuevo(c.contexto_nuevo);setMotivo(c.motivo);};
  const deactivate=async(c:Cambio)=>{const reason=window.prompt("Motivo de desactivación");if(!reason)return;await apiClient.patch(`/nomina/cambios-operativos/${c.id}/deactivate`,{motivo:reason});setEditingId(null);await reload();};
  return <section className="nomina-page">
    <header className="nomina-page__header"><div><p className="eyebrow">NÓMINA-3</p><h1>Cambios operativos intrames</h1><p>Una persona, una vinculación y una fila; los segmentos se derivan por fecha efectiva.</p></div></header>
    <div className="nomina-card"><h2>Nuevo cambio operativo</h2><div className="nomina-form-grid">
      <label>Periodo<select value={periodoId} onChange={e=>setPeriodoId(e.target.value)}>{periodos.map(p=><option key={String(p.id)} value={String(p.id)}>{p.nombre_periodo} · {p.estado}</option>)}</select></label>
      <label>Persona<select value={empleadoId} onChange={e=>setEmpleadoId(e.target.value)}>{empleados.map(e=><option key={String(e.id)} value={String(e.id)}>{e.persona.numero_documento} · {e.persona.nombre_completo}</option>)}</select></label>
      <label>Fecha efectiva<input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
      <label>Tipo<select value={tipo} onChange={e=>setTipo(e.target.value)}><option>CAMBIO_DE_MODALIDAD</option><option>CAMBIO_DE_SEDE</option><option>CAMBIO_COMBINADO</option></select></label>
    </div><div className="nomina-form-grid"><fieldset><legend>Contexto anterior (snapshot)</legend>{(["municipio","institucion","sede","modalidad"] as const).map(k=><span key={k}><input placeholder={`${k} id`} value={anterior[`${k}_id`]??""} onChange={e=>setField(setAnterior,anterior,`${k}_id`,e.target.value)}/><input placeholder={`${k} histórico`} value={anterior[k]??""} onChange={e=>setField(setAnterior,anterior,k,e.target.value)}/></span>)}</fieldset><fieldset><legend>Contexto nuevo (FK + snapshot)</legend>{(["municipio","institucion","sede","modalidad"] as const).map(k=><span key={k}><input placeholder={`${k} id`} value={nuevo[`${k}_id`]??""} onChange={e=>setField(setNuevo,nuevo,`${k}_id`,e.target.value)}/><input placeholder={`${k} histórico`} value={nuevo[k]??""} onChange={e=>setField(setNuevo,nuevo,k,e.target.value)}/></span>)}</fieldset></div>
    <label>Motivo<textarea value={motivo} onChange={e=>setMotivo(e.target.value)}/></label>
    {fecha&&<div className="nomina-alert"><strong>Preview:</strong> antes, hasta el día anterior a {fecha}: {contextLabel(anterior)}. Desde {fecha}: {contextLabel(nuevo)}.</div>}
    <button type="button" onClick={()=>void save()} disabled={!fecha||motivo.trim().length<3||!empleado}>{editingId?"Guardar edición":"Confirmar cambio"}</button>{editingId&&<button type="button" onClick={()=>setEditingId(null)}>Cancelar</button>}{message&&<p>{message}</p>}</div>
    <div className="nomina-card"><h2>Planilla compacta 1–31</h2>{empleado&&<p>{empleado.persona.numero_documento} · una sola fila</p>}<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{tramos.flatMap(t=>Array.from({length:t.dias},(_,i)=>{const d=Number(t.fecha_inicio.slice(8))+i;return <span key={`${t.fecha_inicio}-${d}`} title={`${t.fecha_inicio}–${t.fecha_fin}: ${contextLabel(t.contexto)}`} style={{padding:"6px",borderLeft:i===0?"3px solid var(--color-primary)":"1px solid transparent"}}>{d}</span>}))}</div><ul>{tramos.map(t=><li key={t.fecha_inicio}>{t.fecha_inicio}–{t.fecha_fin} ({t.dias} días): {contextLabel(t.contexto)}</li>)}</ul><ul>{cambios.map(c=><li key={c.id}>{c.fecha_inicio_efectiva} · {c.tipo} <button type="button" onClick={()=>edit(c)}>Editar</button> <button type="button" onClick={()=>void deactivate(c)}>Desactivar</button></li>)}</ul><small>{cambios.length} cambio(s) activo(s). Seleccione/pase sobre un día para consultar su contexto.</small></div>
  </section>;
}
