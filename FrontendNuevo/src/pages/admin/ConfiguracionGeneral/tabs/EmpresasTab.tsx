import { useState } from 'react';
import { Building2, Edit2, Plus, Power, Search } from 'lucide-react';
import type { Empresa, EstadoGeneral } from '../cg.types';
import { MOCK_EMPRESAS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type Form = Omit<Empresa, 'id' | 'creado_en'>;
const blank = (): Form => ({ nombre: '', nit: '', representante_legal: '', direccion: '', telefono: '', correo: '', estado: 'activo', observaciones: '' });

export function EmpresasTab() {
  const [items, setItems] = useState<Empresa[]>(MOCK_EMPRESAS);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'new' | Empresa>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));

  const filtered = items.filter(e =>
    e.nombre.toLowerCase().includes(search.toLowerCase()) || e.nit.includes(search),
  );

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(e: Empresa) { setForm({ nombre: e.nombre, nit: e.nit, representante_legal: e.representante_legal, direccion: e.direccion, telefono: e.telefono, correo: e.correo, estado: e.estado, observaciones: e.observaciones ?? '' }); setErr(''); setModal(e); }

  function handleSave() {
    if (!form.nombre.trim()) { setErr('El nombre es obligatorio'); return; }
    if (!form.nit.trim()) { setErr('El NIT es obligatorio'); return; }
    if (modal === 'new') {
      setItems(p => [{ ...form, id: Date.now(), creado_en: new Date().toISOString().slice(0, 10) }, ...p]);
    } else {
      const id = (modal as Empresa).id;
      setItems(p => p.map(e => e.id === id ? { ...e, ...form } : e));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(e => e.id === id ? { ...e, estado: (e.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : e));
  }

  const activas = items.filter(e => e.estado === 'activo').length;

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><Building2 size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Total empresas</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><Building2 size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activas}</span><span className="adm-kpi-lbl">Activas</span></div></div>
        <div className="adm-kpi neutral"><div className="adm-kpi-icon"><Building2 size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length - activas}</span><span className="adm-kpi-lbl">Inactivas</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div>
          <h4 className="cg-tab-title"><Building2 size={15} /> Empresas</h4>
          <p className="cg-tab-subtitle">Configuración de empresas registradas en el sistema</p>
        </div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nueva empresa</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por nombre o NIT…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead><tr><th>Empresa</th><th>NIT</th><th>Representante Legal</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(e => (
              <tr key={e.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{e.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.direccion}</div>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.nit}</td>
                <td>{e.representante_legal}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{e.correo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.telefono}</div>
                </td>
                <td><span className={`adm-badge ${e.estado === 'activo' ? 'active' : 'inactive'}`}>{e.estado === 'activo' ? 'Activa' : 'Inactiva'}</span></td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(e)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${e.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(e.id)} title={e.estado === 'activo' ? 'Inactivar' : 'Activar'}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nueva empresa' : `Editar: ${(modal as Empresa).nombre}`} onClose={() => setModal(null)} onSave={handleSave}>
          <div className="adm-form-grid">
            <div className="adm-field"><label className="adm-label">Nombre *</label><input className="adm-input" value={form.nombre} onChange={e => f('nombre', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">NIT *</label><input className="adm-input" value={form.nit} onChange={e => f('nit', e.target.value)} placeholder="000.000.000-0" /></div>
            <div className="adm-field"><label className="adm-label">Representante Legal</label><input className="adm-input" value={form.representante_legal} onChange={e => f('representante_legal', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Correo</label><input className="adm-input" type="email" value={form.correo} onChange={e => f('correo', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Teléfono</label><input className="adm-input" value={form.telefono} onChange={e => f('telefono', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Estado</label><select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Dirección</label><input className="adm-input" value={form.direccion} onChange={e => f('direccion', e.target.value)} /></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Observaciones</label><textarea className="adm-textarea" value={form.observaciones ?? ''} onChange={e => f('observaciones', e.target.value)} rows={2} /></div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}>{err}</div>}
        </FormModal>
      )}
    </div>
  );
}
