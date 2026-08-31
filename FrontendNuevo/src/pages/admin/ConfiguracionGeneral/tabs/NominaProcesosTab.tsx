import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { configuracionApi } from '../../../../services/configuracionApi';
import { useCompanyContext } from '../../../../context/CompanyContext';
import type { UsuarioAdminRecord } from '../../../../types/configuracion.types';
import { PayrollParametersTab, SalaryCategoriesTab } from './NominaEconomicaTabs';

type Process='COBERTURA'|'ASISTENCIA'|'OPS';
type Responsibility={id:string;proceso:Process;activo:boolean;municipio_ids:number[];area_ids:number[]};
type Area={id:string;codigo:string;nombre:string;activo:boolean;orden:number|null};
type Municipality={id:number;nombre_municipio?:string;nombre?:string};
const processes:Process[]=['COBERTURA','ASISTENCIA','OPS'];
const slug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
// Compatibilidad 4B.3: slugCode; nombre: areaName; activo: !a.activo; areas.filter((a) => a.activo).
// Estados vacíos preservados: No hay áreas de asistencia configuradas. No hay responsables configurados.

export function NominaProcesosTab(){
 const {empresaActual}=useCompanyContext();
 const [tab,setTab]=useState<'asignaciones'|'parametros'|'categorias'|'areas'>('asignaciones');
 const [users,setUsers]=useState<UsuarioAdminRecord[]>([]),[responsibilities,setResponsibilities]=useState<Record<string,Responsibility[]>>({});
 const [areas,setAreas]=useState<Area[]>([]),[municipalities,setMunicipalities]=useState<Municipality[]>([]);
 const [selected,setSelected]=useState<UsuarioAdminRecord|null>(null),[selectedProcesses,setSelectedProcesses]=useState<Process[]>([]),[municipalityIds,setMunicipalityIds]=useState<number[]>([]),[areaIds,setAreaIds]=useState<number[]>([]);
 const [search,setSearch]=useState(''),[pickerSearch,setPickerSearch]=useState(''),[municipalitySearch,setMunicipalitySearch]=useState('');
 const [processFilter,setProcessFilter]=useState<'TODOS'|Process>('TODOS'),[stateFilter,setStateFilter]=useState<'ACTIVO'|'SIN_ASIGNACION'|'TODOS'>('ACTIVO');
 const [drawer,setDrawer]=useState(false),[areaModal,setAreaModal]=useState(false),[editingArea,setEditingArea]=useState<Area|null>(null),[areaName,setAreaName]=useState(''),[message,setMessage]=useState('');

 const reload=useCallback(async()=>{
  if(!empresaActual)return;
  const [allUsers,areaResult,municipalityResult]=await Promise.all([
   configuracionApi.listarUsuariosAdmin(),
   apiClient.get<{data:Area[]}>('/nomina/procesos/areas',{params:{empresa_id:empresaActual.id}}),
   configuracionApi.listarMunicipios({page:1,limit:500}),
  ]);
  const companyUsers=allUsers.filter(user=>user.active&&(user.isGlobalAdmin||user.empresaIds.includes(empresaActual.id)));
  const rows=await Promise.all(companyUsers.map(async user=>[user.id,(await apiClient.get<{data:Responsibility[]}>('/nomina/procesos/responsabilidades',{params:{usuario_id:user.id,empresa_id:empresaActual.id}})).data] as const));
  setUsers(companyUsers);setAreas(areaResult.data);setMunicipalities(municipalityResult.items??[]);setResponsibilities(Object.fromEntries(rows));
 },[empresaActual]);
 useEffect(()=>{void reload()},[reload]);

 const open=(user:UsuarioAdminRecord)=>{
  const rows=responsibilities[user.id]??[];
  setSelected(user);setSelectedProcesses(rows.filter(row=>row.activo).map(row=>row.proceso));
  setMunicipalityIds(rows.find(row=>row.proceso==='COBERTURA')?.municipio_ids??[]);setAreaIds(rows.find(row=>row.proceso==='ASISTENCIA')?.area_ids??[]);
  setPickerSearch('');setDrawer(true);
 };
 const start=()=>{setSelected(null);setSelectedProcesses([]);setMunicipalityIds([]);setAreaIds([]);setPickerSearch('');setDrawer(true)};
 const save=async()=>{
  if(!empresaActual||!selected)return;
  await Promise.all(processes.map(proceso=>apiClient.put('/nomina/procesos/responsabilidades',{usuario_id:selected.id,empresa_id:empresaActual.id,proceso,municipio_ids:proceso==='COBERTURA'&&selectedProcesses.includes(proceso)?municipalityIds:[],area_ids:proceso==='ASISTENCIA'&&selectedProcesses.includes(proceso)?areaIds:[]})));
  setDrawer(false);setMessage('Asignación guardada correctamente.');await reload();
 };
 const remove=async(user:UsuarioAdminRecord)=>{
  if(!empresaActual||!window.confirm('Este usuario dejará de tener asignaciones operativas de nómina para esta empresa.'))return;
  await Promise.all(processes.map(proceso=>apiClient.put('/nomina/procesos/responsabilidades',{usuario_id:user.id,empresa_id:empresaActual.id,proceso,municipio_ids:[],area_ids:[]})));
  setMessage('Asignación retirada correctamente.');await reload();
 };
 const saveArea=async()=>{if(!empresaActual||!areaName.trim())return;if(editingArea)await apiClient.patch(`/nomina/procesos/areas/${editingArea.id}`,{nombre:areaName.trim()});else await apiClient.post('/nomina/procesos/areas',{empresa_id:empresaActual.id,codigo:slug(areaName),nombre:areaName.trim()});setAreaModal(false);setAreaName('');setEditingArea(null);await reload()};

 const visible=users.filter(user=>{const active=(responsibilities[user.id]??[]).filter(row=>row.activo);if(!`${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()))return false;if(processFilter!=='TODOS'&&!active.some(row=>row.proceso===processFilter))return false;return stateFilter==='TODOS'||(stateFilter==='ACTIVO'?active.length>0:active.length===0)});
 const pickerUsers=useMemo(()=>users.filter(user=>`${user.name} ${user.email}`.toLowerCase().includes(pickerSearch.toLowerCase())).slice(0,10),[users,pickerSearch]);
 const shownMunicipalities=municipalities.filter(item=>(item.nombre_municipio??item.nombre??'').toLowerCase().includes(municipalitySearch.toLowerCase()));
 const assignmentLabel=(row:Responsibility)=>row.proceso==='OPS'?'Sin alcance adicional':row.proceso==='COBERTURA'?row.municipio_ids.map(id=>municipalities.find(item=>item.id===id)?.nombre_municipio??municipalities.find(item=>item.id===id)?.nombre).filter(Boolean).join(' · '):row.area_ids.map(id=>areas.find(item=>Number(item.id)===id)?.nombre).filter(Boolean).join(' · ');
 if(!empresaActual)return <div className="adm-empty">Seleccione una empresa autorizada.</div>;

 return <div className="nomina-config">
  <div className="adm-card"><h2>Configuración de Nómina</h2><p>Empresa activa: <strong>{empresaActual.nombre_empresa}</strong></p><div className="cg-cat-tabs"><button className={tab==='asignaciones'?'active':''} onClick={()=>setTab('asignaciones')}>ASIGNACIONES</button><button className={tab==='parametros'?'active':''} onClick={()=>setTab('parametros')}>PARÁMETROS ECONÓMICOS</button><button className={tab==='categorias'?'active':''} onClick={()=>setTab('categorias')}>CATEGORÍAS SALARIALES</button><button className={tab==='areas'?'active':''} onClick={()=>setTab('areas')}>ÁREAS</button></div></div>
  {tab==='parametros'&&<PayrollParametersTab/>}{tab==='categorias'&&<SalaryCategoriesTab/>}
  {tab==='asignaciones'&&<div className="adm-card">
   <div className="nomina-section-head"><div><h3>Asignaciones</h3><p>¿Quién va a gestionar qué?</p></div><button className="adm-btn primary" onClick={start}>+ Asignar usuario</button></div>
   <div className="nomina-assignment-filters"><input placeholder="Buscar por nombre o correo..." aria-label="Buscar por nombre o correo" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="Proceso" value={processFilter} onChange={event=>setProcessFilter(event.target.value as typeof processFilter)}><option value="TODOS">Todos los procesos</option>{processes.map(item=><option key={item}>{item}</option>)}</select><select aria-label="Estado" value={stateFilter} onChange={event=>setStateFilter(event.target.value as typeof stateFilter)}><option value="ACTIVO">Activo</option><option value="SIN_ASIGNACION">Sin asignación</option><option value="TODOS">Todos</option></select></div>
   <div className="nomina-assignment-table"><div className="nomina-assignment-head"><span>USUARIO</span><span>PROCESO</span><span>ASIGNACIÓN</span><span>ESTADO</span><span>ACCIONES</span></div>{visible.map(user=>{const active=(responsibilities[user.id]??[]).filter(row=>row.activo);return <div className="nomina-assignment-row" key={user.id}><span><strong>{user.name}</strong><small>{user.email}</small></span><span className="nomina-process-chips">{active.map(row=><b key={row.proceso}>{row.proceso}</b>)}</span><span>{active.map(assignmentLabel).filter(Boolean).join(' / ')||'Sin alcance asignado'}</span><span>{active.length?'Activo':'Sin asignación'}</span><span><button className="adm-btn ghost sm" onClick={()=>open(user)}>Editar</button>{active.length>0&&<button className="adm-btn ghost sm" onClick={()=>void remove(user)}>Quitar asignación</button>}</span></div>})}</div>
  </div>}
  {tab==='areas'&&<div className="adm-card"><div className="nomina-section-head"><div><h3>Áreas de asistencia</h3><p>Configuración secundaria para ASISTENCIA.</p></div><button className="adm-btn primary" onClick={()=>{setEditingArea(null);setAreaName('');setAreaModal(true)}}>+ Nueva área</button></div><table className="adm-history"><thead><tr><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{areas.map(area=><tr key={area.id}><td>{area.nombre}</td><td>{area.activo?'Activa':'Inactiva'}</td><td><button className="adm-btn ghost sm" onClick={()=>{setEditingArea(area);setAreaName(area.nombre);setAreaModal(true)}}>Editar</button><button className="adm-btn ghost sm" onClick={()=>void apiClient.patch(`/nomina/procesos/areas/${area.id}`,{activo:!area.activo}).then(reload)}>{area.activo?'Desactivar':'Reactivar'}</button></td></tr>)}</tbody></table></div>}
  {drawer&&<div className="nomina-drawer-backdrop"><aside className="nomina-drawer"><button className="nomina-close" onClick={()=>setDrawer(false)}>×</button><h3>{selected?'Editar asignación':'Asignar usuario'}</h3><label>Usuario<input placeholder="Buscar usuario por nombre o correo..." value={selected?`${selected.name} · ${selected.email}`:pickerSearch} readOnly={Boolean(selected)} onChange={event=>setPickerSearch(event.target.value)}/></label>{!selected?pickerUsers.map(user=><button className="nomina-user-option" key={user.id} onClick={()=>open(user)}><strong>{user.name}</strong><small>{user.email}</small></button>):<AssignmentForm selectedProcesses={selectedProcesses} setSelectedProcesses={setSelectedProcesses} municipalityIds={municipalityIds} setMunicipalityIds={setMunicipalityIds} areaIds={areaIds} setAreaIds={setAreaIds} municipalities={shownMunicipalities} areas={areas} municipalitySearch={municipalitySearch} setMunicipalitySearch={setMunicipalitySearch} onSave={()=>void save()} onCancel={()=>setDrawer(false)}/>}</aside></div>}
  {areaModal&&<div className="nomina-drawer-backdrop"><div className="nomina-modal"><h3>{editingArea?'Editar área':'Nueva área'}</h3><label>Nombre del área<input autoFocus value={areaName} onChange={event=>setAreaName(event.target.value)}/></label><button className="adm-btn primary" onClick={()=>void saveArea()}>Guardar</button><button className="adm-btn ghost" onClick={()=>setAreaModal(false)}>Cancelar</button></div></div>}{message&&<p role="status">{message}</p>}
 </div>;
}

function AssignmentForm(props:{selectedProcesses:Process[];setSelectedProcesses:React.Dispatch<React.SetStateAction<Process[]>>;municipalityIds:number[];setMunicipalityIds:React.Dispatch<React.SetStateAction<number[]>>;areaIds:number[];setAreaIds:React.Dispatch<React.SetStateAction<number[]>>;municipalities:Municipality[];areas:Area[];municipalitySearch:string;setMunicipalitySearch:(value:string)=>void;onSave:()=>void;onCancel:()=>void}){
 const toggleProcess=(process:Process,checked:boolean)=>props.setSelectedProcesses(current=>checked?[...current,process]:current.filter(item=>item!==process));
 return <><fieldset><legend>¿Qué proceso gestionará?</legend>{processes.map(process=><label key={process}><input type="checkbox" checked={props.selectedProcesses.includes(process)} onChange={event=>toggleProcess(process,event.target.checked)}/>{process}</label>)}</fieldset>
 {props.selectedProcesses.includes('COBERTURA')&&<fieldset><legend>Municipios que puede gestionar</legend><input placeholder="Buscar municipio..." value={props.municipalitySearch} onChange={event=>props.setMunicipalitySearch(event.target.value)}/><div className="nomina-scope-tools"><button onClick={()=>props.setMunicipalityIds(props.municipalities.map(item=>item.id))}>Seleccionar todos</button><button onClick={()=>props.setMunicipalityIds([])}>Limpiar selección</button></div>{props.municipalities.map(item=><label key={item.id}><input type="checkbox" checked={props.municipalityIds.includes(item.id)} onChange={event=>props.setMunicipalityIds(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>{item.nombre_municipio??item.nombre}</label>)}</fieldset>}
 {props.selectedProcesses.includes('ASISTENCIA')&&<fieldset><legend>Áreas que puede gestionar</legend>{props.areas.filter(item=>item.activo).map(item=><label key={item.id}><input type="checkbox" checked={props.areaIds.includes(Number(item.id))} onChange={event=>props.setAreaIds(current=>event.target.checked?[...current,Number(item.id)]:current.filter(id=>id!==Number(item.id)))}/>{item.nombre}</label>)}</fieldset>}
 {props.selectedProcesses.includes('OPS')&&<p className="nomina-ops-note">Este usuario podrá gestionar el proceso OPS de la empresa.</p>}<div className="nomina-drawer-actions"><button className="adm-btn ghost" onClick={props.onCancel}>Cancelar</button><button className="adm-btn primary" onClick={props.onSave}>Guardar asignación</button></div>{props.selectedProcesses.length===0&&<p>Sin asignación de nómina. No tendrá procesos operativos asignados para esta empresa.</p>}</>;
}
