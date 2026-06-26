import { useState } from 'react';
import { CheckSquare, Edit2, Plus, Power, ShieldCheck, Square } from 'lucide-react';
import type { Rol, PermisoModulo, NombrePermiso } from '../cg.types';
import { MODULOS_SISTEMA, PERMISOS_LIST } from '../cg.types';
import { MOCK_ROLES } from '../cg.mock';
import { FormModal } from '../components/FormModal';
import { MockBanner } from '../components/MockBanner';

const PERMISO_LABEL: Record<NombrePermiso, string> = {
  ver: 'Ver', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar',
  exportar: 'Exportar', aprobar: 'Aprobar', gestionar: 'Gestionar',
};

function emptyPermisos(): PermisoModulo[] {
  return MODULOS_SISTEMA.map(m => ({ modulo: m, ver: false, crear: false, editar: false, eliminar: false, exportar: false, aprobar: false, gestionar: false }));
}

export function RolesTab() {
  const [roles, setRoles] = useState<Rol[]>(MOCK_ROLES);
  const [selectedId, setSelectedId] = useState<number>(MOCK_ROLES[0]?.id ?? 0);
  const [editingPermisos, setEditingPermisos] = useState<PermisoModulo[] | null>(null);
  const [modal, setModal] = useState<null | 'new'>(null);
  const [newForm, setNewForm] = useState({ nombre: '', descripcion: '' });
  const [permisosUnsaved, setPermisosUnsaved] = useState(false);

  const selectedRol = roles.find(r => r.id === selectedId) ?? null;
  const permisos = editingPermisos ?? selectedRol?.permisos ?? [];

  function selectRol(id: number) {
    setSelectedId(id);
    setEditingPermisos(null);
    setPermisosUnsaved(false);
  }

  function togglePermiso(modulo: string, key: NombrePermiso) {
    const base = editingPermisos ?? selectedRol?.permisos ?? [];
    const next = base.map(p => p.modulo === modulo ? { ...p, [key]: !p[key] } : p);
    setEditingPermisos(next);
    setPermisosUnsaved(true);
  }

  function toggleAllModule(modulo: string) {
    const base = editingPermisos ?? selectedRol?.permisos ?? [];
    const row = base.find(p => p.modulo === modulo);
    const allOn = row ? PERMISOS_LIST.every(k => row[k]) : false;
    const next = base.map(p => p.modulo === modulo ? { ...p, ...Object.fromEntries(PERMISOS_LIST.map(k => [k, !allOn])) } as PermisoModulo : p);
    setEditingPermisos(next);
    setPermisosUnsaved(true);
  }

  function savePermisos() {
    if (!selectedId || !editingPermisos) return;
    setRoles(prev => prev.map(r => r.id === selectedId ? { ...r, permisos: editingPermisos } : r));
    setEditingPermisos(null);
    setPermisosUnsaved(false);
  }

  function discardPermisos() { setEditingPermisos(null); setPermisosUnsaved(false); }

  function toggleRolEstado(id: number) {
    setRoles(prev => prev.map(r => r.id === id ? { ...r, estado: r.estado === 'activo' ? 'inactivo' : 'activo' } : r));
  }

  function handleNewRol() {
    if (!newForm.nombre.trim()) return;
    const newRol: Rol = { id: Date.now(), nombre: newForm.nombre, descripcion: newForm.descripcion, estado: 'activo', es_sistema: false, permisos: emptyPermisos() };
    setRoles(prev => [...prev, newRol]);
    setSelectedId(newRol.id);
    setEditingPermisos(null);
    setPermisosUnsaved(false);
    setModal(null);
    setNewForm({ nombre: '', descripcion: '' });
  }

  return (
    <div>
      <MockBanner entity="Roles y Permisos" />
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><ShieldCheck size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{roles.length}</span><span className="adm-kpi-lbl">Total roles</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><ShieldCheck size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{roles.filter(r => r.estado === 'activo').length}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><ShieldCheck size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{roles.filter(r => r.es_sistema).length}</span><span className="adm-kpi-lbl">Del sistema</span></div></div>
        <div className="adm-kpi warning"><div className="adm-kpi-icon"><ShieldCheck size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{roles.filter(r => !r.es_sistema).length}</span><span className="adm-kpi-lbl">Personalizados</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><ShieldCheck size={15} /> Roles y Permisos</h4><p className="cg-tab-subtitle">Selecciona un rol para ver y editar su matriz de permisos</p></div>
        <button className="adm-btn primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo rol</button>
      </div>

      <div className="cg-split">
        {/* Role list */}
        <div className="cg-role-list">
          <div className="cg-role-list-header"><span>Roles</span></div>
          {roles.map(r => (
            <div key={r.id} className={`cg-role-item ${r.id === selectedId ? 'active' : ''}`} onClick={() => selectRol(r.id)}>
              <div>
                <div className="cg-role-item-label">{r.nombre}</div>
                <div className="cg-role-item-sub">{r.es_sistema ? 'Sistema' : 'Personalizado'}</div>
              </div>
              <span className={`adm-badge ${r.estado === 'activo' ? 'active' : 'inactive'}`} style={{ fontSize: 10, height: 18, padding: '0 6px' }}>
                {r.estado === 'activo' ? '●' : '○'}
              </span>
            </div>
          ))}
        </div>

        {/* Permissions panel */}
        <div className="cg-permisos-panel">
          {!selectedRol ? (
            <div className="cg-permisos-empty"><ShieldCheck size={32} /><p>Selecciona un rol para ver sus permisos</p></div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h4 className="cg-permisos-panel-title"><ShieldCheck size={16} /> {selectedRol.nombre}</h4>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{selectedRol.descripcion}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {!selectedRol.es_sistema && (
                    <button className={`adm-btn sm ${selectedRol.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleRolEstado(selectedRol.id)}>
                      <Power size={12} /> {selectedRol.estado === 'activo' ? 'Inactivar' : 'Activar'}
                    </button>
                  )}
                  {permisosUnsaved && (
                    <>
                      <button className="adm-btn secondary sm" onClick={discardPermisos}>Descartar</button>
                      <button className="adm-btn primary sm" onClick={savePermisos}>Guardar permisos</button>
                    </>
                  )}
                </div>
              </div>

              {permisosUnsaved && (
                <div className="adm-notice info" style={{ fontSize: 12 }}>
                  <Edit2 size={13} /> Hay cambios sin guardar en la matriz de permisos.
                </div>
              )}

              <div className="cg-matrix-wrap">
                <table className="cg-matrix">
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      {PERMISOS_LIST.map(k => <th key={k}>{PERMISO_LABEL[k]}</th>)}
                      <th>Todos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permisos.map(row => {
                      const allOn = PERMISOS_LIST.every(k => row[k]);
                      return (
                        <tr key={row.modulo}>
                          <td>{row.modulo}</td>
                          {PERMISOS_LIST.map(k => (
                            <td key={k}>
                              <input
                                type="checkbox"
                                checked={row[k]}
                                onChange={() => togglePermiso(row.modulo, k)}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: allOn ? 'var(--color-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', margin: '0 auto' }}
                              onClick={() => toggleAllModule(row.modulo)}
                              title={allOn ? 'Quitar todos' : 'Marcar todos'}
                            >
                              {allOn ? <CheckSquare size={15} /> : <Square size={15} />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === 'new' && (
        <FormModal title="Nuevo rol" onClose={() => setModal(null)} onSave={handleNewRol} saveLabel="Crear rol">
          <div className="adm-form-grid">
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Nombre del rol *</label><input className="adm-input" value={newForm.nombre} onChange={e => setNewForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Coordinador de Calidad" /></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Descripción</label><textarea className="adm-textarea" value={newForm.descripcion} onChange={e => setNewForm(p => ({ ...p, descripcion: e.target.value }))} rows={2} placeholder="Describe las responsabilidades del rol" /></div>
          </div>
          <div className="adm-notice info" style={{ marginTop: 8, fontSize: 12 }}>El rol se creará sin permisos. Configura la matriz de permisos tras crearlo.</div>
        </FormModal>
      )}
    </div>
  );
}
