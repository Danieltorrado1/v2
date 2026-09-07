import { useEffect, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext';
import { configuracionApi } from '../../services/configuracionApi';
import { getContractPersonalFilterOptions, getPersonalResumen } from '../../services/vinculacionesApi';
import type { Contrato } from '../../types/configuracion.types';
import type { ContractPersonalFilterOptions, PersonalResumen } from '../../types/vinculaciones.types';
import { WorkspaceHeading } from './StructuralPage';

export function ContractOverview({ institutions = false }: { institutions?: boolean }) {
  const { empresaId } = useCompanyContext();
  const [contracts, setContracts] = useState<Contrato[]>([]);
  const [contractId, setContractId] = useState('');
  const [summary, setSummary] = useState<PersonalResumen | null>(null);
  const [options, setOptions] = useState<ContractPersonalFilterOptions | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let live = true;
    setContracts([]); setContractId(''); setSummary(null); setOptions(null); setError('');
    if (empresaId) void configuracionApi.listarContratos({ empresa_id: empresaId, limit: 100, activo: true }).then(data => {
      if (live) setContracts(data.items.filter(item => item.empresa.id === empresaId));
    }).catch(() => { if (live) setError('No fue posible consultar los contratos autorizados.'); });
    return () => { live = false; };
  }, [empresaId]);
  useEffect(() => {
    let live = true;
    setSummary(null); setOptions(null); setError(''); setLoading(false);
    if (!contractId || !contracts.some(item => String(item.id) === contractId)) return;
    setLoading(true);
    const request = institutions ? getContractPersonalFilterOptions({ contrato_id: Number(contractId) }).then(value => { if (live) setOptions(value); })
      : getPersonalResumen({ contrato_id: Number(contractId) }).then(value => { if (live) setSummary(value); });
    void request.catch(() => { if (live) setError('No fue posible cargar la información del contrato.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [contractId, contracts, institutions]);
  const metrics: Array<[string, number | undefined]> = [['Personal activo', summary?.trabajadores_activos], ['Ingresos', summary?.ingresos_mes], ['Retiros', summary?.retiros_mes], ['Contratos por vencer', undefined], ['Documentos pendientes', undefined]];
  return <section className="workspace-page"><WorkspaceHeading title={institutions ? 'Instituciones' : 'Estadísticas de personal'} description={institutions ? 'Instituciones y sedes del catálogo operativo existente, por contrato.' : 'Resumen del personal del contrato seleccionado.'} />
    <label>Contrato<select aria-label="Contrato" value={contractId} onChange={event => setContractId(event.target.value)}><option value="">Selecciona un contrato</option>{contracts.map(item => <option key={item.id} value={item.id}>{item.numero_contrato}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Cargando información…</p>}
    {institutions ? <><div className="workspace-card"><p>Consulta del catálogo compartido. La edición ampliada de dirección, modalidad, cupos y jornada está en configuración.</p></div><label>Buscar institución<input value={search} onChange={e => setSearch(e.target.value)} /></label><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr>{['Institución / centro educativo', 'Sede', 'Municipio', 'Dirección', 'Modalidad', 'Cupos', 'Jornada', 'Estado'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{options?.instituciones.filter(item => item.nombre.toLowerCase().includes(search.toLowerCase())).map(item => <tr key={item.id}><td>{item.nombre}</td><td>{options.sedes.filter(sede => sede.institucion_id === item.id).map(sede => sede.nombre).join(', ') || 'No disponible'}</td><td>{options.municipios.find(m => m.id === item.municipio_id)?.nombre ?? 'No disponible'}</td>{Array.from({ length: 5 }, (_, index) => <td key={index}>No disponible</td>)}</tr>)}</tbody></table>{!options?.instituciones.length && <p className="workspace-empty">{contractId ? 'Sin instituciones disponibles.' : 'Selecciona un contrato para consultar instituciones y sedes.'}</p>}</div></>
      : <><div className="workspace-metrics">{metrics.map(([label, value]) => <section key={label} className="workspace-card"><span>{label}</span><strong>{value ?? 'No disponible'}</strong></section>)}</div><div className="workspace-grid">{['Distribución por cargo', 'Distribución por municipio', 'Distribución por modalidad'].map(label => <section className="workspace-card" key={label}><h2>{label}</h2><p>No disponible.</p></section>)}</div></>}
  </section>;
}
