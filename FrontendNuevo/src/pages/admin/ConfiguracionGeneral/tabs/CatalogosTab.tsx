import { useState } from 'react';
import { BookOpen, Edit2, Plus, Power, Search } from 'lucide-react';
import type { CatalogoItem, EstadoGeneral, TipoCatalogo } from '../cg.types';
import { CATALOGOS_CONFIG } from '../cg.types';
import { MOCK_CATALOGOS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type CatalogStore = Record<TipoCatalogo, CatalogoItem[]>;

type Form = Omit<CatalogoItem, 'id'>;
const blank = (): Form => ({ nombre: '', codigo: '', descripcion: '', estado: 'activo' });

export function CatalogosTab() {
  const [activeCat, setActiveCat] = useState<TipoCatalogo>(CATALOGOS_CONFIG[0].id);
  const [store, setStore] = useState<CatalogStore>(() => {
    const copy: Partial<CatalogStore> = {};
    for (const cfg of CATALOGOS_CONFIG) copy[cfg.id] = [...MOCK_CATALOGOS[cfg.id]];
    return copy as CatalogStore;
  });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'new' | CatalogoItem>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const cfg = CATALOGOS_CONFIG.find(c => c.id === activeCat)!;
  const items = store[activeCat] ?? [];
  const filtered = items.filter(i => i.nombre.toLowerCase().includes(search.toLowerCase()) || (i.codigo ?? '').toLowerCase().includes(search.toLowerCase()));

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(i: CatalogoItem) { setForm({ nombre: i.nombre, codigo: i.codigo ?? '', descripcion: i.descripcion ?? '', estado: i.estado }); setErr(''); setModal(i); }

  function handleSave() {
    if (!form.nombre.trim()) { setErr('El nombre es obligatorio'); return; }
    if (modal === 'new') {
      const newItem: CatalogoItem = { ...form, id: Date.now() };
      setStore(p => ({ ...p, [activeCat]: [newItem, ...p[activeCat]] }));
    } else {
      const id = (modal as CatalogoItem).id;
      setStore(p => ({ ...p, [activeCat]: p[activeCat].map(i => i.id === id ? { ...i, ...form } : i) }));
    }
    setModal(null);
  }

  function toggle(id: number) {
    setStore(p => ({ ...p, [activeCat]: p[activeCat].map(i => i.id === id ? { ...i, estado: (i.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : i) }));
  }

  function switchCat(cat: TipoCatalogo) {
    setActiveCat(cat);
    setSearch('');
    setModal(null);
  }

  const activos = items.filter(i => i.estado === 'activo').length;
  const total = Object.values(store).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><BookOpen size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{CATALOGOS_CONFIG.length}</span><span className="adm-kpi-lbl">Catálogos</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><BookOpen size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{total}</span><span className="adm-kpi-lbl">Registros totales</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><BookOpen size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos en este catálogo</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><BookOpen size={15} /> Catálogos Base</h4><p className="cg-tab-subtitle">Listas de referencia para personal, EPS, ARL, municipios y más</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Agregar</button>
      </div>

      {/* Catalog selector */}
      <div className="cg-cat-tabs">
        {CATALOGOS_CONFIG.map(c => (
          <button key={c.id} className={`cg-cat-tab ${activeCat === c.id ? 'active' : ''}`} onClick={() => switchCat(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Selected catalog */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="cg-filters" style={{ marginBottom: 0, flex: 1 }}>
          <div className="cg-search"><Search size={14} /><input placeholder={`Buscar en ${cfg.label}…`} value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead>
            <tr>
              {cfg.showCodigo && <th>Código</th>}
              <th>Nombre</th>
              {activeCat === 'municipios' && <th>Departamento</th>}
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} className="cg-table-empty">Sin registros en este catálogo</td></tr>}
            {filtered.map(i => (
              <tr key={i.id}>
                {cfg.showCodigo && <td><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-info)' }}>{i.codigo ?? '—'}</span></td>}
                <td style={{ fontWeight: 600 }}>{i.nombre}</td>
                {activeCat === 'municipios' && <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{i.descripcion ?? '—'}</td>}
                <td><span className={`adm-badge ${i.estado === 'activo' ? 'active' : 'inactive'}`}>{i.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(i)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${i.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggle(i.id)}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? `Agregar a ${cfg.label}` : `Editar registro`} onClose={() => setModal(null)} onSave={handleSave}>
          <div className="adm-form-grid">
            <div className="adm-field" style={{ gridColumn: cfg.showCodigo ? undefined : '1 / -1' }}><label className="adm-label">Nombre *</label><input className="adm-input" value={form.nombre} onChange={e => f('nombre', e.target.value)} /></div>
            {cfg.showCodigo && <div className="adm-field"><label className="adm-label">Código</label><input className="adm-input" value={form.codigo ?? ''} onChange={e => f('codigo', e.target.value)} placeholder="Ej: CC, CTF…" /></div>}
            {activeCat === 'municipios' && <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Departamento</label><input className="adm-input" value={form.descripcion ?? ''} onChange={e => f('descripcion', e.target.value)} /></div>}
            <div className="adm-field"><label className="adm-label">Estado</label>
              <select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}>{err}</div>}
        </FormModal>
      )}
    </div>
  );
}
