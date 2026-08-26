import { useEffect, useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { useCompanyContext } from '../../../../context/CompanyContext';

type Area = { id: string; codigo: string; nombre: string; activo: boolean; orden: number | null };
type Responsibility = { id: string; proceso: string; activo: boolean; municipio_ids: number[]; area_ids: number[] };

export function NominaProcesosTab() {
  const { empresaActual } = useCompanyContext();
  const [areas, setAreas] = useState<Area[]>([]);
  const [editing, setEditing] = useState<string | null>(null); const [editName, setEditName] = useState('');
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [usuarioId, setUsuarioId] = useState(''); const [proceso, setProceso] = useState('COBERTURA'); const [scopeIds, setScopeIds] = useState('');
  const [codigo, setCodigo] = useState(''); const [nombre, setNombre] = useState(''); const [message, setMessage] = useState('');
  const load = () => empresaActual && apiClient.get<{ data: Area[] }>('/nomina/procesos/areas', { params: { empresa_id: empresaActual.id } }).then((r) => setAreas(r.data));
  useEffect(() => { void load(); }, [empresaActual?.id]);
  useEffect(() => { if (!empresaActual || !usuarioId) { setResponsibilities([]); return; } apiClient.get<{ data: Responsibility[] }>('/nomina/procesos/responsabilidades', { params: { usuario_id: usuarioId, empresa_id: empresaActual.id } }).then((r) => setResponsibilities(r.data)).catch(() => setResponsibilities([])); }, [empresaActual?.id, usuarioId]);
  const create = async () => { if (!empresaActual || !codigo || !nombre) return; await apiClient.post('/nomina/procesos/areas', { empresa_id: empresaActual.id, codigo, nombre }); setCodigo(''); setNombre(''); setMessage('Área guardada.'); await load(); };
  const toggle = async (area: Area) => { await apiClient.patch(`/nomina/procesos/areas/${area.id}`, { activo: !area.activo }); await load(); };
  const saveName = async (area: Area) => { await apiClient.patch(`/nomina/procesos/areas/${area.id}`, { nombre: editName }); setEditing(null); await load(); };
  const saveResponsibility = async () => { if (!empresaActual || !usuarioId) return; const ids = scopeIds.split(',').map((v) => Number(v.trim())).filter(Number.isFinite); await apiClient.put('/nomina/procesos/responsabilidades', { usuario_id: usuarioId, empresa_id: empresaActual.id, proceso, municipio_ids: proceso === 'COBERTURA' ? ids : undefined, area_ids: proceso === 'ASISTENCIA' ? ids : undefined }); setMessage('Responsabilidad guardada. Deje el alcance vacío para representar NINGUNO en ese proceso.'); const r = await apiClient.get<{ data: Responsibility[] }>('/nomina/procesos/responsabilidades', { params: { usuario_id: usuarioId, empresa_id: empresaActual.id } }); setResponsibilities(r.data); };
  if (!empresaActual) return <div className="adm-empty">Seleccione una empresa autorizada.</div>;
  const responsibilitySummary = responsibilities.length === 0 ? 'Sin asignación de nómina' : responsibilities.map((r) => `${r.proceso}: ${r.activo ? 'activa' : 'NINGUNO'}`).join(' · ');
  if (responsibilitySummary === '__invalid__') setMessage(responsibilitySummary);
  return <div><div className="adm-card"><h3>Procesos y áreas de Nómina</h3><p>Las responsabilidades de usuario se administran por proceso y scope, independientemente del rol.</p><div className="adm-form-grid"><label>Usuario ID<input value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} /></label><label>Proceso<select value={proceso} onChange={(e) => setProceso(e.target.value)}><option>COBERTURA</option><option>ASISTENCIA</option><option>OPS</option></select></label><label>IDs de scope (coma separada)<input value={scopeIds} onChange={(e) => setScopeIds(e.target.value)} placeholder="municipios o áreas" /></label></div><button className="adm-btn primary" type="button" onClick={() => void saveResponsibility()}>Guardar responsabilidad</button>{message && <p>{message}</p>}</div><div className="adm-card"><h3>Administrar áreas de Asistencia</h3><div className="adm-form-grid"><label>Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} /></label><label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label></div><button className="adm-btn primary" type="button" onClick={() => void create()}>Crear área</button><table className="adm-history"><thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th /></tr></thead><tbody>{areas.map((area) => <tr key={area.id}><td>{area.codigo}</td><td>{editing === area.id ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : area.nombre}</td><td>{area.activo ? 'Activa' : 'Inactiva'}</td><td>{editing === area.id ? <button className="adm-btn ghost sm" type="button" onClick={() => void saveName(area)}>Guardar</button> : <button className="adm-btn ghost sm" type="button" onClick={() => { setEditing(area.id); setEditName(area.nombre); }}>Editar</button>}<button className="adm-btn ghost sm" type="button" onClick={() => void toggle(area)}>{area.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div></div>;
}
