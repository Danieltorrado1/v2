import { useState } from 'react';
import { AlertTriangle, Edit2, MapPin, Plus, Power, Search } from 'lucide-react';
import type { EstadoGeneral, MunicipioAsignado } from '../cg.types';
import { MOCK_MUNICIPIOS_ASIGNADOS, MOCK_USUARIOS, MOCK_EMPRESAS, MOCK_CONTRATOS } from '../cg.mock';
import { MOCK_CATALOGOS } from '../cg.mock';
import { FormModal } from '../components/FormModal';
import { MockBanner } from '../components/MockBanner';

type Form = Omit<MunicipioAsignado, 'id' | 'fecha_asignacion'>;
const blank = (): Form => ({ usuario_id: MOCK_USUARIOS[0]?.id ?? 1, municipio: '', empresa_id: MOCK_EMPRESAS[0]?.id ?? 1, contrato_id: undefined, estado: 'activo' });

export function MunicipiosTab() {
  const [items, setItems] = useState<MunicipioAsignado[]>(MOCK_MUNICIPIOS_ASIGNADOS);
  const [search, setSearch] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal] = useState<null | 'new' | MunicipioAsignado>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));
  const usuarioNombre = (id: number) => MOCK_USUARIOS.find(u => u.id === id)?.nombre_completo ?? '—';
  const empNombre = (id: number) => MOCK_EMPRESAS.find(e => e.id === id)?.nombre ?? '—';
  const conNombre = (id?: number) => id ? (MOCK_CONTRATOS.find(c => c.id === id)?.numero_contrato ?? '—') : '—';
  const municipiosDisponibles = MOCK_CATALOGOS.municipios.filter(m => m.estado === 'activo');
  const thUsers = MOCK_USUARIOS.filter(u => u.rol_id === 2);
  const contratosDeEmpresa = MOCK_CONTRATOS.filter(c => c.empresa_id === form.empresa_id);

  const filtered = items.filter(m => {
    const matchSearch = m.municipio.toLowerCase().includes(search.toLowerCase()) || usuarioNombre(m.usuario_id).toLowerCase().includes(search.toLowerCase());
    const matchUsuario = !filtroUsuario || String(m.usuario_id) === filtroUsuario;
    const matchEstado = !filtroEstado || m.estado === filtroEstado;
    return matchSearch && matchUsuario && matchEstado;
  });

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(m: MunicipioAsignado) { setForm({ usuario_id: m.usuario_id, municipio: m.municipio, empresa_id: m.empresa_id, contrato_id: m.contrato_id, estado: m.estado }); setErr(''); setModal(m); }

  function handleSave() {
    if (!form.municipio.trim()) { setErr('Selecciona un municipio'); return; }
    if (!form.usuario_id) { setErr('Selecciona un usuario'); return; }
    if (modal === 'new') {
      const dup = items.find(i => i.usuario_id === form.usuario_id && i.municipio === form.municipio && i.estado === 'activo');
      if (dup) { setErr('Este municipio ya está asignado activamente a ese usuario'); return; }
      setItems(p => [{ ...form, id: Date.now(), fecha_asignacion: new Date().toISOString().slice(0, 10) }, ...p]);
    } else {
      const id = (modal as MunicipioAsignado).id;
      setItems(p => p.map(m => m.id === id ? { ...m, ...form } : m));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(m => m.id === id ? { ...m, estado: (m.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : m));
  }

  const activos = items.filter(m => m.estado === 'activo').length;
  const usuariosCubiertos = new Set(items.filter(m => m.estado === 'activo').map(m => m.usuario_id)).size;
  const municipiosCubiertos = new Set(items.filter(m => m.estado === 'activo').map(m => m.municipio)).size;

  return (
    <div>
      <MockBanner entity="Municipios Asignados" />
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><MapPin size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Asignaciones activas</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><MapPin size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{usuariosCubiertos}</span><span className="adm-kpi-lbl">Usuarios TH asignados</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><MapPin size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{municipiosCubiertos}</span><span className="adm-kpi-lbl">Municipios cubiertos</span></div></div>
        <div className="adm-kpi neutral"><div className="adm-kpi-icon"><MapPin size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{thUsers.filter(u => !items.some(m => m.usuario_id === u.id && m.estado === 'activo')).length}</span><span className="adm-kpi-lbl">TH sin asignar</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><MapPin size={15} /> Municipios Asignados</h4><p className="cg-tab-subtitle">Municipios asignados a usuarios de Talento Humano para gestión del portal</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nueva asignación</button>
      </div>

      {thUsers.length === 0 && (
        <div className="adm-notice warning" style={{ marginBottom: 14, fontSize: 12 }}>
          <AlertTriangle size={13} /> No hay usuarios con rol Talento Humano configurados.
        </div>
      )}

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por municipio o usuario…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 200, height: 36 }} value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}>
          <option value="">Todos los usuarios TH</option>
          {thUsers.map(u => <option key={u.id} value={String(u.id)}>{u.nombre_completo}</option>)}
        </select>
        <select className="adm-select" style={{ width: 140, height: 36 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead><tr><th>Usuario TH</th><th>Municipio</th><th>Empresa</th><th>Contrato</th><th>Asignado el</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="cg-table-empty">Sin asignaciones</td></tr>}
            {filtered.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{usuarioNombre(m.usuario_id)}</td>
                <td><span className="cg-chip">{m.municipio}</span></td>
                <td style={{ fontSize: 12 }}>{empNombre(m.empresa_id)}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{conNombre(m.contrato_id)}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.fecha_asignacion}</td>
                <td><span className={`adm-badge ${m.estado === 'activo' ? 'active' : 'inactive'}`}>{m.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(m)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${m.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(m.id)}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nueva asignación de municipio' : 'Editar asignación'} onClose={() => setModal(null)} onSave={handleSave} wide>
          <div className="adm-form-grid">
            <div className="adm-field"><label className="adm-label">Usuario Talento Humano *</label>
              <select className="adm-select" value={form.usuario_id} onChange={e => f('usuario_id', Number(e.target.value))}>
                {thUsers.map(u => <option key={u.id} value={u.id}>{u.nombre_completo}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Municipio *</label>
              <select className="adm-select" value={form.municipio} onChange={e => f('municipio', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {municipiosDisponibles.map(m => <option key={m.id} value={m.nombre}>{m.nombre}{m.descripcion ? ` (${m.descripcion})` : ''}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Empresa *</label>
              <select className="adm-select" value={form.empresa_id} onChange={e => { f('empresa_id', Number(e.target.value)); f('contrato_id', undefined); }}>
                {MOCK_EMPRESAS.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Contrato</label>
              <select className="adm-select" value={form.contrato_id ?? ''} onChange={e => f('contrato_id', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">General</option>
                {contratosDeEmpresa.map(c => <option key={c.id} value={c.id}>{c.numero_contrato} – {c.cliente}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Estado</label>
              <select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
