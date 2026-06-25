import { useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle, ChevronRight,
  ClipboardCheck, Clock, Download, Eye, FileText,
  Filter, LayoutGrid, List, Package, Plus, Search,
  TrendingUp, Users, X, XCircle,
} from 'lucide-react';
import {
  MOCK_CARGOS_REPO, MOCK_CONTRATOS_REPO, MOCK_EMPRESAS_REPO,
  MOCK_MUNICIPIOS_REPO, MOCK_PERSONAS, MOCK_PAQUETES,
} from './repositorio.mock';
import type {
  DocumentoRepositorio, FiltrosRepositorio,
  PersonaRepositorio, TipoPaquete, VistaRepositorio,
} from './repositorio.types';
import {
  DEFAULT_FILTROS, ORIGEN_LABEL, TIPO_PAQUETE_LABEL,
  TIPOS_DOCUMENTALES, getPersonaStats,
} from './repositorio.types';
import { DocumentViewer } from './DocumentViewer';
import { PaqueteBuilder } from './PaqueteBuilder';
import './repositorio.css';

// ─── Compliance ring ──────────────────────────────────────────────────────────

function Ring({ pct, size = 52 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2, cx = size / 2, cy = size / 2;
  const c = 2 * Math.PI * r;
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#3b82f6' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-color)" strokeWidth="4" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${c * pct / 100} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color }}>
        {pct}%
      </div>
    </div>
  );
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function countFilters(f: FiltrosRepositorio): number {
  return [f.empresa, f.contrato, f.municipio, f.cargo, f.tipo_vinculacion, f.estado_vinculacion,
          f.persona, f.numero_documento, f.tipo_documental, f.estado_documento].filter(Boolean).length
    + (f.vigencia !== 'todos' ? 1 : 0)
    + [f.aplica_interventoria, f.aplica_licitacion, f.aplica_auditoria, f.aplica_sst, f.aplica_nomina].filter(Boolean).length;
}

function filtrarPersonas(personas: PersonaRepositorio[], f: FiltrosRepositorio, q: string): PersonaRepositorio[] {
  return personas.filter(p => {
    if (f.empresa         && p.empresa          !== f.empresa)         return false;
    if (f.contrato        && p.contrato         !== f.contrato)        return false;
    if (f.municipio       && p.municipio        !== f.municipio)       return false;
    if (f.cargo           && p.cargo            !== f.cargo)           return false;
    if (f.tipo_vinculacion && p.tipo_vinculacion !== f.tipo_vinculacion) return false;
    if (f.estado_vinculacion && p.estado_vinculacion !== f.estado_vinculacion) return false;
    if (f.persona && !p.nombre_completo.toLowerCase().includes(f.persona.toLowerCase())) return false;
    if (f.numero_documento && !p.numero_documento.replace(/\./g,'').includes(f.numero_documento.replace(/\./g,''))) return false;
    if (q && !p.nombre_completo.toLowerCase().includes(q.toLowerCase()) && !p.numero_documento.includes(q) && !p.cargo.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
}

function filtrarDocs(docs: DocumentoRepositorio[], f: FiltrosRepositorio): DocumentoRepositorio[] {
  return docs.filter(d => {
    if (f.tipo_documental && d.tipo_documento !== f.tipo_documental) return false;
    if (f.estado_documento && d.estado !== f.estado_documento) return false;
    if (f.vigencia === 'vigentes'   && d.estado !== 'vigente')    return false;
    if (f.vigencia === 'vencidos'   && d.estado !== 'vencido')    return false;
    if (f.vigencia === 'por_vencer' && d.estado !== 'por_vencer') return false;
    if (f.vigencia === 'pendientes' && d.estado !== 'pendiente')  return false;
    if (f.aplica_interventoria && !d.aplica_interventoria) return false;
    if (f.aplica_licitacion    && !d.aplica_licitacion)    return false;
    if (f.aplica_auditoria     && !d.aplica_auditoria)     return false;
    if (f.aplica_sst           && !d.aplica_sst)           return false;
    if (f.aplica_nomina        && !d.aplica_nomina)        return false;
    return true;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VerDocumentosPage() {
  const [filtros, setFiltros]         = useState<FiltrosRepositorio>(DEFAULT_FILTROS);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [vista, setVista]             = useState<VistaRepositorio>('tabla');
  const [search, setSearch]           = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [viewerDoc, setViewerDoc]     = useState<DocumentoRepositorio | null>(null);
  const [viewerPersona, setViewerPersona] = useState<PersonaRepositorio | null>(null);
  const [paqueteOpen, setPaqueteOpen] = useState(false);
  const [paquetes, setPaquetes]       = useState(MOCK_PAQUETES);
  const [reqSel, setReqSel]           = useState<string[]>(['Cédula de Ciudadanía','Afiliación ARL','Examen Médico de Ingreso']);

  const ff = <K extends keyof FiltrosRepositorio>(k: K, v: FiltrosRepositorio[K]) =>
    setFiltros(p => ({ ...p, [k]: v }));

  const personaMap = useMemo(() => new Map(MOCK_PERSONAS.map(p => [p.id, p])), []);

  const personasFiltradas = useMemo(() =>
    filtrarPersonas(MOCK_PERSONAS, filtros, search), [filtros, search]);

  const docsFiltrados = useMemo(() =>
    filtrarDocs(personasFiltradas.flatMap(p => p.documentos), filtros), [personasFiltradas, filtros]);

  // Global stats over ALL personas (not filtered)
  const allDocs    = MOCK_PERSONAS.flatMap(p => p.documentos);
  const totalVig   = allDocs.filter(d => d.estado === 'vigente').length;
  const totalVenc  = allDocs.filter(d => d.estado === 'vencido').length;
  const totalPV    = allDocs.filter(d => d.estado === 'por_vencer').length;
  const totalPend  = allDocs.filter(d => d.estado === 'pendiente').length;
  const avgCumpl   = Math.round(MOCK_PERSONAS.reduce((a, p) => a + getPersonaStats(p).cumplimiento, 0) / MOCK_PERSONAS.length);

  const filterCount = countFilters(filtros);

  function openViewer(doc: DocumentoRepositorio) {
    setViewerDoc(doc);
    setViewerPersona(personaMap.get(doc.persona_id) ?? null);
  }

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleNewPaquete(nombre: string, tipo: TipoPaquete, requisitos: string[]) {
    setPaquetes(prev => [{
      id: Date.now(), codigo: `PKG-2026-${(prev.length + 1).toString().padStart(3,'0')}`,
      nombre, descripcion: '', tipo, requisitos,
      personas_ids: personasFiltradas.map(p => p.id),
      cantidad_documentos: 0,
      fecha_creacion: new Date().toISOString().slice(0, 10),
      usuario_creador: 'Usuario TH',
      estado: 'activo',
    }, ...prev]);
  }

  // ── Status badge ────────────────────────────────────────────────────────────
  function StateBadge({ estado }: { estado: DocumentoRepositorio['estado'] }) {
    const labels = { vigente: 'Vigente', vencido: 'Vencido', por_vencer: 'Por vencer', pendiente: 'Pendiente' };
    return <span className={`rep-badge ${estado}`}>{labels[estado]}</span>;
  }

  // ── TABLA VIEW ──────────────────────────────────────────────────────────────
  function TablaView() {
    return (
      <div className="rep-table-wrap rep-scroll-x">
        <table className="rep-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Tipo Documento</th>
              <th>Cargo / Empresa</th>
              <th>Municipio</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              <th>Origen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docsFiltrados.length === 0 && (
              <tr><td colSpan={8} className="rep-table-empty">
                <FileText size={28} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                No hay documentos con los filtros aplicados
              </td></tr>
            )}
            {docsFiltrados.map(doc => {
              const p = personaMap.get(doc.persona_id);
              if (!p) return null;
              return (
                <tr key={doc.id}>
                  <td>
                    <div className="rep-persona-cell">
                      <span className="rep-persona-name">{p.nombre_completo}</span>
                      <span className="rep-persona-doc">{p.numero_documento}</span>
                    </div>
                  </td>
                  <td><span className="rep-doc-type">{doc.tipo_documento}</span></td>
                  <td>
                    <div style={{ fontSize: 12 }}>{p.cargo}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.empresa}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{p.municipio}</td>
                  <td><StateBadge estado={doc.estado} /></td>
                  <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {doc.fecha_vencimiento ?? '—'}
                    {doc.dias_para_vencer !== undefined && (
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--color-warning)' }}>
                        {doc.dias_para_vencer}d restantes
                      </span>
                    )}
                  </td>
                  <td><span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen]}</span></td>
                  <td>
                    <button className="rep-btn ghost sm" onClick={() => openViewer(doc)} title="Ver documento">
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── CARDS VIEW ──────────────────────────────────────────────────────────────
  function CardsView() {
    return (
      <div className="rep-cards-grid">
        {personasFiltradas.map(p => {
          const stats = getPersonaStats(p);
          return (
            <div key={p.id} className="rep-person-card" onClick={() => { setVista('expediente'); toggleExpanded(p.id); }}>
              <div className="rep-card-top">
                <div className="rep-avatar">{p.iniciales}</div>
                <div className="rep-card-info">
                  <div className="rep-card-name">{p.nombre_completo}</div>
                  <div className="rep-card-cargo">{p.cargo}</div>
                  <div className="rep-card-meta">{p.municipio}</div>
                </div>
                <div className="rep-ring-wrap"><Ring pct={stats.cumplimiento} /></div>
              </div>
              <div className="rep-card-counts">
                {stats.vigentes > 0    && <span className="rep-count-pill vigente">{stats.vigentes} vigentes</span>}
                {stats.vencidos > 0    && <span className="rep-count-pill vencido">{stats.vencidos} vencidos</span>}
                {stats.por_vencer > 0  && <span className="rep-count-pill por_vencer">{stats.por_vencer} por vencer</span>}
                {stats.pendientes > 0  && <span className="rep-count-pill pendiente">{stats.pendientes} faltantes</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="rep-card-contrato">{p.contrato}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.empresa.split(' ')[0]}</span>
              </div>
            </div>
          );
        })}
        {personasFiltradas.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Users size={28} style={{ marginBottom: 8 }} /><br />Sin personas con los filtros aplicados
          </div>
        )}
      </div>
    );
  }

  // ── EXPEDIENTE VIEW ─────────────────────────────────────────────────────────
  function ExpedienteView() {
    return (
      <div className="rep-expediente-list">
        {personasFiltradas.map(p => {
          const stats = getPersonaStats(p);
          const isOpen = expandedIds.has(p.id);
          const docsPersona = filtrarDocs(p.documentos, filtros);
          return (
            <div key={p.id} className={`rep-exp-item${isOpen ? ' expanded' : ''}`}>
              <div className="rep-exp-header" onClick={() => toggleExpanded(p.id)}>
                <ChevronRight size={14} className="rep-exp-chevron" />
                <div className="rep-exp-avatar">{p.iniciales}</div>
                <div className="rep-exp-person">
                  <div className="rep-exp-name">{p.nombre_completo}</div>
                  <div className="rep-exp-detail">{p.numero_documento} · {p.cargo} · {p.municipio}</div>
                </div>
                <div className="rep-exp-pills">
                  {stats.vencidos > 0   && <span className="rep-badge vencido">{stats.vencidos} vencidos</span>}
                  {stats.por_vencer > 0 && <span className="rep-badge por_vencer">{stats.por_vencer} por vencer</span>}
                  {stats.pendientes > 0 && <span className="rep-badge pendiente">{stats.pendientes} faltantes</span>}
                </div>
                <Ring pct={stats.cumplimiento} size={44} />
              </div>
              {isOpen && (
                <div className="rep-exp-docs">
                  <div className="rep-exp-docs-inner">
                    {docsPersona.map(doc => (
                      <div key={doc.id} className="rep-exp-doc-row">
                        <span className="rep-exp-doc-tipo">{doc.tipo_documento}</span>
                        <StateBadge estado={doc.estado} />
                        <span className="rep-exp-doc-date">{doc.fecha_vencimiento ?? '—'}</span>
                        <span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen]}</span>
                        <div className="rep-exp-doc-acts">
                          <button className="rep-btn ghost sm" onClick={() => openViewer(doc)}><Eye size={12} /></button>
                          {doc.estado !== 'pendiente' && <button className="rep-btn ghost sm"><Download size={12} /></button>}
                        </div>
                      </div>
                    ))}
                    {docsPersona.length === 0 && (
                      <div style={{ padding: '12px 16px 12px 62px', color: 'var(--text-muted)', fontSize: 12 }}>
                        Ningún documento coincide con los filtros actuales
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {personasFiltradas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Sin personas con los filtros aplicados
          </div>
        )}
      </div>
    );
  }

  // ── REQUISITOS VIEW ─────────────────────────────────────────────────────────
  function RequisitosView() {
    function cellFor(p: PersonaRepositorio, req: string) {
      const doc = p.documentos.find(d => d.tipo_documento === req);
      if (!doc) return <span className="rep-cell-na">—</span>;
      if (doc.estado === 'vigente')    return <CheckCircle size={14} className="rep-cell-ok" />;
      if (doc.estado === 'por_vencer') return <Clock size={14} className="rep-cell-warn" />;
      if (doc.estado === 'vencido')    return <XCircle size={14} className="rep-cell-bad" />;
      return <AlertTriangle size={14} className="rep-cell-bad" />;
    }

    return (
      <div className="rep-req-layout">
        <div className="rep-req-selector">
          <h4>Requisitos a evaluar</h4>
          <div className="rep-req-check-list">
            {TIPOS_DOCUMENTALES.map(r => (
              <label key={r} className="rep-req-check-item">
                <input type="checkbox" checked={reqSel.includes(r)}
                  onChange={() => setReqSel(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} />
                {r}
              </label>
            ))}
          </div>
        </div>
        <div className="rep-req-matrix-wrap">
          {reqSel.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              Selecciona al menos un requisito para ver la matriz de cumplimiento
            </div>
          ) : (
            <table className="rep-req-matrix">
              <thead>
                <tr>
                  <th>Persona</th>
                  {reqSel.map(r => <th key={r}>{r.length > 16 ? r.slice(0,14) + '…' : r}</th>)}
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {personasFiltradas.map(p => {
                  const cumpl = reqSel.filter(r => {
                    const doc = p.documentos.find(d => d.tipo_documento === r);
                    return doc && (doc.estado === 'vigente' || doc.estado === 'por_vencer');
                  }).length;
                  const pct = Math.round((cumpl / reqSel.length) * 100);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{p.nombre_completo}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.cargo}</div>
                      </td>
                      {reqSel.map(r => (
                        <td key={r}>{cellFor(p, r)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <Ring pct={pct} size={36} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="rep-page">

      {/* Header */}
      <div className="rep-page-header">
        <div>
          <h2 className="rep-page-title"><FileText size={20} /> Repositorio Documental</h2>
          <p className="rep-page-sub">Gestión y consulta centralizada del expediente documental de colaboradores</p>
        </div>
        <div className="rep-header-actions">
          <button className="rep-btn secondary" onClick={() => setPaqueteOpen(true)}>
            <Package size={14} /> Nuevo paquete
          </button>
          <button className="rep-btn secondary">
            <Download size={14} /> Exportar
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="rep-stats">
        <div className="rep-stat">
          <div className="rep-stat-icon primary"><FileText size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{allDocs.length}</span><span className="rep-stat-lbl">Total docs.</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon neutral"><Users size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{MOCK_PERSONAS.length}</span><span className="rep-stat-lbl">Personas</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon success"><CheckCircle size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{totalVig}</span><span className="rep-stat-lbl">Vigentes</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon danger"><XCircle size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{totalVenc}</span><span className="rep-stat-lbl">Vencidos</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon warning"><Clock size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{totalPV}</span><span className="rep-stat-lbl">Por vencer</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon danger"><AlertTriangle size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{totalPend}</span><span className="rep-stat-lbl">Faltantes</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon info"><TrendingUp size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{avgCumpl}%</span><span className="rep-stat-lbl">Cumpl. prom.</span></div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon neutral"><Package size={15} /></div>
          <div className="rep-stat-body"><span className="rep-stat-val">{paquetes.length}</span><span className="rep-stat-lbl">Paquetes</span></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rep-toolbar">
        <div className="rep-search">
          <Search size={14} />
          <input placeholder="Buscar persona, cargo, documento…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="rep-view-switcher">
          {([['tabla','tabla',<List size={13} />],['cards','cards',<LayoutGrid size={13} />],['expediente','expediente',<BookOpen size={13} />],['requisitos','requisitos',<ClipboardCheck size={13} />]] as [VistaRepositorio, string, React.ReactNode][]).map(([v, lbl, icon]) => (
            <button key={v} className={`rep-view-btn${vista === v ? ' active' : ''}`} onClick={() => setVista(v)}>
              {icon} {lbl.charAt(0).toUpperCase() + lbl.slice(1)}
            </button>
          ))}
        </div>

        <button className={`rep-filter-btn${filtrosOpen ? ' open' : ''}`} onClick={() => setFiltrosOpen(o => !o)}>
          <Filter size={13} /> Filtros
          {filterCount > 0 && <span className="rep-filter-count">{filterCount}</span>}
        </button>
      </div>

      {/* Filter panel */}
      {filtrosOpen && (
        <div className="rep-filters-panel">
          <div className="rep-filters-grid">
            {([
              ['empresa',          'Empresa',          MOCK_EMPRESAS_REPO],
              ['contrato',         'Contrato',         MOCK_CONTRATOS_REPO],
              ['municipio',        'Municipio',        MOCK_MUNICIPIOS_REPO],
              ['cargo',            'Cargo',            MOCK_CARGOS_REPO],
              ['tipo_vinculacion', 'Tipo vinculación', ['CTF','CTI','OPS']],
              ['estado_vinculacion','Estado vinc.',    ['Activo','Inactivo']],
              ['tipo_documental',  'Tipo documental',  TIPOS_DOCUMENTALES],
              ['estado_documento', 'Estado doc.',      ['vigente','vencido','por_vencer','pendiente']],
            ] as [keyof FiltrosRepositorio, string, string[]][]).map(([key, label, opts]) => (
              <div key={key} className="rep-filter-field">
                <label>{label}</label>
                <select value={filtros[key] as string} onChange={e => ff(key, e.target.value as never)}>
                  <option value="">Todos</option>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div className="rep-filter-field">
              <label>Persona</label>
              <input value={filtros.persona} onChange={e => ff('persona', e.target.value)} placeholder="Nombre…" />
            </div>
            <div className="rep-filter-field">
              <label>Nº Documento</label>
              <input value={filtros.numero_documento} onChange={e => ff('numero_documento', e.target.value)} placeholder="123456789" />
            </div>
          </div>

          <div className="rep-filter-bottom">
            <div className="rep-filter-group">
              <span className="rep-filter-group-label">Vigencia</span>
              <div className="rep-radio-row">
                {([['todos','Todos'],['vigentes','Vigentes'],['vencidos','Vencidos'],['por_vencer','Por vencer'],['pendientes','Faltantes']] as [FiltrosRepositorio['vigencia'], string][]).map(([v, lbl]) => (
                  <label key={v}><input type="radio" name="vigencia" value={v} checked={filtros.vigencia === v} onChange={() => ff('vigencia', v)} />{lbl}</label>
                ))}
              </div>
            </div>
            <div className="rep-filter-group">
              <span className="rep-filter-group-label">Aplica para</span>
              <div className="rep-check-row">
                {([['aplica_interventoria','Interventoría'],['aplica_licitacion','Licitación'],['aplica_auditoria','Auditoría'],['aplica_sst','SST'],['aplica_nomina','Nómina']] as [keyof FiltrosRepositorio, string][]).map(([k, lbl]) => (
                  <label key={k}><input type="checkbox" checked={filtros[k] as boolean} onChange={e => ff(k, e.target.checked as never)} />{lbl}</label>
                ))}
              </div>
            </div>
            <div className="rep-filters-footer">
              <button className="rep-btn secondary sm" onClick={() => { setFiltros(DEFAULT_FILTROS); setSearch(''); }}>
                <X size={11} /> Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {filterCount > 0 && (
        <div className="rep-active-filters">
          <span style={{ color: 'var(--text-muted)' }}>Filtros:</span>
          {(['empresa','contrato','municipio','cargo','tipo_vinculacion','estado_vinculacion','tipo_documental','estado_documento','persona','numero_documento'] as (keyof FiltrosRepositorio)[]).filter(k => filtros[k]).map(k => (
            <span key={k} className="rep-chip">
              {String(filtros[k])}
              <button onClick={() => ff(k, '' as never)}><X size={10} /></button>
            </span>
          ))}
          {filtros.vigencia !== 'todos' && (
            <span className="rep-chip">Vigencia: {filtros.vigencia}<button onClick={() => ff('vigencia', 'todos')}><X size={10} /></button></span>
          )}
          {(['aplica_interventoria','aplica_licitacion','aplica_auditoria','aplica_sst','aplica_nomina'] as (keyof FiltrosRepositorio)[]).filter(k => filtros[k]).map(k => (
            <span key={k} className="rep-chip">{k.replace('aplica_','')}<button onClick={() => ff(k, false as never)}><X size={10} /></button></span>
          ))}
        </div>
      )}

      {/* Result summary */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        {vista === 'tabla'
          ? `${docsFiltrados.length} documento${docsFiltrados.length !== 1 ? 's' : ''} · ${personasFiltradas.length} persona${personasFiltradas.length !== 1 ? 's' : ''}`
          : `${personasFiltradas.length} persona${personasFiltradas.length !== 1 ? 's' : ''}`}
      </div>

      {/* Main content */}
      {vista === 'tabla'      && <TablaView />}
      {vista === 'cards'      && <CardsView />}
      {vista === 'expediente' && <ExpedienteView />}
      {vista === 'requisitos' && <RequisitosView />}

      {/* Paquetes documentales */}
      <div style={{ marginTop: 32 }}>
        <div className="rep-section-header">
          <h3 className="rep-section-title">
            <Package size={15} /> Paquetes documentales
            <span className="count">{paquetes.length}</span>
          </h3>
          <button className="rep-btn secondary sm" onClick={() => setPaqueteOpen(true)}>
            <Plus size={12} /> Nuevo
          </button>
        </div>
        <div className="rep-paquetes-grid">
          {paquetes.map(pkg => (
            <div key={pkg.id} className="rep-paquete-card">
              <div className="rep-paquete-top">
                <div>
                  <div className="rep-paquete-codigo">{pkg.codigo}</div>
                  <div className="rep-paquete-nombre">{pkg.nombre}</div>
                </div>
                <span className={`rep-paquete-badge ${pkg.estado}`}>{pkg.estado}</span>
              </div>
              <p className="rep-paquete-desc">{pkg.descripcion || '—'}</p>
              <div className="rep-paquete-meta">
                <span className={`rep-paquete-badge ${pkg.tipo}`}>{TIPO_PAQUETE_LABEL[pkg.tipo]}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pkg.requisitos.length} requisitos</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pkg.personas_ids.length} personas</span>
              </div>
              <div className="rep-paquete-footer">
                <span>{pkg.fecha_creacion} · {pkg.usuario_creador}</span>
                <div className="rep-paquete-actions">
                  <button className="rep-btn ghost sm"><Eye size={11} /></button>
                  <button className="rep-btn secondary sm"><Download size={11} /> Exportar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {viewerDoc && viewerPersona && (
        <DocumentViewer doc={viewerDoc} persona={viewerPersona} onClose={() => { setViewerDoc(null); setViewerPersona(null); }} />
      )}
      {paqueteOpen && (
        <PaqueteBuilder onClose={() => setPaqueteOpen(false)} onSave={handleNewPaquete} />
      )}

    </div>
  );
}
