import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { operacionApi, type Institution, type InstitutionOption, type InstitutionResult } from '../../services/operacionApi';
import { getTenantContext } from '../../services/tenantApi';
import { useCompanyContext } from '../../context/CompanyContext';
import { WorkspaceHeading } from '../workspace/StructuralPage';
import './OperacionPages.css';

type InstitutionDetail = Institution & { id: string; sedes?: Array<{ id: string; nombre: string; codigo_dane_sede: string | null; consecutivo_sede: string | null; municipio_id: string | null; activo: boolean; matricula?: number; focalizados?: number }> };
const emptyResult: InstitutionResult = { items: [], total: 0, page: 1, page_size: 50, total_pages: 0, summary: { instituciones: 0, sedes: 0, cupos: 0 }, options: { municipios: [], instituciones: [], sedes: [], modalidades: [] } };
const optionLabel = (item: InstitutionOption) => item.nombre || 'Sin nombre';

export default function OperacionInstitucionesFinalPage() {
  const { empresaId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<InstitutionResult>(emptyResult);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [municipioId, setMunicipioId] = useState(searchParams.get('municipio_id') ?? '');
  const [institucionId, setInstitucionId] = useState(searchParams.get('institucion_id') ?? '');
  const [sedeId, setSedeId] = useState(searchParams.get('sede_id') ?? '');
  const [modalidadId, setModalidadId] = useState(searchParams.get('modalidad_id') ?? '');
  const [page, setPage] = useState(Number(searchParams.get('page') ?? 1) || 1);
  const [pageSize, setPageSize] = useState(Number(searchParams.get('page_size') ?? 50) || 50);
  const [contractId, setContractId] = useState<number | null>(null);
  const [contracts, setContracts] = useState<Array<{ id: number; numero_contrato: string | null }>>([]);
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getTenantContext().then((context) => {
      if (cancelled) return;
      const available = context.contratos.filter((contract) => contract.empresa_id === empresaId);
      setContracts(available);
      const preferred = context.contrato_default_id && available.some((contract) => contract.id === context.contrato_default_id)
        ? context.contrato_default_id
        : available[0]?.id ?? null;
      setContractId((current) => current && available.some((contract) => contract.id === current) ? current : preferred);
    }).catch(() => {
      if (!cancelled) setMessage('No fue posible resolver el contrato activo.');
    });
    return () => { cancelled = true; };
  }, [empresaId]);

  useEffect(() => {
    const next = new URLSearchParams();
    const values: Record<string, string> = { q: search, municipio_id: municipioId, institucion_id: institucionId, sede_id: sedeId, modalidad_id: modalidadId, page: String(page), page_size: String(pageSize) };
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setSearchParams(next, { replace: true });
  }, [search, municipioId, institucionId, sedeId, modalidadId, page, pageSize, setSearchParams]);

  useEffect(() => {
    if (!contractId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setMessage('');
      void operacionApi.institutions({ q: search || undefined, municipio_id: municipioId || undefined, institucion_id: institucionId || undefined, sede_id: sedeId || undefined, modalidad_id: modalidadId || undefined, contrato_id: contractId, page, page_size: pageSize })
        .then((response) => { if (!cancelled) setResult(response.data); })
        .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Error cargando instituciones.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [contractId, search, municipioId, institucionId, sedeId, modalidadId, page, pageSize]);

  const institutions = useMemo(() => result.options.instituciones.filter((item) => !municipioId || item.municipio_id === municipioId), [result.options.instituciones, municipioId]);
  const sites = useMemo(() => result.options.sedes.filter((item) => (!municipioId || item.municipio_id === municipioId) && (!institucionId || item.institucion_id === institucionId)), [result.options.sedes, municipioId, institucionId]);
  const start = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const end = Math.min(result.page * result.page_size, result.total);

  const clearDependent = (nextMunicipio: string) => {
    setMunicipioId(nextMunicipio); setInstitucionId(''); setSedeId(''); setPage(1);
  };
  const open = async (row: Institution) => {
    try { setDetail((await operacionApi.institution(row.institucion_id)).data as InstitutionDetail); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible abrir el expediente.'); }
  };

  return <section className="workspace-page operacion-page instituciones-page">
    <WorkspaceHeading title="Instituciones" description="Consulta operativa por sede y modalidad del contrato activo." />
    <div className="instituciones-context">
      <span>Contrato activo:</span>
      {contracts.length > 1 ? <select aria-label="Contrato activo" value={contractId ?? ''} onChange={(event) => { setContractId(Number(event.target.value)); setPage(1); }}>
        {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.numero_contrato ?? `Contrato ${contract.id}`}</option>)}
      </select> : <strong>{contracts[0]?.numero_contrato ?? (contractId ? `Contrato ${contractId}` : 'Resolviendo...')}</strong>}
    </div>
    <div className="instituciones-search-row"><input aria-label="Buscar por institución, sede, DANE o código DANE" placeholder="Buscar por institución, sede, DANE o código DANE..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
    <div className="instituciones-filters">
      <label>Municipio<select value={municipioId} onChange={(event) => clearDependent(event.target.value)}><option value="">Todos</option>{result.options.municipios.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
      <label>Institución<select value={institucionId} onChange={(event) => { setInstitucionId(event.target.value); setSedeId(''); setPage(1); }}><option value="">Todas</option>{institutions.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
      <label>Sede<select value={sedeId} onChange={(event) => { setSedeId(event.target.value); setPage(1); }}><option value="">Todas</option>{sites.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
      <label>Modalidad<select value={modalidadId} onChange={(event) => { setModalidadId(event.target.value); setPage(1); }}><option value="">Todas</option>{result.options.modalidades.map((item) => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}</select></label>
    </div>
    {message && <p className="operacion-message" role="status">{message}</p>}
    <div className="instituciones-summary"><strong>{result.summary.instituciones} instituciones</strong><span>·</span><strong>{result.summary.sedes} sedes</strong><span>·</span><strong>{result.summary.cupos.toLocaleString('es-CO')} cupos</strong>{loading && <span> Cargando...</span>}</div>
    <div className="operacion-table-wrap instituciones-table-wrap"><table><thead><tr>{['INSTITUCIÓN','SEDE','MUNICIPIO','MODALIDAD','CUPOS','JORNADA','ZONA','ESTADO','ACCIONES'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
      {result.items.map((row) => <tr key={`${row.sede_id ?? row.institucion_id}-${row.modalidad_id ?? 'sin-modalidad'}`}><td>{row.institucion}</td><td>{row.sede ?? 'Sin sede'}</td><td>{row.municipio ?? 'Sin municipio'}</td><td>{row.modalidad ?? 'Sin modalidad'}</td><td>{row.cupos == null ? '—' : row.cupos.toLocaleString('es-CO')}</td><td>{row.jornada ?? '—'}</td><td>{row.zona ?? '—'}</td><td><span className={`instituciones-status ${row.estado ? 'is-active' : 'is-inactive'}`}>{row.estado ? 'Activa' : 'Inactiva'}</span></td><td><button type="button" className="instituciones-action" onClick={() => void open(row)}>Ver expediente</button></td></tr>)}
      {!loading && result.items.length === 0 && <tr><td colSpan={9} className="instituciones-empty">No hay resultados para los filtros actuales.</td></tr>}
    </tbody></table></div>
    <div className="instituciones-pagination"><label>Filas:<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span>{start} - {end} de {result.total}</span><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button type="button" disabled={page >= result.total_pages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div>
    {detail && <aside className="operacion-drawer"><button className="drawer-close" type="button" onClick={() => setDetail(null)}>Cerrar</button><h2>{detail.institucion}</h2><p>{detail.dane ?? 'Sin DANE'} · {detail.municipio ?? 'Sin municipio'}</p><h3>Sedes</h3>{(detail.sedes ?? []).map((site) => <div key={site.id} className={`workspace-card ${site.id === detail.sede_id ? 'instituciones-drawer-selected' : ''}`}><strong>{site.nombre}</strong><p>{site.codigo_dane_sede ?? 'Sin código DANE'} · {site.activo ? 'Activa' : 'Inactiva'}</p></div>)}</aside>}
  </section>;
}