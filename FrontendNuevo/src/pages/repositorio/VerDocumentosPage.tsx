import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, BookOpen, CheckCircle, ChevronRight,
  ClipboardCheck, Clock, Download, Eye, FileText,
  Filter, LayoutGrid, List, Loader2, Package, Plus, Search,
  TrendingUp, Users, X, XCircle,
} from 'lucide-react';
import type {
  RepositorioDocumentoApi,
  RepositorioDocumentosPaginationApi,
  RepositorioEstadoDocumental,
  RepositorioIndicadoresApi,
  RepositorioOrigen,
  RepositorioPersonaResumenApi,
} from '../../types/repositorio.types';
import { buildInicialesRepo, buildNombrePersonaRepo } from '../../types/repositorio.types';
import {
  exportRepositorioDocumentos,
  getRepositorioDocumentos,
  getRepositorioIndicadores,
} from '../../services/repositorioApi';
import { MOCK_PAQUETES } from './repositorio.mock';
import type { TipoPaquete, VistaRepositorio } from './repositorio.types';
import { TIPO_PAQUETE_LABEL } from './repositorio.types';
import { DocumentViewer } from './DocumentViewer';
import { PaqueteBuilder } from './PaqueteBuilder';
import './repositorio.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonaGroup {
  personaId: number;
  persona: RepositorioPersonaResumenApi | null;
  docs: RepositorioDocumentoApi[];
}

const ORIGEN_LABEL: Record<RepositorioOrigen, string> = {
  persona:    'Persona',
  vinculacion: 'Vinculación',
  generado:   'Generado',
};

const ESTADO_LABEL: Record<RepositorioEstadoDocumental, string> = {
  vigente:         'Vigente',
  vencido:         'Vencido',
  reemplazado:     'Reemplazado',
  sin_vencimiento: 'Sin vencimiento',
};

const VIEWS: { id: VistaRepositorio; lbl: string; icon: ReactNode }[] = [
  { id: 'tabla',      lbl: 'Tabla',      icon: <List size={13} /> },
  { id: 'cards',      lbl: 'Cards',      icon: <LayoutGrid size={13} /> },
  { id: 'expediente', lbl: 'Expediente', icon: <BookOpen size={13} /> },
  { id: 'requisitos', lbl: 'Requisitos', icon: <ClipboardCheck size={13} /> },
];

// ─── Ring ─────────────────────────────────────────────────────────────────────

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

function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d ?? '?'}/${m ?? '?'}/${y ?? '?'}`;
}

function groupCumplimiento(docs: RepositorioDocumentoApi[]): number {
  if (docs.length === 0) return 0;
  const ok = docs.filter(d => d.estado_documental === 'vigente' || d.estado_documental === 'sin_vencimiento').length;
  return Math.round((ok / docs.length) * 100);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VerDocumentosPage() {

  // ── Data state ─────────────────────────────────────────────────────────────
  const [docs, setDocs]               = useState<RepositorioDocumentoApi[]>([]);
  const [pagination, setPagination]   = useState<RepositorioDocumentosPaginationApi | null>(null);
  const [indicadores, setIndicadores] = useState<RepositorioIndicadoresApi | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError]     = useState<string | null>(null);

  // ── Server-side filters (trigger API call on change) ───────────────────────
  const [sfOrigen,     setSfOrigen]     = useState<RepositorioOrigen | ''>('');
  const [sfEstado,     setSfEstado]     = useState<RepositorioEstadoDocumental | ''>('');
  const [sfFechaDesde, setSfFechaDesde] = useState('');
  const [sfFechaHasta, setSfFechaHasta] = useState('');
  const [sfPage,       setSfPage]       = useState(1);
  const LIMIT = 50;

  // ── Client-side filters (applied on loaded docs) ───────────────────────────
  const [cfEmpresa,  setCfEmpresa]  = useState('');
  const [cfContrato, setCfContrato] = useState('');
  const [cfTipo,     setCfTipo]     = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [searchInput,     setSearchInput]     = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [vista,         setVista]         = useState<VistaRepositorio>('tabla');
  const [filtrosOpen,   setFiltrosOpen]   = useState(false);
  const [expandedIds,   setExpandedIds]   = useState<Set<number>>(new Set());
  const [viewerDoc,     setViewerDoc]     = useState<RepositorioDocumentoApi | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [paqueteOpen,   setPaqueteOpen]   = useState(false);
  const [paquetes,      setPaquetes]      = useState(MOCK_PAQUETES);
  const [reqSel,        setReqSel]        = useState<string[]>([]);

  // ── Debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchInput); setSfPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDocsLoading(true);
      setDocsError(null);
      try {
        const filters = {
          search:            debouncedSearch || undefined,
          origen:            sfOrigen     ? sfOrigen    as RepositorioOrigen              : undefined,
          estado_documental: sfEstado     ? sfEstado    as RepositorioEstadoDocumental    : undefined,
          fecha_desde:       sfFechaDesde || undefined,
          fecha_hasta:       sfFechaHasta || undefined,
        };
        const [docsRes, indRes] = await Promise.all([
          getRepositorioDocumentos({ ...filters, page: sfPage, limit: LIMIT }),
          getRepositorioIndicadores(filters),
        ]);
        if (!cancelled) {
          setDocs(docsRes.items);
          setPagination(docsRes.pagination);
          setIndicadores(indRes);
        }
      } catch (e) {
        if (!cancelled) setDocsError(e instanceof Error ? e.message : 'Error al cargar datos');
      } finally {
        if (!cancelled) setDocsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [debouncedSearch, sfOrigen, sfEstado, sfFechaDesde, sfFechaHasta, sfPage]);

  // ── Server filter setters (reset page on change) ───────────────────────────
  function setOrigin(v: RepositorioOrigen | '') { setSfOrigen(v); setSfPage(1); }
  function setEstado(v: RepositorioEstadoDocumental | '') { setSfEstado(v); setSfPage(1); }
  function setFechaDesde(v: string) { setSfFechaDesde(v); setSfPage(1); }
  function setFechaHasta(v: string) { setSfFechaHasta(v); setSfPage(1); }

  // ── Client-side filtered docs ──────────────────────────────────────────────
  const filteredDocs = useMemo(() => docs.filter(d => {
    if (cfEmpresa  && d.empresa?.nombre_empresa   !== cfEmpresa)  return false;
    if (cfContrato && d.contrato?.numero_contrato !== cfContrato) return false;
    if (cfTipo     && d.nombre_tipo_documento     !== cfTipo)     return false;
    return true;
  }), [docs, cfEmpresa, cfContrato, cfTipo]);

  // ── Persona groups (for cards / expediente / requisitos views) ─────────────
  const personaGroups = useMemo((): PersonaGroup[] => {
    const map = new Map<number, PersonaGroup>();
    for (const doc of filteredDocs) {
      const key = doc.persona_id ?? -1;
      if (!map.has(key)) map.set(key, { personaId: key, persona: doc.persona, docs: [] });
      map.get(key)!.docs.push(doc);
    }
    return [...map.values()].sort((a, b) =>
      buildNombrePersonaRepo(a.persona).localeCompare(buildNombrePersonaRepo(b.persona))
    );
  }, [filteredDocs]);

  // ── Available client-filter options (derived from loaded docs) ─────────────
  const availableEmpresas  = useMemo(() =>
    [...new Set(docs.map(d => d.empresa?.nombre_empresa ).filter((x): x is string => !!x))].sort()
  , [docs]);
  const availableContratos = useMemo(() =>
    [...new Set(docs.map(d => d.contrato?.numero_contrato).filter((x): x is string => !!x))].sort()
  , [docs]);
  const availableTipos     = useMemo(() =>
    [...new Set(docs.map(d => d.nombre_tipo_documento   ).filter((x): x is string => !!x))].sort()
  , [docs]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const cumplProm = indicadores && indicadores.total_documentos > 0
    ? Math.round(((indicadores.vigentes + indicadores.sin_vencimiento) / indicadores.total_documentos) * 100)
    : null;

  const filterCount = [sfOrigen, sfEstado, sfFechaDesde, sfFechaHasta, cfEmpresa, cfContrato, cfTipo].filter(Boolean).length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function clearFilters() {
    setSfOrigen(''); setSfEstado(''); setSfFechaDesde(''); setSfFechaHasta('');
    setCfEmpresa(''); setCfContrato(''); setCfTipo('');
    setSearchInput(''); setSfPage(1);
  }

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const csv = await exportRepositorioDocumentos({
        search:            debouncedSearch || undefined,
        origen:            sfOrigen     ? sfOrigen    as RepositorioOrigen           : undefined,
        estado_documental: sfEstado     ? sfEstado    as RepositorioEstadoDocumental : undefined,
        fecha_desde:       sfFechaDesde || undefined,
        fecha_hasta:       sfFechaHasta || undefined,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `repositorio_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExportLoading(false);
    }
  }

  function handleNewPaquete(nombre: string, tipo: TipoPaquete, requisitos: string[]) {
    setPaquetes(prev => [{
      id: Date.now(),
      codigo: `PKG-2026-${String(prev.length + 1).padStart(3, '0')}`,
      nombre, descripcion: '', tipo, requisitos,
      personas_ids: personaGroups.map(g => g.personaId).filter(id => id !== -1),
      cantidad_documentos: 0,
      fecha_creacion: new Date().toISOString().slice(0, 10),
      usuario_creador: 'Usuario TH',
      estado: 'activo',
    }, ...prev]);
  }

  // ── Sub-views ──────────────────────────────────────────────────────────────

  function StateBadge({ estado }: { estado: RepositorioEstadoDocumental }) {
    return <span className={`rep-badge ${estado}`}>{ESTADO_LABEL[estado]}</span>;
  }

  function LoadingState() {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        <Loader2 size={24} style={{ display: 'block', margin: '0 auto 8px', color: 'var(--color-primary)' }} />
        Cargando documentos…
      </div>
    );
  }

  function ErrorState() {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-danger)' }}>
        <AlertTriangle size={20} style={{ display: 'block', margin: '0 auto 8px' }} />
        {docsError}
      </div>
    );
  }

  function TablaView() {
    if (docsLoading) return <LoadingState />;
    if (docsError)   return <ErrorState />;
    return (
      <div className="rep-table-wrap rep-scroll-x">
        <table className="rep-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Tipo Documento</th>
              <th>Empresa / Contrato</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              <th>Origen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.length === 0 && (
              <tr><td colSpan={7} className="rep-table-empty">
                <FileText size={28} style={{ display: 'block', margin: '0 auto 8px' }} />
                No hay documentos con los filtros aplicados
              </td></tr>
            )}
            {filteredDocs.map(doc => (
              <tr key={`${doc.origen}-${doc.documento_id}`}>
                <td>
                  <div className="rep-persona-cell">
                    <span className="rep-persona-name">{buildNombrePersonaRepo(doc.persona)}</span>
                    {doc.persona?.numero_documento && (
                      <span className="rep-persona-doc">{doc.persona.numero_documento}</span>
                    )}
                  </div>
                </td>
                <td><span className="rep-doc-type">{doc.nombre_tipo_documento ?? '—'}</span></td>
                <td>
                  <div style={{ fontSize: 12 }}>{doc.empresa?.nombre_empresa ?? '—'}</div>
                  {doc.contrato?.numero_contrato && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {doc.contrato.numero_contrato}
                    </div>
                  )}
                </td>
                <td><StateBadge estado={doc.estado_documental} /></td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {fmtDate(doc.fecha_vencimiento)}
                </td>
                <td>
                  <span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen]}</span>
                </td>
                <td>
                  <button className="rep-btn ghost sm" onClick={() => setViewerDoc(doc)} title="Ver documento">
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function CardsView() {
    if (docsLoading) return <LoadingState />;
    if (docsError)   return <ErrorState />;
    return (
      <div className="rep-cards-grid">
        {personaGroups.map(group => {
          const pct      = groupCumplimiento(group.docs);
          const nombre   = buildNombrePersonaRepo(group.persona);
          const iniciales = buildInicialesRepo(group.persona);
          const vencidos = group.docs.filter(d => d.estado_documental === 'vencido').length;
          const vigentes = group.docs.filter(d => d.estado_documental === 'vigente').length;
          return (
            <div key={group.personaId} className="rep-person-card"
              onClick={() => { setVista('expediente'); toggleExpanded(group.personaId); }}>
              <div className="rep-card-top">
                <div className="rep-avatar">{iniciales}</div>
                <div className="rep-card-info">
                  <div className="rep-card-name">{nombre}</div>
                  {group.persona?.numero_documento && (
                    <div className="rep-card-cargo" style={{ fontFamily: 'monospace' }}>
                      {group.persona.numero_documento}
                    </div>
                  )}
                  {group.docs[0]?.empresa?.nombre_empresa && (
                    <div className="rep-card-meta">{group.docs[0].empresa.nombre_empresa}</div>
                  )}
                </div>
                <div className="rep-ring-wrap"><Ring pct={pct} /></div>
              </div>
              <div className="rep-card-counts">
                {vigentes > 0  && <span className="rep-count-pill vigente">{vigentes} vigentes</span>}
                {vencidos > 0  && <span className="rep-count-pill vencido">{vencidos} vencidos</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {group.docs.length} documento{group.docs.length !== 1 ? 's' : ''}
              </div>
            </div>
          );
        })}
        {personaGroups.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Users size={28} style={{ marginBottom: 8 }} /><br />Sin personas con los filtros aplicados
          </div>
        )}
      </div>
    );
  }

  function ExpedienteView() {
    if (docsLoading) return <LoadingState />;
    if (docsError)   return <ErrorState />;
    return (
      <div className="rep-expediente-list">
        {personaGroups.map(group => {
          const pct     = groupCumplimiento(group.docs);
          const isOpen  = expandedIds.has(group.personaId);
          const nombre  = buildNombrePersonaRepo(group.persona);
          const iniciales = buildInicialesRepo(group.persona);
          const vencidos = group.docs.filter(d => d.estado_documental === 'vencido').length;
          return (
            <div key={group.personaId} className={`rep-exp-item${isOpen ? ' expanded' : ''}`}>
              <div className="rep-exp-header" onClick={() => toggleExpanded(group.personaId)}>
                <ChevronRight size={14} className="rep-exp-chevron" />
                <div className="rep-exp-avatar">{iniciales}</div>
                <div className="rep-exp-person">
                  <div className="rep-exp-name">{nombre}</div>
                  <div className="rep-exp-detail">
                    {[group.persona?.numero_documento, group.docs[0]?.empresa?.nombre_empresa].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="rep-exp-pills">
                  {vencidos > 0 && <span className="rep-badge vencido">{vencidos} vencidos</span>}
                </div>
                <Ring pct={pct} size={44} />
              </div>
              {isOpen && (
                <div className="rep-exp-docs">
                  <div className="rep-exp-docs-inner">
                    {group.docs.map(doc => (
                      <div key={`${doc.origen}-${doc.documento_id}`} className="rep-exp-doc-row">
                        <span className="rep-exp-doc-tipo">{doc.nombre_tipo_documento ?? '—'}</span>
                        <StateBadge estado={doc.estado_documental} />
                        <span className="rep-exp-doc-date">{fmtDate(doc.fecha_vencimiento)}</span>
                        <span className={`rep-origin-badge ${doc.origen}`}>{ORIGEN_LABEL[doc.origen]}</span>
                        <div className="rep-exp-doc-acts">
                          <button className="rep-btn ghost sm" onClick={() => setViewerDoc(doc)}><Eye size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {personaGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Sin personas con los filtros aplicados
          </div>
        )}
      </div>
    );
  }

  function RequisitosView() {
    function cellFor(group: PersonaGroup, tipo: string): ReactNode {
      const doc = group.docs.find(d => d.nombre_tipo_documento === tipo);
      if (!doc) return <span className="rep-cell-na">—</span>;
      if (doc.estado_documental === 'vigente' || doc.estado_documental === 'sin_vencimiento')
        return <CheckCircle size={14} className="rep-cell-ok" />;
      if (doc.estado_documental === 'vencido')
        return <XCircle size={14} className="rep-cell-bad" />;
      return <Clock size={14} className="rep-cell-warn" />;
    }
    return (
      <div className="rep-req-layout">
        <div className="rep-req-selector">
          <h4>Requisitos a evaluar</h4>
          {availableTipos.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>
              {docsLoading ? 'Cargando tipos…' : 'Sin tipos disponibles'}
            </div>
          )}
          <div className="rep-req-check-list">
            {availableTipos.map(tipo => (
              <label key={tipo} className="rep-req-check-item">
                <input type="checkbox" checked={reqSel.includes(tipo)}
                  onChange={() => setReqSel(prev =>
                    prev.includes(tipo) ? prev.filter(x => x !== tipo) : [...prev, tipo]
                  )} />
                {tipo}
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
                  {reqSel.map(r => <th key={r}>{r.length > 16 ? r.slice(0, 14) + '…' : r}</th>)}
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {personaGroups.map(group => {
                  const cumpl = reqSel.filter(r => {
                    const doc = group.docs.find(d => d.nombre_tipo_documento === r);
                    return doc && (doc.estado_documental === 'vigente' || doc.estado_documental === 'sin_vencimiento');
                  }).length;
                  const pct = reqSel.length > 0 ? Math.round((cumpl / reqSel.length) * 100) : 0;
                  return (
                    <tr key={group.personaId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{buildNombrePersonaRepo(group.persona)}</div>
                        {group.persona?.numero_documento && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {group.persona.numero_documento}
                          </div>
                        )}
                      </td>
                      {reqSel.map(r => <td key={r}>{cellFor(group, r)}</td>)}
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

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <button className="rep-btn secondary" onClick={() => { void handleExport(); }} disabled={exportLoading}>
            {exportLoading ? <Loader2 size={14} /> : <Download size={14} />}
            {exportLoading ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="rep-stats">
        <div className="rep-stat">
          <div className="rep-stat-icon primary"><FileText size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.total_documentos ?? '—')}</span>
            <span className="rep-stat-lbl">Total docs.</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon neutral"><Users size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.total_persona ?? '—')}</span>
            <span className="rep-stat-lbl">Persona</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon success"><CheckCircle size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.vigentes ?? '—')}</span>
            <span className="rep-stat-lbl">Vigentes</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon danger"><XCircle size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.vencidos ?? '—')}</span>
            <span className="rep-stat-lbl">Vencidos</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon warning"><Clock size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.por_vencer_30_dias ?? '—')}</span>
            <span className="rep-stat-lbl">Por vencer 30d</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon danger"><AlertTriangle size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : (indicadores?.total_alertas_activas ?? '—')}</span>
            <span className="rep-stat-lbl">Alertas</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon info"><TrendingUp size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{docsLoading ? '…' : cumplProm !== null ? `${cumplProm}%` : '—'}</span>
            <span className="rep-stat-lbl">Cumpl. prom.</span>
          </div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat-icon neutral"><Package size={15} /></div>
          <div className="rep-stat-body">
            <span className="rep-stat-val">{paquetes.length}</span>
            <span className="rep-stat-lbl">Paquetes</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rep-toolbar">
        <div className="rep-search">
          <Search size={14} />
          <input placeholder="Buscar persona, tipo, empresa…" value={searchInput}
            onChange={e => setSearchInput(e.target.value)} />
        </div>

        <div className="rep-view-switcher">
          {VIEWS.map(({ id, lbl, icon }) => (
            <button key={id} className={`rep-view-btn${vista === id ? ' active' : ''}`}
              onClick={() => setVista(id)}>
              {icon} {lbl}
            </button>
          ))}
        </div>

        <button className={`rep-filter-btn${filtrosOpen ? ' open' : ''}`}
          onClick={() => setFiltrosOpen(o => !o)}>
          <Filter size={13} /> Filtros
          {filterCount > 0 && <span className="rep-filter-count">{filterCount}</span>}
        </button>
      </div>

      {/* Filter panel */}
      {filtrosOpen && (
        <div className="rep-filters-panel">
          <div className="rep-filters-grid">
            <div className="rep-filter-field">
              <label>Origen</label>
              <select value={sfOrigen} onChange={e => setOrigin(e.target.value as RepositorioOrigen | '')}>
                <option value="">Todos</option>
                <option value="persona">Persona</option>
                <option value="vinculacion">Vinculación</option>
                <option value="generado">Generado</option>
              </select>
            </div>
            <div className="rep-filter-field">
              <label>Estado</label>
              <select value={sfEstado} onChange={e => setEstado(e.target.value as RepositorioEstadoDocumental | '')}>
                <option value="">Todos</option>
                <option value="vigente">Vigente</option>
                <option value="vencido">Vencido</option>
                <option value="reemplazado">Reemplazado</option>
                <option value="sin_vencimiento">Sin vencimiento</option>
              </select>
            </div>
            <div className="rep-filter-field">
              <label>Fecha desde</label>
              <input type="date" value={sfFechaDesde} onChange={e => setFechaDesde(e.target.value)} />
            </div>
            <div className="rep-filter-field">
              <label>Fecha hasta</label>
              <input type="date" value={sfFechaHasta} onChange={e => setFechaHasta(e.target.value)} />
            </div>
            {availableEmpresas.length > 0 && (
              <div className="rep-filter-field">
                <label>Empresa</label>
                <select value={cfEmpresa} onChange={e => setCfEmpresa(e.target.value)}>
                  <option value="">Todas</option>
                  {availableEmpresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                </select>
              </div>
            )}
            {availableContratos.length > 0 && (
              <div className="rep-filter-field">
                <label>Contrato</label>
                <select value={cfContrato} onChange={e => setCfContrato(e.target.value)}>
                  <option value="">Todos</option>
                  {availableContratos.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            {availableTipos.length > 0 && (
              <div className="rep-filter-field">
                <label>Tipo documental</label>
                <select value={cfTipo} onChange={e => setCfTipo(e.target.value)}>
                  <option value="">Todos</option>
                  {availableTipos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="rep-filters-footer" style={{ marginLeft: 0, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
            <button className="rep-btn secondary sm" onClick={clearFilters}>
              <X size={11} /> Limpiar filtros
            </button>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {filterCount > 0 && (
        <div className="rep-active-filters">
          <span style={{ color: 'var(--text-muted)' }}>Filtros:</span>
          {sfOrigen     && <span className="rep-chip">Origen: {ORIGEN_LABEL[sfOrigen]}<button onClick={() => setOrigin('')}><X size={10} /></button></span>}
          {sfEstado     && <span className="rep-chip">Estado: {ESTADO_LABEL[sfEstado]}<button onClick={() => setEstado('')}><X size={10} /></button></span>}
          {sfFechaDesde && <span className="rep-chip">Desde: {sfFechaDesde}<button onClick={() => setFechaDesde('')}><X size={10} /></button></span>}
          {sfFechaHasta && <span className="rep-chip">Hasta: {sfFechaHasta}<button onClick={() => setFechaHasta('')}><X size={10} /></button></span>}
          {cfEmpresa    && <span className="rep-chip">{cfEmpresa}<button onClick={() => setCfEmpresa('')}><X size={10} /></button></span>}
          {cfContrato   && <span className="rep-chip">{cfContrato}<button onClick={() => setCfContrato('')}><X size={10} /></button></span>}
          {cfTipo       && <span className="rep-chip">{cfTipo}<button onClick={() => setCfTipo('')}><X size={10} /></button></span>}
        </div>
      )}

      {/* Summary + pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        <span>
          {vista === 'tabla'
            ? `${filteredDocs.length} documento${filteredDocs.length !== 1 ? 's' : ''}`
            : `${personaGroups.length} persona${personaGroups.length !== 1 ? 's' : ''}`}
          {pagination && ` · Página ${pagination.page} de ${pagination.total_pages} · Total: ${pagination.total}`}
        </span>
        {pagination && pagination.total_pages > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="rep-btn secondary sm" disabled={sfPage <= 1} onClick={() => setSfPage(p => p - 1)}>
              ← Anterior
            </button>
            <button className="rep-btn secondary sm" disabled={sfPage >= pagination.total_pages} onClick={() => setSfPage(p => p + 1)}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Main views */}
      {vista === 'tabla'      && <TablaView />}
      {vista === 'cards'      && <CardsView />}
      {vista === 'expediente' && <ExpedienteView />}
      {vista === 'requisitos' && <RequisitosView />}

      {/* Paquetes documentales (stays mock — no backend endpoint) */}
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
      {viewerDoc && (
        <DocumentViewer doc={viewerDoc} onClose={() => setViewerDoc(null)} />
      )}
      {paqueteOpen && (
        <PaqueteBuilder onClose={() => setPaqueteOpen(false)} onSave={handleNewPaquete} />
      )}

    </div>
  );
}
