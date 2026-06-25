import { useState } from 'react';
import { AlertTriangle, Edit2, KeyRound, Plus, Power, Search, User, Users } from 'lucide-react';
import type { EstadoGeneral, Usuario } from '../cg.types';
import { MOCK_ROLES, MOCK_EMPRESAS } from '../cg.mock';
import { MOCK_USUARIOS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type Form = Omit<Usuario, 'id' | 'creado_en' | 'ultimo_acceso' | 'municipios_asignados'> & { municipiosRaw: string };
const blank = (): Form => ({ nombre_completo: '', correo: '', rol_id: MOCK_ROLES[0]?.id ?? 1, empresa_id: MOCK_EMPRESAS[0]?.id ?? 1, municipiosRaw: '', estado: 'activo' });

export function UsuariosTab() {
  const [items, setItems] = useState<Usuario[]>(MOCK_USUARIOS);
  const [search, setSearch] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal] = useState<null | 'new' | Usuario>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');
  const [resetToast, setResetToast] = useState<string | null>(null);

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));
  const rolNombre = (id: number) => MOCK_ROLES.find(r => r.id === id)?.nombre ?? '—';
  const empNombre = (id: number) => MOCK_EMPRESAS.find(e => e.id === id)?.nombre ?? '—';

  const filtered = items.filter(u => {
    const matchSearch = u.nombre_completo.toLowerCase().includes(search.toLowerCase()) || u.correo.toLowerCase().includes(search.toLowerCase());
    const matchRol = !filtroRol || String(u.rol_id) === filtroRol;
    const matchEstado = !filtroEstado || u.estado === filtroEstado;
    return matchSearch && matchRol && matchEstado;
  });

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(u: Usuario) {
    setForm({ nombre_completo: u.nombre_completo, correo: u.correo, rol_id: u.rol_id, empresa_id: u.empresa_id, municipiosRaw: u.municipios_asignados.join(', '), estado: u.estado });
    setErr('');
    setModal(u);
  }

  function handleSave() {
    if (!form.nombre_completo.trim()) { setErr('El nombre es obligatorio'); return; }
    if (!form.correo.trim() || !form.correo.includes('@')) { setErr('Correo válido es obligatorio'); return; }
    const municipios_asignados = form.municipiosRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (modal === 'new') {
      const newU: Usuario = { id: Date.now(), nombre_completo: form.nombre_completo, correo: form.correo, rol_id: form.rol_id, empresa_id: form.empresa_id, municipios_asignados, estado: form.estado, creado_en: new Date().toISOString().slice(0, 10) };
      setItems(p => [newU, ...p]);
    } else {
      const id = (modal as Usuario).id;
      setItems(p => p.map(u => u.id === id ? { ...u, nombre_completo: form.nombre_completo, correo: form.correo, rol_id: form.rol_id, empresa_id: form.empresa_id, municipios_asignados, estado: form.estado } : u));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(u => u.id === id ? { ...u, estado: (u.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : u));
  }

  function handleReset(u: Usuario) {
    setResetToast(`Se enviará un correo de restablecimiento a ${u.correo}`);
    setTimeout(() => setResetToast(null), 3500);
  }

  const activos = items.filter(u => u.estado === 'activo').length;
  const thCount = items.filter(u => u.rol_id === 2).length;
  const adminCount = items.filter(u => u.rol_id === 1).length;

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><Users size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Total usuarios</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><Users size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><User size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{thCount}</span><span className="adm-kpi-lbl">Talento Humano</span></div></div>
        <div className="adm-kpi warning"><div className="adm-kpi-icon"><User size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{adminCount}</span><span className="adm-kpi-lbl">Administradores</span></div></div>
      </div>

      {resetToast && (
        <div className="adm-notice info" style={{ marginBottom: 12, fontSize: 13 }}>
          <KeyRound size={14} /> {resetToast}
        </div>
      )}

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><Users size={15} /> Usuarios</h4><p className="cg-tab-subtitle">Gestión de acceso y roles del sistema</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nuevo usuario</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por nombre o correo…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 180, height: 36 }} value={filtroRol} onChange={e => setFiltroRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {MOCK_ROLES.map(r => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
        </select>
        <select className="adm-select" style={{ width: 140, height: 36 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Empresa</th><th>Municipios asignados</th><th>Último acceso</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{u.nombre_completo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.correo}</div>
                </td>
                <td><span className="adm-badge primary" style={{ fontSize: 11 }}>{rolNombre(u.rol_id)}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{empNombre(u.empresa_id)}</td>
                <td>
                  <div className="cg-chips">
                    {u.municipios_asignados.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                    {u.municipios_asignados.slice(0, 2).map(m => <span key={m} className="cg-chip">{m}</span>)}
                    {u.municipios_asignados.length > 2 && <span className="cg-chip more">+{u.municipios_asignados.length - 2}</span>}
                  </div>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.ultimo_acceso ?? '—'}</td>
                <td><span className={`adm-badge ${u.estado === 'activo' ? 'active' : 'inactive'}`}>{u.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div className="cg-actions">
                    <button className="adm-btn ghost sm" onClick={() => openEdit(u)} title="Editar"><Edit2 size={13} /></button>
                    <button className="adm-btn ghost sm" onClick={() => handleReset(u)} title="Restablecer contraseña"><KeyRound size={13} /></button>
                    <button className={`adm-btn sm ${u.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(u.id)} title={u.estado === 'activo' ? 'Inactivar' : 'Activar'}><Power size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nuevo usuario' : `Editar: ${(modal as Usuario).nombre_completo}`} onClose={() => setModal(null)} onSave={handleSave} wide>
          <div className="adm-form-grid">
            <div className="adm-field"><label className="adm-label">Nombre completo *</label><input className="adm-input" value={form.nombre_completo} onChange={e => f('nombre_completo', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Correo electrónico *</label><input className="adm-input" type="email" value={form.correo} onChange={e => f('correo', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Rol *</label>
              <select className="adm-select" value={form.rol_id} onChange={e => f('rol_id', Number(e.target.value))}>
                {MOCK_ROLES.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Empresa *</label>
              <select className="adm-select" value={form.empresa_id} onChange={e => f('empresa_id', Number(e.target.value))}>
                {MOCK_EMPRESAS.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Estado</label>
              <select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Municipios asignados (separados por coma)</label><input className="adm-input" value={form.municipiosRaw} onChange={e => f('municipiosRaw', e.target.value)} placeholder="Acacías, Villavicencio" /></div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
