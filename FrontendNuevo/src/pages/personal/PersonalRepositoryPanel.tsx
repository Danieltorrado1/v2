import { catalogDocument, repositoryCell as cellFor, repositoryGroups as groups, repositoryGroup as groupOf, repositoryKey as keyOf, type MatrixItem, type RepositoryRow as Row } from './personalRepositoryModel';
﻿import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileText, Search, Upload, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { configuracionApi } from '../../services/configuracionApi';
import { getAllCatalogPages } from '../../services/catalogPagination';
import type { CatalogoItem } from '../../types/configuracion.types';
import { useAuth } from '../../context/AuthContext';
import { getContractPersonal, getContractPersonalFilterOptions } from '../../services/vinculacionesApi';
import { getChecklistVinculacion, uploadDocumentoPersona, uploadDocumentoVinculacion } from '../../services/documentosApi';
import { getRepositorioDocumentoDetalle, getRepositorioDownloadUrl, getRepositorioDocumentos, exportRepositorioDocumentos } from '../../services/repositorioApi';
import type { ContractPersonalFilterOptions } from '../../types/vinculaciones.types';
import type { RepositorioDocumentoDetalleApi } from '../../types/repositorio.types';

const message = (reason: unknown) => reason instanceof Error ? reason.message : 'No fue posible consultar los documentos.';
const status = (item: MatrixItem) => item.estado_detallado.replaceAll('_', ' ').toLowerCase();

export default function PersonalRepositoryPanel({ contratoId }: { contratoId: number | null }) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const [search, setSearch] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [options, setOptions] = useState<ContractPersonalFilterOptions | null>(null);
  const [catalog, setCatalog] = useState<CatalogoItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [panel, setPanel] = useState<{ row: Row; item?: MatrixItem } | null>(null);
  const [detail, setDetail] = useState<RepositorioDocumentoDetalleApi | null>(null);
  const [panelError, setPanelError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const [file, setFile] = useState<File | null>(null);
  const [issued, setIssued] = useState('');
  const [expires, setExpires] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const limit = 25;

  useEffect(() => {
    let cancelled = false;
    void getAllCatalogPages((page, limit) => configuracionApi.listarTiposDocumento({ page, limit, activo: true }))
      .then(items => { if (!cancelled) setCatalog(items.filter(item => !['EMPRESA', 'CONTRATO', 'BODEGA', 'VEHICULO'].includes(item.alcance ?? ''))); })
      .catch(reason => { if (!cancelled) setError(message(reason)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setPage(1); setRows([]); setPanel(null); setMunicipio(''); setInstitucion(''); setModalidad(''); }, [contratoId]);
  useEffect(() => {
    if (!contratoId) return;
    let cancelled = false;
    void getContractPersonalFilterOptions({ contrato_id: contratoId, municipio_id: municipio ? Number(municipio) : undefined, institucion_id: institucion ? Number(institucion) : undefined })
      .then(value => { if (!cancelled) setOptions(value); }).catch(reason => { if (!cancelled) setError(message(reason)); });
    return () => { cancelled = true; };
  }, [contratoId, municipio, institucion]);

  useEffect(() => {
    if (!contratoId || !permissions.includes('documentos.read')) return;
    let cancelled = false;
    setRows([]); setLoading(true); setError('');
    // Debounce search only. All progress and document states come from the API.
    const timer = window.setTimeout(() => { void (async () => {
      try {
        const result = await getContractPersonal({ contrato_id: contratoId, search: search.trim() || undefined, municipio_id: municipio ? Number(municipio) : undefined, institucion_id: institucion ? Number(institucion) : undefined, modalidad_id: modalidad ? Number(modalidad) : undefined, page, limit });
        if (cancelled) return;
        setTotal(result.pagination.total);
        const next: Row[] = result.items.map(worker => ({ worker }));
        setRows([...next]);
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(4, next.length) }, async () => {
          while (!cancelled && cursor < next.length) {
            const index = cursor++;
            try {
              const worker = next[index].worker;
              const [checklist, documents] = await Promise.all([
                getChecklistVinculacion(worker.vinculacion_id),
                getAllCatalogPages((documentPage, documentLimit) => getRepositorioDocumentos({ contrato_id: contratoId, persona_id: worker.persona_id, incluir_generados: false, es_vigente: true, page: documentPage, limit: documentLimit })),
              ]);
              next[index] = { ...next[index], checklist, documents: documents.filter(doc => doc.origen === 'persona' || doc.vinculacion_id === worker.vinculacion_id) };
            }
            catch (reason) { next[index] = { ...next[index], error: message(reason) }; }
            if (!cancelled) setRows([...next]);
          }
        }));
      } catch (reason) { if (!cancelled) setError(message(reason)); }
      finally { if (!cancelled) setLoading(false); }
    })(); }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [contratoId, search, municipio, institucion, modalidad, page, refresh, user]);

  useEffect(() => {
    setDetail(null); setPanelError(''); setFile(null); setIssued(''); setExpires('');
    if (!panel) return;
    let cancelled = false;
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
    const item = panel.item;
    if (item?.documento_id && item.fuente_documento) {
      void getRepositorioDocumentoDetalle(item.fuente_documento === 'PERSONA' ? 'persona' : 'vinculacion', item.documento_id)
        .then(value => { if (!cancelled) setDetail(value); }).catch(reason => { if (!cancelled) setPanelError(message(reason)); });
    }
    return () => { cancelled = true; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [panel]);

  const columns = useMemo(() => {
    const unique = new Map<string, MatrixItem>();
    catalog.forEach(type => {
      const item = catalogDocument(type);
      unique.set(keyOf(item), item);
    });
    rows.forEach(row => row.checklist?.requisitos.forEach(item => { unique.set(keyOf(item), { ...item, documento_id: null, fuente_documento: null, estado_detallado: 'SIN_DOCUMENTO' }); }));
    return [...unique.values()].sort((a, b) => groups.indexOf(groupOf(a)) - groups.indexOf(groupOf(b)));
  }, [rows, catalog]);


  async function download() {
    const item = panel?.item;
    if (!item?.documento_id || !item.fuente_documento) return;
    setBusy(true); setPanelError('');
    try { const result = await getRepositorioDownloadUrl(item.fuente_documento === 'PERSONA' ? 'persona' : 'vinculacion', item.documento_id); window.open(result.signed_url, '_blank', 'noopener,noreferrer'); }
    catch (reason) { setPanelError(message(reason)); } finally { setBusy(false); }
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!panel?.item?.tipo_documento_id || !file) return;
    setBusy(true); setPanelError('');
    try {
      const fields = { tipo_documento_id: String(panel.item.tipo_documento_id), fecha_expedicion: issued || undefined, fecha_vencimiento: expires || undefined };
      if (panel.item.ambito_documental === 'PERSONA') await uploadDocumentoPersona(panel.row.worker.persona_id, file, fields);
      else await uploadDocumentoVinculacion(panel.row.worker.vinculacion_id, file, fields);
      setPanel(null); setRefresh(value => value + 1);
    } catch (reason) { setPanelError(message(reason)); } finally { setBusy(false); }
  }
  async function exportDocuments() {
    if (!contratoId) return;
    try {
      const csv = await exportRepositorioDocumentos({ contrato_id: contratoId, search: search || undefined });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'repositorio.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(message(reason)); }
  }
  if (!permissions.includes('documentos.read')) return <div className="op-state error">No tienes permiso para consultar documentos.</div>;

  return <section className="op-repository" aria-label="Repositorio de documentos">
    <div className="op-repo-filters">
      <label className="op-search"><Search size={12} /><input aria-label="Buscar en repositorio" placeholder="Buscar nombre o documento..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <select aria-label="Municipio del repositorio" value={municipio} onChange={event => { setMunicipio(event.target.value); setInstitucion(''); setPage(1); }}><option value="">Municipio</option>{options?.municipios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Institución del repositorio" value={institucion} onChange={event => { setInstitucion(event.target.value); setPage(1); }}><option value="">Institución</option>{options?.instituciones.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <select aria-label="Modalidad del repositorio" value={modalidad} onChange={event => { setModalidad(event.target.value); setPage(1); }}><option value="">Modalidad</option>{options?.modalidades.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
      <Link className="op-button secondary" to="/repositorio">Todos los documentos</Link>
      <button type="button" className="op-button secondary" disabled={!contratoId} onClick={() => void exportDocuments()}><Download size={12} /> Exportar documentos</button>
    </div>
    {error && <div className="op-state error" role="alert"><AlertTriangle size={14} />{error}</div>}
    <div className="op-repo-legend"><span className="repo-completo">● Completo</span><span className="repo-pendiente">● Pendiente</span><span className="repo-vencido">● Vencido</span><span>↑ Sin documento</span><span>— No aplica</span>{loading && <span role="status">Consultando documentos…</span>}</div>
    <div className="op-repo-matrix-scroll"><table className="op-repo-matrix">
      <colgroup><col style={{ width: 210 }} />{columns.map(item => <col key={keyOf(item)} style={{ width: 40 }} />)}</colgroup>
      <thead><tr><th />{groups.map((group, index) => { const count = columns.filter(item => groupOf(item) === group).length; return count ? <th key={group} className={`repo-group repo-group-${index}`} colSpan={count}>{group}</th> : null; })}</tr>
        <tr><th className="repo-worker-heading">Trabajador</th>{columns.map(item => <th key={keyOf(item)} title={item.nombre_requisito}><span className="repo-rotated-label">{item.tipo_documento_nombre ?? item.nombre_requisito}</span></th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.worker.vinculacion_id}><td><button className="repo-worker" onClick={() => setPanel({ row })}><span className="op-avatar">{row.worker.nombre_completo.split(' ').slice(0, 2).map(part => part[0]).join('')}</span><span><strong>{row.worker.nombre_completo}</strong><small>{row.worker.numero_documento}</small>{row.error ? <small className="repo-vencido">{row.error}</small> : row.checklist?.tiene_configuracion ? <span className="repo-progress"><progress max={100} value={row.checklist.cumplimiento_porcentaje} />{row.checklist.cumplimiento_porcentaje}%</span> : <small>{row.checklist ? 'Sin requisitos configurados' : 'Consultando…'}</small>}</span></button></td>
        {columns.map(column => { const item = row.checklist ? cellFor(row, column) : undefined; return <td key={keyOf(column)}>{item ? <button className={`repo-cell repo-${item.estado_detallado.toLowerCase()}`} title={`${item.nombre_requisito}: ${status(item)}`} aria-label={`${row.worker.nombre_completo}: ${item.nombre_requisito}, ${status(item)}`} onClick={() => setPanel({ row, item })}>{item.estado_detallado === 'COMPLETO' ? <Check size={12} /> : item.estado_detallado === 'NO_APLICA' ? '—' : item.documento_id ? <FileText size={12} /> : <Upload size={11} />}</button> : <span title={row.checklist ? 'Sin requisito aplicable' : 'Sin consultar'}>—</span>}</td>; })}</tr>)}</tbody>
    </table>{!rows.length && !loading && <div className="op-empty">{contratoId ? 'No hay trabajadores con estos filtros.' : 'Selecciona un contrato.'}</div>}</div>
    <div className="op-pagination"><span>{total ? `${(page - 1) * limit + 1} - ${Math.min(page * limit, total)} de ${total}` : '0 trabajadores'}</span><div className="op-pagination-actions"><button className="op-button secondary" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Anterior</button><button className="op-button secondary" disabled={page * limit >= total || loading} onClick={() => setPage(value => value + 1)}>Siguiente</button></div></div>
    {panel && <div className="op-modal-layer" onClick={event => { if (event.target === event.currentTarget && !busy) setPanel(null); }}><section className="op-modal op-repo-panel" role="dialog" aria-modal="true" aria-label="Documentos del trabajador">
      <header className="op-modal-header"><div><strong>{panel.row.worker.nombre_completo}</strong><p>{panel.row.worker.numero_documento}</p></div><button ref={closeRef} className="op-close-button" aria-label="Cerrar documentos" disabled={busy} onClick={() => setPanel(null)}><X size={16} /></button></header>
      <div className="op-modal-body"><nav className="repo-panel-docs" aria-label="Documentos del trabajador">{columns.map(column => { const item = cellFor(panel.row, column); return <button key={keyOf(item)} disabled={busy} className={`op-button secondary ${panel.item === item ? 'is-active' : ''}`} onClick={() => setPanel({ row: panel.row, item })}>{item.nombre_requisito} · {status(item)}</button>; })}</nav>
        {panel.item && <><h3>{panel.item.nombre_requisito}</h3><span className={`repo-${panel.item.estado_detallado.toLowerCase()}`}>{status(panel.item)}</span>{detail && <dl><dt>Archivo</dt><dd>{detail.documento.nombre_archivo ?? '—'}</dd><dt>Versión</dt><dd>{detail.documento.version ?? '—'}</dd><dt>Carga</dt><dd>{detail.documento.fecha_carga ?? '—'}</dd><dt>Vencimiento</dt><dd>{detail.documento.fecha_vencimiento ?? 'Sin vencimiento'}</dd></dl>}
          {panel.item.documento_id && permissions.includes('documentos.download') && <button className="op-button secondary" disabled={busy} onClick={() => void download()}><Download size={12} /> Descargar</button>}
          {permissions.includes('documentos.upload') && panel.item.tipo_documento_id && <form onSubmit={event => void upload(event)} className="repo-upload"><label>Archivo<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><label>Expedición<input type="date" required={panel.item.requiere_fecha_expedicion} value={issued} onChange={event => setIssued(event.target.value)} /></label><label>Vencimiento<input type="date" required={panel.item.requiere_fecha_vencimiento} value={expires} onChange={event => setExpires(event.target.value)} /></label><button className="op-button primary" disabled={busy || !file}>{busy ? 'Guardando…' : 'Subir documento'}</button></form>}</>}
        {!panel.row.checklist?.tiene_configuracion && <p>Sin requisitos documentales configurados para esta vinculación.</p>}
        {panelError && <div className="op-state error" role="alert">{panelError}</div>}
      </div>
    </section></div>}
  </section>;
}
