import { useEffect, useState } from 'react';
import { AlertTriangle, Edit2, Plus, Power, Search, User, Users } from 'lucide-react';
import { FormModal } from '../components/FormModal';
import {
  activateUser,
  createUser,
  deactivateUser,
  getUsers,
  updateUser,
} from '../../../../services/usuariosApi';
import type { CreateUserPayload, UpdateUserPayload, UserProfile } from '../../../../services/usuariosApi';

type UserForm = { name: string; email: string; password: string; rolesRaw: string };
const blankForm = (): UserForm => ({ name: '', email: '', password: '', rolesRaw: '' });

export function UsuariosTab() {
  const [users, setUsers]               = useState<UserProfile[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal]               = useState<null | 'new' | UserProfile>(null);
  const [form, setForm]                 = useState<UserForm>(blankForm());
  const [formErr, setFormErr]           = useState('');
  const [saving, setSaving]             = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getUsers()
      .then(data  => { if (!cancelled) setUsers(data); })
      .catch(e    => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando usuarios'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const f = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm(p => ({ ...p, [k]: v }));

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch  = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchEstado  = !filtroEstado || (filtroEstado === 'activo' ? u.active : !u.active);
    return matchSearch && matchEstado;
  });

  function openNew() { setForm(blankForm()); setFormErr(''); setModal('new'); }
  function openEdit(u: UserProfile) {
    setForm({ name: u.name, email: u.email, password: '', rolesRaw: u.roles.join(', ') });
    setFormErr('');
    setModal(u);
  }

  async function handleToggle(u: UserProfile) {
    setSaving(u.id);
    try {
      const updated = u.active ? await deactivateUser(u.id) : await activateUser(u.id);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch {
      // silently ignore — toggle failure leaves state unchanged
    } finally {
      setSaving('');
    }
  }

  async function handleSave() {
    if (!form.name.trim())                              { setFormErr('El nombre es obligatorio'); return; }
    if (!form.email.trim() || !form.email.includes('@')){ setFormErr('Correo válido es obligatorio'); return; }
    if (modal === 'new' && form.password.length < 8)    { setFormErr('La contraseña debe tener al menos 8 caracteres'); return; }
    const roleIds = form.rolesRaw.split(',').map(s => s.trim()).filter(Boolean);
    setFormErr('');
    setSubmitLoading(true);
    try {
      if (modal === 'new') {
        const payload: CreateUserPayload = {
          name: form.name.trim(), email: form.email.trim(), password: form.password, roleIds,
        };
        const newUser = await createUser(payload);
        setUsers(prev => [newUser, ...prev]);
      } else {
        const id = (modal as UserProfile).id;
        const payload: UpdateUserPayload = { name: form.name.trim(), email: form.email.trim(), roleIds };
        if (form.password.length >= 8) payload.password = form.password;
        const updated = await updateUser(id, payload);
        setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
      }
      setModal(null);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Error guardando usuario');
    } finally {
      setSubmitLoading(false);
    }
  }

  const total    = users.length;
  const activos  = users.filter(u => u.active).length;
  const inactivos = users.filter(u => !u.active).length;
  const conRoles = users.filter(u => u.roles.length > 0).length;

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><Users size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{total}</span><span className="adm-kpi-lbl">Total usuarios</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><Users size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi danger"><div className="adm-kpi-icon"><User size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{inactivos}</span><span className="adm-kpi-lbl">Inactivos</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><User size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{conRoles}</span><span className="adm-kpi-lbl">Con roles</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Users size={15} /> Usuarios</h4>
          <p className="cg-tab-subtitle">Gestión de acceso al sistema · datos en tiempo real</p>
        </div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nuevo usuario</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search">
          <Search size={14} />
          <input placeholder="Buscar por nombre o correo…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="adm-select" style={{ width: 140, height: 36 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </div>

      {error && (
        <div className="adm-notice warning" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="cg-table-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Cargando usuarios…
          </div>
        ) : (
          <table className="adm-history">
            <thead>
              <tr><th>Usuario</th><th>Roles</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="cg-table-empty">Sin resultados</td></tr>
              )}
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</div>
                  </td>
                  <td>
                    {u.roles.length === 0
                      ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin rol</span>
                      : u.roles.map(r => (
                          <span key={r} className="adm-badge primary" style={{ fontSize: 11, marginRight: 3 }}>{r}</span>
                        ))
                    }
                  </td>
                  <td>
                    <span className={`adm-badge ${u.active ? 'active' : 'inactive'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {u.createdAt?.slice(0, 10) ?? '—'}
                  </td>
                  <td>
                    <div className="cg-actions">
                      <button className="adm-btn ghost sm" onClick={() => openEdit(u)} title="Editar">
                        <Edit2 size={13} />
                      </button>
                      <button
                        className={`adm-btn sm ${u.active ? 'danger-outline' : 'secondary'}`}
                        onClick={() => handleToggle(u)}
                        disabled={saving === u.id}
                        title={u.active ? 'Inactivar' : 'Activar'}
                      >
                        <Power size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <FormModal
          title={modal === 'new' ? 'Nuevo usuario' : `Editar: ${(modal as UserProfile).name}`}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={submitLoading}
          wide
        >
          <div className="adm-form-grid">
            <div className="adm-field">
              <label className="adm-label">Nombre completo *</label>
              <input className="adm-input" value={form.name} onChange={e => f('name', e.target.value)} />
            </div>
            <div className="adm-field">
              <label className="adm-label">Correo electrónico *</label>
              <input className="adm-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} />
            </div>
            <div className="adm-field">
              <label className="adm-label">{modal === 'new' ? 'Contraseña *' : 'Nueva contraseña (opcional)'}</label>
              <input className="adm-input" type="password" value={form.password} onChange={e => f('password', e.target.value)} placeholder="Mín. 8 caracteres" />
            </div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
              <label className="adm-label">Roles (separados por coma)</label>
              <input className="adm-input" value={form.rolesRaw} onChange={e => f('rolesRaw', e.target.value)} placeholder="admin, supervisor" />
            </div>
          </div>
          {formErr && (
            <div className="adm-notice warning" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} /> {formErr}
            </div>
          )}
        </FormModal>
      )}
    </div>
  );
}
