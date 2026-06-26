import { useState } from 'react';
import { AlertTriangle, ClipboardList, Edit2, Plus, Power, Search } from 'lucide-react';
import type { EstadoGeneral, RequisitoDocumental } from '../cg.types';
import { MOCK_REQUISITOS } from '../cg.mock';
import { FormModal } from '../components/FormModal';
import { MockBanner } from '../components/MockBanner';

type Form = Omit<RequisitoDocumental, 'id'>;
const blank = (): Form => ({ nombre_documento: '', aplica_empresa: true, aplica_contrato: false, aplica_cargo: false, aplica_tipo_vinculacion: false, obligatorio: true, vigencia_dias: undefined, renovacion_automatica: false, alerta_dias_antes: undefined, estado: 'activo' });

function Bool({ v }: { v: boolean }) {
  return <span className={`cg-bool ${v ? 'si' : 'no'}`}>{v ? 'Sí' : 'No'}</span>;
}

export function RequisitosTab() {
  const [items, setItems] = useState<RequisitoDocumental[]>(MOCK_REQUISITOS);
  const [search, setSearch] = useState('');
  const [filtroObligo, setFiltroObligo] = useState('');
  const [modal, setModal] = useState<null | 'new' | RequisitoDocumental>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));

  const filtered = items.filter(r => {
    const matchSearch = r.nombre_documento.toLowerCase().includes(search.toLowerCase());
    const matchObligo = !filtroObligo || String(r.obligatorio) === filtroObligo;
    return matchSearch && matchObligo;
  });

  function openNew() { setForm(blank()); setErr(''); setModal('new'); }
  function openEdit(r: RequisitoDocumental) { setForm({ nombre_documento: r.nombre_documento, aplica_empresa: r.aplica_empresa, aplica_contrato: r.aplica_contrato, aplica_cargo: r.aplica_cargo, aplica_tipo_vinculacion: r.aplica_tipo_vinculacion, obligatorio: r.obligatorio, vigencia_dias: r.vigencia_dias, renovacion_automatica: r.renovacion_automatica, alerta_dias_antes: r.alerta_dias_antes, estado: r.estado }); setErr(''); setModal(r); }

  function handleSave() {
    if (!form.nombre_documento.trim()) { setErr('El nombre del documento es obligatorio'); return; }
    if (modal === 'new') {
      setItems(p => [{ ...form, id: Date.now() }, ...p]);
    } else {
      const id = (modal as RequisitoDocumental).id;
      setItems(p => p.map(r => r.id === id ? { ...form, id } : r));
    }
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(r => r.id === id ? { ...r, estado: (r.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : r));
  }

  const obligatorios = items.filter(r => r.obligatorio && r.estado === 'activo').length;
  const conVigencia = items.filter(r => r.vigencia_dias !== undefined && r.estado === 'activo').length;

  function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <div className="cg-toggle-row">
        <span className="cg-toggle-label">{label}</span>
        <label className="cg-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="cg-toggle-slider" /></label>
      </div>
    );
  }

  return (
    <div>
      <MockBanner entity="Requisitos Documentales" />
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><ClipboardList size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Requisitos</span></div></div>
        <div className="adm-kpi danger"><div className="adm-kpi-icon"><ClipboardList size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{obligatorios}</span><span className="adm-kpi-lbl">Obligatorios</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><ClipboardList size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{conVigencia}</span><span className="adm-kpi-lbl">Con vigencia</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><ClipboardList size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.filter(r => r.renovacion_automatica).length}</span><span className="adm-kpi-lbl">Renovación auto</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><ClipboardList size={15} /> Requisitos Documentales</h4><p className="cg-tab-subtitle">Documentos requeridos por empresa, contrato, cargo o tipo de vinculación</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nuevo requisito</button>
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar documento…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 160, height: 36 }} value={filtroObligo} onChange={e => setFiltroObligo(e.target.value)}>
          <option value="">Todos</option>
          <option value="true">Obligatorios</option>
          <option value="false">Opcionales</option>
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Empresa</th>
              <th>Contrato</th>
              <th>Cargo</th>
              <th>Vinculación</th>
              <th>Obligatorio</th>
              <th>Vigencia</th>
              <th>Alerta</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.nombre_documento}</td>
                <td style={{ textAlign: 'center' }}><Bool v={r.aplica_empresa} /></td>
                <td style={{ textAlign: 'center' }}><Bool v={r.aplica_contrato} /></td>
                <td style={{ textAlign: 'center' }}><Bool v={r.aplica_cargo} /></td>
                <td style={{ textAlign: 'center' }}><Bool v={r.aplica_tipo_vinculacion} /></td>
                <td style={{ textAlign: 'center' }}><Bool v={r.obligatorio} /></td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>{r.vigencia_dias ? `${r.vigencia_dias} días` : '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>{r.alerta_dias_antes ? `${r.alerta_dias_antes} días` : '—'}</td>
                <td><span className={`adm-badge ${r.estado === 'activo' ? 'active' : 'inactive'}`}>{r.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
                <td><div className="cg-actions">
                  <button className="adm-btn ghost sm" onClick={() => openEdit(r)} title="Editar"><Edit2 size={13} /></button>
                  <button className={`adm-btn sm ${r.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(r.id)}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal === 'new' ? 'Nuevo requisito' : `Editar: ${(modal as RequisitoDocumental).nombre_documento}`} onClose={() => setModal(null)} onSave={handleSave} wide>
          <div className="adm-form-grid">
            <div className="adm-field" style={{ gridColumn: '1 / -1' }}><label className="adm-label">Nombre del documento *</label><input className="adm-input" value={form.nombre_documento} onChange={e => f('nombre_documento', e.target.value)} placeholder="Ej: Certificación Bancaria, Afiliación ARL…" /></div>
            <div className="adm-field"><label className="adm-label">Vigencia (días)</label><input className="adm-input" type="number" min={0} placeholder="Sin vigencia" value={form.vigencia_dias ?? ''} onChange={e => f('vigencia_dias', e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div className="adm-field"><label className="adm-label">Alerta antes de vencimiento (días)</label><input className="adm-input" type="number" min={0} placeholder="Sin alerta" value={form.alerta_dias_antes ?? ''} onChange={e => f('alerta_dias_antes', e.target.value ? Number(e.target.value) : undefined)} /></div>
            <div className="adm-field"><label className="adm-label">Estado</label><select className="adm-select" value={form.estado} onChange={e => f('estado', e.target.value as EstadoGeneral)}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Aplica para</p>
            <div className="cg-toggle-wrap">
              <ToggleField label="Aplica por empresa" checked={form.aplica_empresa} onChange={v => f('aplica_empresa', v)} />
              <ToggleField label="Aplica por contrato" checked={form.aplica_contrato} onChange={v => f('aplica_contrato', v)} />
              <ToggleField label="Aplica por cargo" checked={form.aplica_cargo} onChange={v => f('aplica_cargo', v)} />
              <ToggleField label="Aplica por tipo de vinculación" checked={form.aplica_tipo_vinculacion} onChange={v => f('aplica_tipo_vinculacion', v)} />
            </div>
            <div className="cg-toggle-wrap" style={{ marginTop: 8 }}>
              <ToggleField label="Obligatorio" checked={form.obligatorio} onChange={v => f('obligatorio', v)} />
              <ToggleField label="Renovación automática" checked={form.renovacion_automatica} onChange={v => f('renovacion_automatica', v)} />
            </div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
