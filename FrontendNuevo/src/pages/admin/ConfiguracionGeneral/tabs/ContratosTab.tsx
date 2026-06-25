import { useState } from 'react';
import { AlertTriangle, Calendar, Edit2, FileText, Plus, Power, Search } from 'lucide-react';
import type { Contrato, EstadoContrato } from '../cg.types';
import { MOCK_CONTRATOS, MOCK_EMPRESAS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type Form = Omit<Contrato, 'id'> & { municipiosRaw: string };
const blank = (): Form => ({ empresa_id: MOCK_EMPRESAS[0]?.id ?? 1, numero_contrato: '', cliente: '', objeto_contractual: '', fecha_inicio: '', fecha_fin: '', estado: 'activo', municipios: [], municipiosRaw: '', observaciones: '' });

function estadoBadge(e: EstadoContrato) {
  if (e === 'activo')    return <span className="adm-badge active">Activo</span>;
  if (e === 'por_vencer') return <span className="adm-badge warning">Por vencer</span>;
  return <span className="adm-badge inactive">Inactivo</span>;
}

export function ContratosTab() {
  const [items, setItems] = useState<Contrato[]>(MOCK_CONTRATOS);
  const [search, setSearch] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal] = useState<null | 'new' | Contrato>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));

  const nombreEmpresa = (id: number) => MOCK_EMPRESAS.find(e => e.id === id)?.nombre ?? '—';

  const filtered = items.filter(c => {
    const matchSearch = c.numero_contrato.toLowerCase().includes(search.toLowerCase()) || c.cliente.toLowerCase().includes(search.toLowerCase());
    const matchEmpresa = !filtroEmpresa || String(c.empresa_id) === filtroEmpresa;
    const matchEstado = !filtroEstado || c.estado === filtroEstado;
    return matchSearch && matchEmpresa && matchEstado;
  });

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(c: Contrato) {
    setForm({ ...c, municipiosRaw: c.municipios.join(', ') });
    setErr('');
    setModal(c);
  }

  function handleSave() {
    if (!form.numero_contrato.trim()) { setErr('El número de contrato es obligatorio'); return; }
    if (!form.cliente.trim()) { setErr('El cliente es obligatorio'); return; }
    if (!form.fecha_inicio || !form.fecha_fin) { setErr('Las fechas son obligatorias'); return; }
    if (form.fecha_fin < form.fecha_inicio) { setErr('La fecha de fin debe ser posterior a la de inicio'); return; }

    const municipios = form.municipiosRaw.split(',').map(s => s.trim()).filter(Boolean);
    const record = { ...form, municipios };
    delete (record as { municipiosRaw?: string }).municipiosRaw;

    if (modal === 'new') {
      setItems(p => [{ ...record, id: Date.now() } as Contrato, ...p]);
    } else {
      const id = (modal as Contrato).id;
      setItems(p => p.map(c => c.id === id ? { ...record, id } as Contrato : c));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(c => c.id === id ? { ...c, estado: (c.estado === 'activo' ? 'inactivo' : 'activo') as EstadoContrato } : c));
  }

  const activos = items.filter(c => c.estado === 'activo').length;
  const porVencer = items.filter(c => c.estado === 'por_vencer').length;
  const municipiosUnicos = new Set(items.flatMap(c => c.municipios)).size;

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><FileText size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Total contratos</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><FileText size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi warning"><div className="adm-kpi-icon"><AlertTriangle size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{porVencer}</span><span className="adm-kpi-lbl">Por vencer</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><Calendar size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{municipiosUnicos}</span><span className="adm-kpi-lbl">Municipios cubiertos</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><FileText size={15} /> Contratos</h4><p className="cg-tab-subtitle">Contratos por empresa con municipios y vigencias</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nuevo contrato</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por nº contrato o cliente…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 180, height: 36 }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option value="">Todas las empresas</option>
          {MOCK_EMPRESAS.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
        </select>
        <select className="adm-select" style={{ width: 140, height: 36 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="por_vencer">Por vencer</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead><tr><th>Contrato</th><th>Empresa</th><th>Cliente</th><th>Municipios</th><th>Vigencia</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(c => (
              <tr key={c.id}>
                <td><div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{c.numero_contrato}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 220 }}>{c.objeto_contractual.slice(0, 60)}…</div></td>
                <td style={{ fontSize: 12 }}>{nombreEmpresa(c.empresa_id)}</td>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{c.cliente}</td>
                <td>
                  <div className="cg-chips">
                    {c.municipios.slice(0, 2).map(m => <span key={m} className="cg-chip">{m}</span>)}
                    {c.municipios.length > 2 && <span className="cg-chip more">+{c.municipios.length - 2}</span>}
                  </div>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.fecha_inicio} → {c.fecha_fin}</td>
                <td>{estadoBadge(c.estado)}</td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(c)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${c.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(c.id)} title={c.estado !== 'inactivo' ? 'Inactivar' : 'Activar'}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nuevo contrato' : `Editar: ${(modal as Contrato).numero_contrato}`} onClose={() => setModal(null)} onSave={handleSave} wide>
          <div className="adm-form-grid">
            <div className="adm-field"><label className="adm-label">Empresa *</label>
              <select className="adm-select" value={form.empresa_id} onChange={e => f('empresa_id', Number(e.target.value))}>
                {MOCK_EMPRESAS.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Nº Contrato *</label><input className="adm-input" value={form.numero_contrato} onChange={e => f('numero_contrato', e.target.value)} placeholder="EMP-2026-001" /></div>
            <div className="adm-field"><label className="adm-label">Cliente *</label><input className="adm-input" value={form.cliente} onChange={e => f('cliente', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Estado</label>
              <select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoContrato)}>
                <option value="activo">Activo</option>
                <option value="por_vencer">Por vencer</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Fecha inicio *</label><input className="adm-input" type="date" value={form.fecha_inicio} onChange={e => f('fecha_inicio', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Fecha fin *</label><input className="adm-input" type="date" value={form.fecha_fin} onChange={e => f('fecha_fin', e.target.value)} /></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Objeto contractual</label><textarea className="adm-textarea" value={form.objeto_contractual} onChange={e => f('objeto_contractual', e.target.value)} rows={2} /></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Municipios (separados por coma)</label><input className="adm-input" value={form.municipiosRaw} onChange={e => f('municipiosRaw', e.target.value)} placeholder="Acacías, Villavicencio, Granada" /></div>
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Observaciones</label><textarea className="adm-textarea" value={form.observaciones ?? ''} onChange={e => f('observaciones', e.target.value)} rows={2} /></div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
