import { useState } from 'react';
import { AlertTriangle, Briefcase, Edit2, Plus, Power, Search } from 'lucide-react';
import type { Cargo, EstadoGeneral } from '../cg.types';
import { TIPOS_CARGO } from '../cg.types';
import { MOCK_CARGOS, MOCK_CONTRATOS, MOCK_EMPRESAS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type Form = Omit<Cargo, 'id'>;
const blank = (): Form => ({ empresa_id: MOCK_EMPRESAS[0]?.id ?? 1, contrato_id: MOCK_CONTRATOS[0]?.id ?? 1, nombre: '', tipo_cargo: TIPOS_CARGO[0], cantidad_requerida: 1, aplica_cobertura: true, aplica_nomina: true, aplica_portal: false, salario_base: 0, estado: 'activo' });

function fmtCOP(v?: number) { if (!v) return '—'; return '$' + Math.round(v).toLocaleString('es-CO'); }

export function CargosTab() {
  const [items, setItems] = useState<Cargo[]>(MOCK_CARGOS);
  const [search, setSearch] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [modal, setModal] = useState<null | 'new' | Cargo>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));
  const empNombre = (id: number) => MOCK_EMPRESAS.find(e => e.id === id)?.nombre ?? '—';
  const conNombre = (id: number) => MOCK_CONTRATOS.find(c => c.id === id)?.numero_contrato ?? '—';
  const contratosDeEmpresa = form.empresa_id ? MOCK_CONTRATOS.filter(c => c.empresa_id === form.empresa_id) : MOCK_CONTRATOS;

  const filtered = items.filter(c => {
    const matchSearch = c.nombre.toLowerCase().includes(search.toLowerCase());
    const matchEmpresa = !filtroEmpresa || String(c.empresa_id) === filtroEmpresa;
    const matchContrato = !filtroContrato || String(c.contrato_id) === filtroContrato;
    return matchSearch && matchEmpresa && matchContrato;
  });

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(c: Cargo) { setForm({ empresa_id: c.empresa_id, contrato_id: c.contrato_id, nombre: c.nombre, tipo_cargo: c.tipo_cargo, cantidad_requerida: c.cantidad_requerida, aplica_cobertura: c.aplica_cobertura, aplica_nomina: c.aplica_nomina, aplica_portal: c.aplica_portal, salario_base: c.salario_base, estado: c.estado }); setErr(''); setModal(c); }

  function handleSave() {
    if (!form.nombre.trim()) { setErr('El nombre del cargo es obligatorio'); return; }
    if (!form.contrato_id) { setErr('Debe seleccionar un contrato'); return; }
    if (form.cantidad_requerida < 1) { setErr('La cantidad requerida debe ser mayor a 0'); return; }
    if (modal === 'new') {
      setItems(p => [{ ...form, id: Date.now() }, ...p]);
    } else {
      const id = (modal as Cargo).id;
      setItems(p => p.map(c => c.id === id ? { ...form, id } : c));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(c => c.id === id ? { ...c, estado: (c.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : c));
  }

  const activos = items.filter(c => c.estado === 'activo').length;
  const totalCupos = items.filter(c => c.estado === 'activo').reduce((acc, c) => acc + c.cantidad_requerida, 0);

  function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="cg-toggle-row">
        <span className="cg-toggle-label">{label}</span>
        <label className="cg-toggle">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
          <span className="cg-toggle-slider" />
        </label>
      </div>
    );
  }

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><Briefcase size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Cargos configurados</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><Briefcase size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><Briefcase size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{totalCupos}</span><span className="adm-kpi-lbl">Cupos requeridos</span></div></div>
        <div className="adm-kpi neutral"><div className="adm-kpi-icon"><Briefcase size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length - activos}</span><span className="adm-kpi-lbl">Inactivos</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><Briefcase size={15} /> Cargos</h4><p className="cg-tab-subtitle">Configuración de cargos por contrato y empresa</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nuevo cargo</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por nombre de cargo…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 180, height: 36 }} value={filtroEmpresa} onChange={e => { setFiltroEmpresa(e.target.value); setFiltroContrato(''); }}>
          <option value="">Todas las empresas</option>
          {MOCK_EMPRESAS.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
        </select>
        <select className="adm-select" style={{ width: 180, height: 36 }} value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)}>
          <option value="">Todos los contratos</option>
          {(filtroEmpresa ? MOCK_CONTRATOS.filter(c => String(c.empresa_id) === filtroEmpresa) : MOCK_CONTRATOS).map(c => <option key={c.id} value={String(c.id)}>{c.numero_contrato}</option>)}
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead><tr><th>Cargo</th><th>Empresa / Contrato</th><th>Tipo</th><th>Cupos</th><th>Aplica en</th><th>Salario base</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 700 }}>{c.nombre}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{empNombre(c.empresa_id)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{conNombre(c.contrato_id)}</div>
                </td>
                <td><span className="adm-badge info" style={{ fontSize: 11 }}>{c.tipo_cargo}</span></td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.cantidad_requerida}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {c.aplica_cobertura && <span className="cg-bool si">Cobertura</span>}
                    {c.aplica_nomina && <span className="cg-bool si">Nómina</span>}
                    {c.aplica_portal && <span className="cg-bool si">Portal</span>}
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtCOP(c.salario_base)}</td>
                <td><span className={`adm-badge ${c.estado === 'activo' ? 'active' : 'inactive'}`}>{c.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(c)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${c.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(c.id)}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nuevo cargo' : `Editar: ${(modal as Cargo).nombre}`} onClose={() => setModal(null)} onSave={handleSave} wide>
          <div className="adm-form-grid">
            <div className="adm-field"><label className="adm-label">Empresa *</label>
              <select className="adm-select" value={form.empresa_id} onChange={e => { f('empresa_id', Number(e.target.value)); f('contrato_id', 0); }}>
                {MOCK_EMPRESAS.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Contrato *</label>
              <select className="adm-select" value={form.contrato_id} onChange={e => f('contrato_id', Number(e.target.value))}>
                <option value={0}>— Seleccionar —</option>
                {contratosDeEmpresa.map(c => <option key={c.id} value={c.id}>{c.numero_contrato} – {c.cliente}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Nombre del cargo *</label><input className="adm-input" value={form.nombre} onChange={e => f('nombre', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Tipo de cargo</label>
              <select className="adm-select" value={form.tipo_cargo} onChange={e => f('tipo_cargo', e.target.value)}>
                {TIPOS_CARGO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Cantidad requerida</label><input className="adm-input" type="number" min={1} value={form.cantidad_requerida} onChange={e => f('cantidad_requerida', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Salario base</label><input className="adm-input" type="number" min={0} value={form.salario_base ?? 0} onChange={e => f('salario_base', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Estado</label>
              <select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="cg-toggle-wrap" style={{ marginTop: 12 }}>
            <ToggleField label="Aplica cobertura" checked={form.aplica_cobertura} onChange={v => f('aplica_cobertura', v)} />
            <ToggleField label="Aplica nómina" checked={form.aplica_nomina} onChange={v => f('aplica_nomina', v)} />
            <ToggleField label="Aplica portal colaborador" checked={form.aplica_portal} onChange={v => f('aplica_portal', v)} />
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
