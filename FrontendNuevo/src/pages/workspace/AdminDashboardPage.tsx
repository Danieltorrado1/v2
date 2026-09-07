import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminModules } from '../../architecture/moduleCatalog';
import { saasApi, type CompanySaasSummary, type SaasModule } from '../../services/saasApi';
import { WorkspaceHeading } from './StructuralPage';

export function AdminDashboardPage() {
  const [companies, setCompanies] = useState<CompanySaasSummary[] | null>(null);
  const [modules, setModules] = useState<SaasModule[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true; setError('');
    void Promise.allSettled([saasApi.companySummaries(), saasApi.modules()]).then(([clients, catalog]) => {
      if (!live) return;
      if (clients.status === 'fulfilled') setCompanies(clients.value); else setError('No fue posible consultar el estado de clientes.');
      if (catalog.status === 'fulfilled') setModules(catalog.value); else setError('No fue posible consultar el catálogo de módulos.');
    }); return () => { live = false; };
  }, [attempt]);
  const metrics: Array<[string, number | null | undefined]> = [['Empresas totales', companies?.length], ['Empresas activas', null], ['En implementación', null], ['Suspendidas', companies?.filter(company => company.estado_suscripcion === 'SUSPENDIDA').length], ['Usuarios activos', null], ['Personal total gestionado', null], ['Contratos activos', null], ['Módulos activos', modules?.filter(module => module.activo).length]];
  return <section className="workspace-page"><WorkspaceHeading title="Dashboard global" description="Estado general de los clientes y de la plataforma." scope="Empiria Admin" />
    {error && <div role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>}
    <div className="workspace-metrics">{metrics.map(([label, value]) => <section className="workspace-card" key={label}><span>{label}</span><strong>{value ?? 'No disponible'}</strong>{label === 'Suspendidas' && <p>Suscripciones suspendidas</p>}</section>)}</div>
    <div className="workspace-grid"><section className="workspace-card"><h2>Estado de clientes</h2>{companies?.length ? <dl>{['ACTIVA', 'PRUEBA', 'SUSPENDIDA', 'VENCIDA', 'CANCELADA', 'LEGACY'].map(state => <div key={state}><dt>{state}</dt><dd>{companies.filter(company => company.estado_suscripcion === state).length}</dd></div>)}</dl> : <p>Sin información disponible.</p>}</section>
      {['Actividad reciente', 'Alertas', 'Uso de plataforma'].map(title => <section className="workspace-card" key={title}><h2>{title}</h2><p>No disponible.</p></section>)}
      <section className="workspace-card"><h2>Accesos rápidos</h2><ul>{adminModules.slice(1).map(module => <li key={module.code}><Link to={module.route}>{module.label}</Link></li>)}</ul></section>
    </div></section>;
}
