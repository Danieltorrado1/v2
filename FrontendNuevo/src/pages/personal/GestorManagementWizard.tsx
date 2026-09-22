import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { ApiClientError } from '../../services/apiClient';
import { getGestorWizardData, saveGestorWizard } from '../../services/vinculacionesApi';
import type { GestorWizardData, SaveGestorWizardPayload } from '../../types/vinculaciones.types';

type Scope = { alcance: 'FULL' | 'PARTIAL'; institucion_ids: number[]; vinculacion_ids: number[] };

export default function GestorManagementWizard({ contratoId, fecha, onClose, onSaved }: { contratoId: number; fecha?: string; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<GestorWizardData | null>(null);
  const [gestorId, setGestorId] = useState<number | null>(null);
  const [municipios, setMunicipios] = useState<number[]>([]);
  const [scopes, setScopes] = useState<Record<number, Scope>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { void getGestorWizardData({ contrato_id: contratoId, fecha }).then((result) => {
    setData(result);
    setLoading(false);
  }).catch((err) => { setError(err instanceof ApiClientError ? err.message : 'No fue posible cargar gestores'); setLoading(false); }); }, [contratoId, fecha]);

  useEffect(() => {
    if (!gestorId) return;
    void getGestorWizardData({ contrato_id: contratoId, gestor_usuario_id: gestorId, fecha }).then((result) => {
      setData(result);
      setMunicipios(result.current.municipios);
      const next: Record<number, Scope> = {};
      result.current.municipios.forEach((id) => { next[id] = { alcance: 'FULL', institucion_ids: [], vinculacion_ids: [] }; });
      result.current.instituciones.forEach((id) => { const m = result.instituciones.find((item) => item.id === id)?.municipio_id; if (m) next[m] = { ...(next[m] ?? { alcance: 'PARTIAL', institucion_ids: [], vinculacion_ids: [] }), alcance: 'PARTIAL', institucion_ids: [...(next[m]?.institucion_ids ?? []), id] }; });
      result.current.vinculaciones.forEach((id) => { const p = result.personas.find((item) => item.id === id); if (p) next[p.municipio_id] = { ...(next[p.municipio_id] ?? { alcance: 'PARTIAL', institucion_ids: [], vinculacion_ids: [] }), alcance: 'PARTIAL', vinculacion_ids: [...(next[p.municipio_id]?.vinculacion_ids ?? []), id] }; });
      setScopes(next);
    }).catch((err) => setError(err instanceof ApiClientError ? err.message : 'No fue posible cargar la asignación actual'));
  }, [contratoId, gestorId, fecha]);

  const filteredGestores = useMemo(() => (data?.gestores ?? []).filter((g) => `${g.nombre} ${g.id}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const selectedMunicipios = (data?.municipios ?? []).filter((m) => municipios.includes(m.id));
  const toggleMunicipio = (id: number) => setMunicipios((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const updateScope = (id: number, patch: Partial<Scope>) => setScopes((current) => ({ ...current, [id]: { ...(current[id] ?? { alcance: 'FULL', institucion_ids: [], vinculacion_ids: [] }), ...patch } }));
  const payload: SaveGestorWizardPayload | null = gestorId ? { contrato_id: contratoId, gestor_usuario_id: gestorId, fecha, municipios: selectedMunicipios.map((m) => ({ municipio_id: m.id, ...(scopes[m.id] ?? { alcance: 'FULL', institucion_ids: [], vinculacion_ids: [] }) })) } : null;
  const save = async () => { if (!payload) return; setSaving(true); setError(''); try { await saveGestorWizard(payload); onSaved(); } catch (err) { setError(err instanceof ApiClientError ? err.message : 'No fue posible guardar la asignación'); } finally { setSaving(false); } };

  return <div className="op-modal-backdrop" role="dialog" aria-modal="true" aria-label="Gestionar gestores">
    <section className="op-management-wizard">
      <header className="op-modal-header"><div><strong>Gestionar gestores</strong><small>Paso {step} de 3</small></div><button type="button" className="op-icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>
      {error && <div className="op-state error" role="alert">{error}</div>}
      {loading ? <div className="op-state">Cargando...</div> : <>
        <div className="op-wizard-steps"><span className={step >= 1 ? 'is-active' : ''}>1 Gestor</span><span className={step >= 2 ? 'is-active' : ''}>2 Municipios</span><span className={step >= 3 ? 'is-active' : ''}>3 Cobertura</span></div>
        {step === 1 && <div className="op-wizard-body"><label className="op-search"><Search size={15} /><input placeholder="Buscar gestor por nombre o documento" value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="op-wizard-list">{filteredGestores.map((g) => <button type="button" className={`op-wizard-card ${gestorId === g.id ? 'is-selected' : ''}`} key={g.id} onClick={() => setGestorId(g.id)}><span>{g.nombre}</span><small>{g.roles.join(', ')} · {g.activo ? 'Activo' : 'Inactivo'}</small>{gestorId === g.id && <Check size={16} />}</button>)}</div></div>}
        {step === 2 && <div className="op-wizard-body"><p>Selecciona uno o varios municipios del contrato.</p><div className="op-wizard-checks">{data?.municipios.map((m) => <label key={m.id}><input type="checkbox" checked={municipios.includes(m.id)} onChange={() => toggleMunicipio(m.id)} />{m.nombre}</label>)}</div></div>}
        {step === 3 && <div className="op-wizard-body">{selectedMunicipios.map((m) => { const scope = scopes[m.id] ?? { alcance: 'FULL', institucion_ids: [], vinculacion_ids: [] }; const institutions = data?.instituciones.filter((i) => i.municipio_id === m.id) ?? []; const people = data?.personas.filter((p) => p.municipio_id === m.id) ?? []; return <article className="op-wizard-scope" key={m.id}><h4>{m.nombre}</h4><label><input type="radio" checked={scope.alcance === 'FULL'} onChange={() => updateScope(m.id, { alcance: 'FULL' })} /> Municipio completo</label><label><input type="radio" checked={scope.alcance === 'PARTIAL'} onChange={() => updateScope(m.id, { alcance: 'PARTIAL' })} /> Cobertura parcial</label>{scope.alcance === 'PARTIAL' && <><strong>Instituciones</strong>{institutions.map((i) => <label key={i.id}><input type="checkbox" checked={scope.institucion_ids.includes(i.id)} onChange={() => updateScope(m.id, { institucion_ids: scope.institucion_ids.includes(i.id) ? scope.institucion_ids.filter((x) => x !== i.id) : [...scope.institucion_ids, i.id] })} />{i.nombre}</label>)}<strong>Personas</strong>{people.map((p) => <label key={p.id}><input type="checkbox" checked={scope.vinculacion_ids.includes(p.id)} onChange={() => updateScope(m.id, { vinculacion_ids: scope.vinculacion_ids.includes(p.id) ? scope.vinculacion_ids.filter((x) => x !== p.id) : [...scope.vinculacion_ids, p.id] })} />{p.nombre} {p.documento ? `· ${p.documento}` : ''}</label>)}</>}</article>; })}</div>}
        <footer className="op-modal-footer"><button type="button" className="op-button secondary" onClick={() => step > 1 ? setStep(step - 1) : onClose()}>Volver</button>{step < 3 ? <button type="button" className="op-button primary" disabled={(step === 1 && !gestorId) || (step === 2 && municipios.length === 0)} onClick={() => setStep(step + 1)}>Continuar</button> : <button type="button" className="op-button primary" disabled={saving || !payload} onClick={() => void save()}>{saving ? 'Guardando...' : 'Guardar asignación'}</button>}</footer>
      </>}
    </section>
  </div>;
}
