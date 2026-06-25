import { useState } from 'react';
import { AlertTriangle, Banknote, Plus, Power, Search } from 'lucide-react';
import type { EstadoGeneral, SalarioPersonal } from '../cg.types';
import { MOCK_SALARIOS, MOCK_EMPRESAS, MOCK_CONTRATOS, MOCK_CARGOS } from '../cg.mock';
import { FormModal } from '../components/FormModal';

type Form = Omit<SalarioPersonal, 'id' | 'version'>;
const blank = (): Form => ({ empresa_id: MOCK_EMPRESAS[0]?.id ?? 1, contrato_id: MOCK_CONTRATOS[0]?.id ?? 1, cargo_id: undefined, tipo_vinculacion: 'CTF', salario_base: 0, auxilio_transporte: 0, auxilios_adicionales: 0, valor_dia: 0, valor_turno: 0, recargos: 0, deducciones: 0, vigencia_desde: new Date().toISOString().slice(0, 10), vigencia_hasta: undefined, estado: 'activo' });

function fmtCOP(v: number) { return '$' + Math.round(v).toLocaleString('es-CO'); }

export function SalariosTab() {
  const [items, setItems] = useState<SalarioPersonal[]>(MOCK_SALARIOS);
  const [search, setSearch] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activo');
  const [modal, setModal] = useState<null | 'new' | SalarioPersonal>(null);
  const [form, setForm] = useState<Form>(blank());
  const [err, setErr] = useState('');
  const [historialId] = useState<number | null>(null);

  const f = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }));
  const empNombre = (id?: number) => MOCK_EMPRESAS.find(e => e.id === id)?.nombre ?? '—';
  const conNombre = (id?: number) => MOCK_CONTRATOS.find(c => c.id === id)?.numero_contrato ?? '—';
  const cargoNombre = (id?: number) => id ? (MOCK_CARGOS.find(c => c.id === id)?.nombre ?? '—') : 'General';
  const contratosDeEmpresa = form.empresa_id ? MOCK_CONTRATOS.filter(c => c.empresa_id === form.empresa_id) : MOCK_CONTRATOS;
  const cargosDeContrato = form.contrato_id ? MOCK_CARGOS.filter(c => c.contrato_id === form.contrato_id) : MOCK_CARGOS;

  const filtered = items.filter(s => {
    const matchSearch = cargoNombre(s.cargo_id).toLowerCase().includes(search.toLowerCase()) || conNombre(s.contrato_id).toLowerCase().includes(search.toLowerCase());
    const matchEmpresa = !filtroEmpresa || String(s.empresa_id) === filtroEmpresa;
    const matchEstado = !filtroEstado || s.estado === filtroEstado;
    return matchSearch && matchEmpresa && matchEstado;
  });

  function openNew() {
    setForm(blank());
    setErr('');
    setModal('new');
  }

  function handleSave() {
    if (form.salario_base < 0) { setErr('El salario base no puede ser negativo'); return; }
    if (!form.vigencia_desde) { setErr('La vigencia desde es obligatoria'); return; }
    if (form.vigencia_hasta && form.vigencia_hasta < form.vigencia_desde) { setErr('Vigencia hasta debe ser posterior a vigencia desde'); return; }

    // Deactivate current active version for same empresa+contrato+cargo
    const maxVersion = items.filter(s => s.empresa_id === form.empresa_id && s.contrato_id === form.contrato_id && s.cargo_id === form.cargo_id).reduce((acc, s) => Math.max(acc, s.version), 0);

    setItems(prev => {
      const deactivated = prev.map(s => s.empresa_id === form.empresa_id && s.contrato_id === form.contrato_id && s.cargo_id === form.cargo_id && s.estado === 'activo' ? { ...s, estado: 'inactivo' as EstadoGeneral } : s);
      const newRecord: SalarioPersonal = { ...form, id: Date.now(), version: maxVersion + 1 };
      return [newRecord, ...deactivated];
    });
    setModal(null);
  }

  function toggleEstado(id: number) {
    setItems(p => p.map(s => s.id === id ? { ...s, estado: (s.estado === 'activo' ? 'inactivo' : 'activo') as EstadoGeneral } : s));
  }

  const activos = items.filter(s => s.estado === 'activo').length;
  void historialId;

  return (
    <div>
      <div className="adm-kpi-row">
        <div className="adm-kpi primary"><div className="adm-kpi-icon"><Banknote size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length}</span><span className="adm-kpi-lbl">Registros totales</span></div></div>
        <div className="adm-kpi success"><div className="adm-kpi-icon"><Banknote size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{activos}</span><span className="adm-kpi-lbl">Activos</span></div></div>
        <div className="adm-kpi info"><div className="adm-kpi-icon"><Banknote size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{items.length - activos}</span><span className="adm-kpi-lbl">Versiones históricas</span></div></div>
        <div className="adm-kpi warning"><div className="adm-kpi-icon"><Banknote size={16} /></div><div className="adm-kpi-body"><span className="adm-kpi-val">{fmtCOP(items.filter(s => s.estado === 'activo').reduce((a, s) => a + s.salario_base, 0) / Math.max(activos, 1))}</span><span className="adm-kpi-lbl">Promedio salario base</span></div></div>
      </div>

      <div className="cg-tab-header">
        <div><h4 className="cg-tab-title"><Banknote size={15} /> Salarios</h4><p className="cg-tab-subtitle">Versionado de salarios por cargo, contrato y vinculación — sin sobreescritura</p></div>
        <button className="adm-btn primary" onClick={openNew}><Plus size={14} /> Nueva versión</button>
      </div>

      <div className="adm-notice info" style={{ marginBottom: 14, fontSize: 12 }}>
        Al crear una nueva versión de salario, la versión activa anterior se inactivará automáticamente. Los registros históricos no se eliminan.
      </div>

      <div className="cg-filters">
        <div className="cg-search"><Search size={14} /><input placeholder="Buscar por cargo o contrato…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="adm-select" style={{ width: 180, height: 36 }} value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option value="">Todas las empresas</option>
          {MOCK_EMPRESAS.map(e => <option key={e.id} value={String(e.id)}>{e.nombre}</option>)}
        </select>
        <select className="adm-select" style={{ width: 140, height: 36 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Histórico</option>
        </select>
      </div>

      <div className="cg-table-card">
        <table className="adm-history">
          <thead>
            <tr><th>V.</th><th>Cargo</th><th>Empresa / Contrato</th><th>Tipo Vinc.</th><th>Salario base</th><th>Aux. Transporte</th><th>Valor día</th><th>Vigencia</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="cg-table-empty">Sin resultados</td></tr>}
            {filtered.map(s => (
              <tr key={s.id} className={s.estado === 'activo' ? 'cg-row-active' : ''}>
                <td><span className="adm-badge primary" style={{ fontSize: 10 }}>v{s.version}</span></td>
                <td style={{ fontWeight: 600 }}>{cargoNombre(s.cargo_id)}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{empNombre(s.empresa_id)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{conNombre(s.contrato_id)}</div>
                </td>
                <td><span className="adm-badge info" style={{ fontSize: 11 }}>{s.tipo_vinculacion ?? '—'}</span></td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{fmtCOP(s.salario_base)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtCOP(s.auxilio_transporte)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtCOP(s.valor_dia)}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <div>{s.vigencia_desde}</div>
                  {s.vigencia_hasta && <div>→ {s.vigencia_hasta}</div>}
                </td>
                <td><span className={`adm-badge ${s.estado === 'activo' ? 'active' : 'inactive'}`}>{s.estado === 'activo' ? 'Activo' : 'Histórico'}</span></td>
                <td><div className="cg-actions">
                  <button className={`adm-btn sm ${s.estado === 'activo' ? 'danger-outline' : 'secondary'}`} onClick={() => toggleEstado(s.id)}><Power size={12} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === 'new' && (
        <FormModal title="Nueva versión de salario" onClose={() => setModal(null)} onSave={handleSave} wide saveLabel="Guardar y activar">
          <div className="adm-form-grid cols-3">
            <div className="adm-field"><label className="adm-label">Empresa *</label>
              <select className="adm-select" value={form.empresa_id} onChange={e => { f('empresa_id', Number(e.target.value)); f('contrato_id', undefined); f('cargo_id', undefined); }}>
                {MOCK_EMPRESAS.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Contrato</label>
              <select className="adm-select" value={form.contrato_id ?? ''} onChange={e => { f('contrato_id', e.target.value ? Number(e.target.value) : undefined); f('cargo_id', undefined); }}>
                <option value="">General (todos)</option>
                {contratosDeEmpresa.map(c => <option key={c.id} value={c.id}>{c.numero_contrato}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Cargo</label>
              <select className="adm-select" value={form.cargo_id ?? ''} onChange={e => f('cargo_id', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">General (todos)</option>
                {cargosDeContrato.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Tipo vinculación</label>
              <select className="adm-select" value={form.tipo_vinculacion ?? ''} onChange={e => f('tipo_vinculacion', e.target.value || undefined)}>
                <option value="">General</option>
                <option value="CTF">CTF – Término fijo</option>
                <option value="CTI">CTI – Término indefinido</option>
                <option value="OPS">OPS – Prestación de servicios</option>
              </select>
            </div>
            <div className="adm-field"><label className="adm-label">Vigencia desde *</label><input className="adm-input" type="date" value={form.vigencia_desde} onChange={e => f('vigencia_desde', e.target.value)} /></div>
            <div className="adm-field"><label className="adm-label">Vigencia hasta</label><input className="adm-input" type="date" value={form.vigencia_hasta ?? ''} onChange={e => f('vigencia_hasta', e.target.value || undefined)} /></div>
            <div className="adm-field"><label className="adm-label">Salario base *</label><input className="adm-input" type="number" min={0} value={form.salario_base} onChange={e => f('salario_base', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Auxilio de transporte</label><input className="adm-input" type="number" min={0} value={form.auxilio_transporte} onChange={e => f('auxilio_transporte', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Auxilios adicionales</label><input className="adm-input" type="number" min={0} value={form.auxilios_adicionales} onChange={e => f('auxilios_adicionales', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Valor día</label><input className="adm-input" type="number" min={0} value={form.valor_dia} onChange={e => f('valor_dia', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Valor turno</label><input className="adm-input" type="number" min={0} value={form.valor_turno} onChange={e => f('valor_turno', Number(e.target.value))} /></div>
            <div className="adm-field"><label className="adm-label">Deducciones fijas</label><input className="adm-input" type="number" min={0} value={form.deducciones} onChange={e => f('deducciones', Number(e.target.value))} /></div>
          </div>
          {err && <div className="adm-notice warning" style={{ marginTop: 8 }}><AlertTriangle size={13} /> {err}</div>}
        </FormModal>
      )}
    </div>
  );
}
