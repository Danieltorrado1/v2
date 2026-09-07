import { useEffect, useState } from 'react';
import { tenantModules } from '../../architecture/moduleCatalog';
import { saasApi, type SaasModule, type SaasPlan } from '../../services/saasApi';
import { WorkspaceHeading } from './StructuralPage';

export function ModuleCatalogPage() {
  const [modules, setModules] = useState<SaasModule[]>([]);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void Promise.all([saasApi.modules(), saasApi.plans()]).then(([m, p]) => { if (live) { setModules(m); setPlans(p); } }).catch(() => { if (live) setError('No fue posible consultar el catálogo persistido.'); }); return () => { live = false; }; }, []);
  return <section className="workspace-page"><WorkspaceHeading title="Catálogo maestro de módulos" description="Estructura funcional de Empiria, submódulos y relación con los planes." scope="Empiria Admin" />{error && <p role="alert">{error}</p>}
    <div className="workspace-grid">{tenantModules.map(module => { const persisted = modules.find(item => item.codigo === module.code); const Icon = module.icon; return <section className="workspace-card" key={module.code}><h2><Icon size={18} /> {module.label}</h2><p>{module.description}</p><dl><div><dt>Código</dt><dd>{module.code}</dd></div><div><dt>Estado</dt><dd>{persisted ? persisted.activo ? 'Activo en catálogo' : 'Inactivo en catálogo' : 'En configuración'}</dd></div><div><dt>Versión</dt><dd>{module.version ?? 'No disponible'}</dd></div><div><dt>Dependencias</dt><dd>{module.dependencies.join(', ') || 'Sin dependencias declaradas'}</dd></div><div><dt>Planes</dt><dd>{plans.filter(plan => plan.modulos.some(item => item.codigo === module.code && item.habilitado)).map(plan => plan.nombre).join(', ') || 'Sin asignación disponible'}</dd></div><div><dt>Empresas habilitadas</dt><dd>Consultar ficha de empresa</dd></div></dl><details><summary>Submódulos ({module.children.length})</summary><ul>{module.children.map(child => <li key={child.code}><strong>{child.label}</strong><br /><small>{child.code}</small></li>)}</ul></details></section>; })}</div>
  </section>;
}
