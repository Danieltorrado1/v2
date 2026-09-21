import PersonalDocumentReview from './PersonalDocumentReview';
import PersonalRepositoryProgress from './RepositoryWorkerProgress';
import { contextualPersonalOptions } from './personalOperationalFilters';
import { ApiClientError } from '../../services/apiClient';
import { getPersonalRepositoryPage } from '../../services/personalRepositoryApi';
import { canonicalColumns, repositoryCell as cellFor, repositoryGroups as groups, repositoryGroup as groupOf, repositoryKey as keyOf, type MatrixItem, type RepositoryRow as Row } from './personalRepositoryModel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, Download, Minus, Search, X, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { configuracionApi } from '../../services/configuracionApi';
import { getAllCatalogPages } from '../../services/catalogPagination';
import type { CatalogoItem } from '../../types/configuracion.types';
import { useAuth } from '../../context/AuthContext';
import { getContractPersonalFilterOptions } from '../../services/vinculacionesApi';
import { getRepositorioDownloadUrl, exportRepositorioDocumentos } from '../../services/repositorioApi';
import type { ContractPersonalFilterOptions } from '../../types/vinculaciones.types';

const message = (reason: unknown) => {
  if (reason instanceof ApiClientError && reason.status === 429) return 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.';
  if (reason instanceof ApiClientError && reason.status >= 500) return 'No fue posible cargar el repositorio documental. Intenta nuevamente.';
  return reason instanceof Error ? reason.message : 'No fue posible consultar los documentos.';
};
const status = (item: MatrixItem) => statusIcon(item.estado_detallado).label;
const statusIcon = (state: string) => {
  if (state === 'APROBADO' || state === 'COMPLETO') return { label: 'Aprobado', Icon: CheckCircle2, tone: 'approved' };
  if (state === 'PENDIENTE_REVISION' || state === 'PENDIENTE' || state === 'PARCIAL') return { label: 'Pendiente de revisión', Icon: AlertCircle, tone: 'pending' };
  if (state === 'POR_VENCER') return { label: 'Por vencer', Icon: Clock3, tone: 'warning' };
  if (state === 'VENCIDO' || state === 'RECHAZADO') return { label: state === 'RECHAZADO' ? 'Rechazado' : 'Vencido', Icon: XCircle, tone: 'danger' };
  if (state === 'NO_APLICA') return { label: 'No aplica', Icon: Minus, tone: 'na' };
  if (state === 'SIN_DOCUMENTO' || state === 'ACREDITABLE') return { label: 'Sin documento', Icon: Minus, tone: 'empty' };
  if (import.meta.env.DEV) console.warn('[repository-state] Estado documental no reconocido', state);
  return { label: 'Estado no reconocido', Icon: Minus, tone: 'empty' };
};
const stateMark = (state: string) => { const { Icon, label, tone } = statusIcon(state); return <span title={label} aria-label={label}><Icon className={'repo-status-icon is-' + tone} size={15} aria-hidden="true" /></span>; };
const groupLabels: Record<(typeof groups)[number], string> = {
  DATOS_PERSONALES: 'Datos personales', AUTORIZACIONES: 'Autorizaciones', FORMACION: 'Formación',
  CONTRATACION: 'Contratación', SEGURIDAD_SOCIAL: 'Seguridad social', SST: 'SST',
  MANIPULACION: 'Manipulación', ANTECEDENTES: 'Antecedentes', ACREDITACIONES: 'Acreditaciones',
};

export default function PersonalRepositoryPanel({ contratoId }: { contratoId: number | null }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [search, setSearch] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [sede, setSede] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [cargo, setCargo] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [sortBy, setSortBy] = useState<'nombre_asc'|'nombre_desc'|'ingreso_desc'|'ingreso_asc'|'municipio_asc'|'institucion_asc'|'cargo_asc'|'cumplimiento_desc'|'cumplimiento_asc'>('ingreso_desc');
  const [allOptions, setOptions] = useState<ContractPersonalFilterOptions | null>(null);
  const options = allOptions ? contextualPersonalOptions(allOptions, { municipio_id: municipio, institucion_id: institucion, sede_id: sede }) : null;
  const [catalog, setCatalog] = useState<CatalogoItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [panel, setPanel] = useState<{ row: Row; item?: MatrixItem } | null>(null);
  const [panelError, setPanelError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const closeRef = useRef<HTMLButtonElement>(null);
  const limit = 25;
  const canRead = permissions.includes('documentos.read');
  const [retryAt, setRetryAt] = useState(0);
  const retryAction = useRef<(() => void) | null>(null);
  const [retryWaiting, setRetryWaiting] = useState(false);
  const optionCache = useRef(new Map<string, Promise<ContractPersonalFilterOptions>>());
  const catalogRequest = useRef<Promise<CatalogoItem[]> | null>(null);
  function reportError(reason: unknown, action?: () => void) {
    retryAction.current = action ?? null;
    setError(message(reason));
    if (reason instanceof ApiClientError && reason.status === 429) {
      setRetryAt(Date.now() + (reason.retryAfterMs ?? 3000)); setRetryWaiting(true);
    }
  }
  function retryRequest() {
    if (retryWaiting) return;
    setError(''); setPanelError('');
    const action = retryAction.current; retryAction.current = null;
    if (action) action(); else setRefresh(value => value + 1);
  }
  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setTimeout(() => setRetryWaiting(false), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  useEffect(() => {
    let cancelled = false;
    catalogRequest.current ??= getAllCatalogPages((page, limit) => configuracionApi.listarTiposDocumento({ page, limit, activo: true }));
    void catalogRequest.current
      .then(items => { if (!cancelled) setCatalog(items.filter(item => !['EMPRESA', 'CONTRATO', 'BODEGA', 'VEHICULO'].includes(item.alcance ?? ''))); })
      .catch(reason => { catalogRequest.current = null; if (!cancelled) reportError(reason); });
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => { setPage(1); setRows([]); setOptions(null); setPanel(null); setMunicipio(''); setInstitucion(''); setSede(''); setCargo(''); setModalidad(''); setSortBy('ingreso_desc'); }, [contratoId]);
  useEffect(() => {
    if (!contratoId || retryAt > Date.now()) return;
    let cancelled = false;
    const key = `${contratoId}`;
    let request = optionCache.current.get(key);
    if (!request) {
      request = getContractPersonalFilterOptions({ contrato_id: contratoId });
      optionCache.current.set(key, request);
    }
    void request.then(value => { if (!cancelled) setOptions(value); }).catch(reason => {
      optionCache.current.delete(key); if (!cancelled) reportError(reason);
    });
    return () => { cancelled = true; };
  }, [contratoId, refresh]);

  useEffect(() => {
    if (!contratoId || !canRead) return;
    if (retryAt > Date.now()) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => { void (async () => {
      try {
        const result = await getPersonalRepositoryPage({ contrato_id: contratoId, search: search.trim() || undefined,
          municipio_id: municipio ? Number(municipio) : undefined, institucion_id: institucion ? Number(institucion) : undefined,
          sede_id: sede ? Number(sede) : undefined, contrato_cargo_id: cargo ? Number(cargo) : undefined, modalidad_id: modalidad ? Number(modalidad) : undefined,
          sort_by: sortBy.startsWith('nombre') ? 'nombre' : sortBy.startsWith('ingreso') ? 'ingreso' : sortBy.startsWith('municipio') ? 'municipio' : sortBy.startsWith('institucion') ? 'institucion' : sortBy.startsWith('cargo') ? 'cargo' : 'cumplimiento',
          sort_dir: sortBy.endsWith('desc') ? 'desc' : 'asc', page, limit }, controller.signal);
        if (!controller.signal.aborted) { setRows(result.rows); setTotal(result.total); }
      } catch (reason) { if (!controller.signal.aborted) reportError(reason); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })(); }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [contratoId, search, municipio, institucion, sede, modalidad, sortBy, page, refresh, canRead]);

  useEffect(() => {
    setPanelError('');
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) setPanel(null);
      if (event.key === 'Tab') {
        const elements = closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]');
        if (!elements?.length) return;
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [panel, refresh]);

  const columns = useMemo(() => canonicalColumns(catalog), [catalog]);

  const [expandedGroup, setExpandedGroup] = useState<(typeof groups)[number]>(groups[0]);
  const visibleColumns = useMemo(() => columns.filter(item => groupOf(item) === expandedGroup), [columns, expandedGroup]);

  useEffect(() => {
    setPanel(current => {
      if (!current) return current;
      const row = rows.find(value => value.worker.vinculacion_id === current.row.worker.vinculacion_id);
      if (!row || row === current.row) return current;
      const column = columns.find(value => value.canonical_code === current.item?.canonical_code);
      return { row, item: column ? cellFor(row, column) : undefined };
    });
  }, [rows, columns]);

  async function download(supportId?: number) {
    if (retryAt > Date.now()) return;
    const item = supportId ? { documento_id: supportId, fuente_documento: 'PERSONA' } : panel?.item;
    if (!item?.documento_id || !item.fuente_documento) return;
    setBusy(true); setPanelError('');
    try { const result = await getRepositorioDownloadUrl(item.fuente_documento === 'PERSONA' ? 'persona' : 'vinculacion', item.documento_id); window.open(result.signed_url, '_blank', 'noopener,noreferrer'); }
    catch (reason) { setPanelError(message(reason)); reportError(reason, () => void download(supportId)); } finally { setBusy(false); }
  }
  async function exportDocuments() {
    if (!contratoId || retryAt > Date.now()) return;
    try {
      const csv = await exportRepositorioDocumentos({ contrato_id: contratoId, search: search || undefined });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'repositorio.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { reportError(reason, () => void exportDocuments()); }
  }
  if (!permissions.includes('documentos.read')) return <div className="op-state error">No tienes permiso para consultar documentos.</div>;

  return <section className="op-repository" aria-label="Repositorio de documentos">
    <div className="op-repo-filters">
      <label className="op-search"><Search size={12} /><input aria-label="Buscar en repositorio" placeholder="Buscar nombre o documento..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <select aria-label="Municipio del repositorio" value={municipio} onChange={event => { setMunicipio(event.target.value); setPage(1); }}><option value="">Municipio</option>{options?.municipios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Institucion del repositorio" value={institucion} onChange={event => { setInstitucion(event.target.value); setPage(1); }}><option value="">Institucion</option>{options?.instituciones.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Sede del repositorio" value={sede} onChange={event => { setSede(event.target.value); setPage(1); }}><option value="">Sedes</option>{options?.sedes.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Cargo del repositorio" value={cargo} onChange={event => { setCargo(event.target.value); setPage(1); }}><option value="">Cargo</option>{options?.cargos.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Modalidad del repositorio" value={modalidad} onChange={event => { setModalidad(event.target.value); setPage(1); }}><option value="">Modalidad</option>{options?.modalidades.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <label className="op-repo-sort"><span>Ordenar por</span><select aria-label="Ordenar por" value={sortBy} onChange={event => { setSortBy(event.target.value as typeof sortBy); setPage(1); }}><option value="nombre_asc">Nombre A–Z</option><option value="nombre_desc">Nombre Z–A</option><option value="ingreso_desc">Ingreso reciente</option><option value="ingreso_asc">Ingreso antiguo</option><option value="municipio_asc">Municipio A–Z</option><option value="institucion_asc">Institución A–Z</option><option value="cargo_asc">Cargo A–Z</option><option value="cumplimiento_desc">Cumplimiento mayor → menor</option><option value="cumplimiento_asc">Cumplimiento menor → mayor</option></select></label>
      <Link className="op-button secondary" to="/repositorio">Todos los documentos</Link>
      <button type="button" className="op-button secondary" disabled={!contratoId} onClick={() => void exportDocuments()}><Download size={12} /> Exportar documentos</button>
    </div>
    {error && <div className="repo-request-notice" role="alert"><AlertTriangle size={14} />{error}<button type="button" className="op-button secondary" disabled={retryWaiting || loading} onClick={retryRequest}>Reintentar</button></div>}
    <div className="op-repo-legend" aria-label="Leyenda de estados"><span>{stateMark('APROBADO')} Aprobado</span><span>{stateMark('PENDIENTE_REVISION')} Pendiente de revisión</span><span>{stateMark('POR_VENCER')} Por vencer</span><span>{stateMark('VENCIDO')} Vencido</span><span>{stateMark('RECHAZADO')} Rechazado</span><span>{stateMark('NO_APLICA')} No aplica</span><span>{stateMark('SIN_DOCUMENTO')} Sin documento</span>{loading && <span role="status">Consultando...</span>}</div>
    <div className="op-repo-matrix-scroll"><table className="op-repo-matrix"><colgroup><col style={{ width: 300 }} />{visibleColumns.map(item => <col key={keyOf(item)} />)}</colgroup>
      <thead><tr className="repo-groups-row"><th className="repo-worker-heading" rowSpan={2}>Trabajador</th><th colSpan={visibleColumns.length} className="repo-groups-heading"><div className="repo-header-groups" role="tablist" aria-label="Grupos documentales">{groups.map(group => <button key={group} type="button" role="tab" aria-selected={expandedGroup === group} className={expandedGroup === group ? 'is-active' : ''} onClick={() => setExpandedGroup(group)}>{groupLabels[group]}</button>)}</div></th></tr>
      <tr className="repo-requirements-row">{visibleColumns.map(item => <th key={keyOf(item)} scope="col" title={item.nombre_requisito}>{item.nombre_requisito}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.worker.vinculacion_id} data-worker-id={row.worker.vinculacion_id}><td><button className="repo-worker" onClick={() => setPanel({ row })}><span className="op-avatar">{row.worker.nombre_completo.split(' ').slice(0, 2).map(part => part[0]).join('')}</span><span><strong>{row.worker.nombre_completo}</strong><small>{row.worker.numero_documento}</small></span></button><PersonalRepositoryProgress checklist={row.checklist} /></td>{visibleColumns.map(column => { const item = row.checklist ? cellFor(row, column) : undefined; const text = item?.proceso ? (item.entregas ? `${item.entregas.length} entregas` : 'Sin acceso SST') : item ? status(item) : 'Sin documento'; return <td key={keyOf(column)}>{item ? <button data-requirement={item.canonical_code} data-document-state={item.estado_detallado} className={`repo-cell repo-${item.estado_detallado.toLowerCase()}`} title={`${item.nombre_requisito}: ${status(item)}`} onClick={() => setPanel({ row, item })}>{text}</button> : text}</td>; })}</tr>)}</tbody>
    </table>{!rows.length && !loading && <div className="op-empty">{contratoId ? 'No hay trabajadores con estos filtros.' : 'Selecciona un contrato.'}</div>}</div>    <div className="op-pagination"><span>{total ? `${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} de ${total}` : '0 trabajadores'}</span><div className="op-pagination-actions"><button className="op-button secondary" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><button className="op-button secondary" disabled={page * limit >= total || loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></div></div>
    {panel && <div className="op-modal-layer" onClick={event => { if (event.target === event.currentTarget && !busy) setPanel(null); }}><section className="op-modal op-repo-panel" role="dialog" aria-modal="true" aria-label="Documentos del trabajador">
      <header className="op-modal-header"><div><strong>{panel.row.worker.nombre_completo}</strong><p>{panel.row.worker.numero_documento}</p></div><button ref={closeRef} className="op-close-button" aria-label="Cerrar documentos" disabled={busy} onClick={() => setPanel(null)}><X size={16} /></button></header>
      <div className="op-modal-body repo-review-layout">
        <aside><p>{panel.row.worker.nombre_completo}</p><p>{[panel.row.worker.asignacion_actual.institucion, panel.row.worker.asignacion_actual.sede, panel.row.worker.asignacion_actual.municipio].filter((value): value is string => Boolean(value?.trim())).map((value, index) => <span key={`${value}-${index}`}>{index > 0 && <br />}{value}</span>)}{![panel.row.worker.asignacion_actual.institucion, panel.row.worker.asignacion_actual.sede, panel.row.worker.asignacion_actual.municipio].some(value => Boolean(value?.trim())) && 'Sin contexto laboral registrado'}</p><nav className="repo-panel-docs" aria-label="Documentos del trabajador">{groups.map(group => { const groupColumns=columns.filter(column=>groupOf(column)===group); return groupColumns.length ? <section className="repo-doc-group" key={group}><h4>{groupLabels[group]}</h4>{groupColumns.map(column => { const item = cellFor(panel.row, column); return <button key={keyOf(item)} data-requirement={item.canonical_code} disabled={busy} className={`op-button secondary ${panel.item?.canonical_code === item.canonical_code ? 'is-active' : ''}`} onClick={() => setPanel({ row: panel.row, item })}>{item.nombre_requisito} Â· {status(item)}</button>; })}</section> : null; })}</nav></aside>
        <div>{panel.item && !panel.item.proceso && <PersonalDocumentReview key={`${panel.row.worker.vinculacion_id}:${panel.item.canonical_code}`} row={panel.row} item={panel.item} permissions={permissions} onChanged={()=>setRefresh(value=>value+1)} onBusy={setBusy}/>}
        {panel.item?.proceso && <><h3>{panel.item.nombre_requisito}</h3>{panel.item.entregas ? <ul className="repo-delivery-history">{panel.item.entregas.map(entrega=><li key={entrega.id}>{entrega.fecha} ? {entrega.elemento} ? {entrega.cantidad} ? {entrega.estado}{entrega.documento_id&&permissions.includes('documentos.download')&&<button className="op-button secondary" disabled={busy} onClick={()=>void download(entrega.documento_id!)}>Descargar soporte</button>}</li>)}</ul>:<p>No tienes permiso para consultar el hist?rico SST.</p>}</>}
        {!panel.item&&<p>Selecciona un requisito para ver archivos y revisiones.</p>}
        {panelError&&<p role="alert">{panelError}</p>}</div>
      </div>
    </section></div>}
  </section>;
}
