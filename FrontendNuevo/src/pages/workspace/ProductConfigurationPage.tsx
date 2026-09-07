import { useSearchParams } from 'react-router-dom';
import { productLabels, productSettings } from '../../architecture/productSettings';
import { tenantModules } from '../../architecture/moduleCatalog';
import { WorkspaceHeading } from './StructuralPage';
import packageInfo from '../../../package.json';

export function ProductConfigurationPage() {
  const [params, setParams] = useSearchParams();
  const active = productSettings.find(section => section.code === params.get('section')) ?? productSettings[0];
  const tokens: Record<string, string> = { Primario: '--color-primary', Secundario: '--text-secondary', Éxito: '--color-success', Advertencia: '--color-warning', Error: '--color-danger', Backgrounds: '--bg-primary', Bordes: '--border-color', Sombras: '--shadow-soft' };
  const versions: Record<string, string> = { Frontend: packageInfo.version, Backend: import.meta.env.VITE_BACKEND_VERSION || 'No disponible', Ambiente: import.meta.env.MODE, 'Fecha de despliegue': import.meta.env.VITE_DEPLOYED_AT || 'No disponible', Commit: import.meta.env.VITE_COMMIT_SHA || 'No disponible', Changelog: 'No disponible' };
  return <section className="workspace-page"><WorkspaceHeading title="Configuración general" description="Identidad y parámetros de Empiria como producto." scope="Empiria Admin" />
    <nav className="workspace-tabs" aria-label="Configuración del producto">{productSettings.map(section => <button key={section.code} className={active.code === section.code ? 'active' : ''} onClick={() => setParams({ section: section.code })}>{section.label}</button>)}</nav>
    <section className="workspace-card"><h2>{active.label}</h2><p>Consulta de la configuración actual y de los campos previstos. La edición centralizada está en configuración.</p></section>
    <div className="workspace-grid">{active.fields.map(field => <section className="workspace-card" key={field}><h3>{field}</h3>
      {active.code === 'identidad' && field === 'Logo principal' ? <img width="180" alt="Logo actual de Empiria" src="/branding/empiria-logo-horizontal-light-web.png" />
        : active.code === 'identidad' && field === 'Logo dark' ? <img width="180" alt="Logo dark actual de Empiria" src="/branding/empiria-logo-horizontal-dark-web.png" />
        : active.code === 'identidad' && field === 'Nombre del producto' ? <p>Empiria</p>
        : active.code === 'etiquetas' ? <p>{productLabels[field]}</p>
        : active.code === 'versiones' ? <p>{versions[field]}</p>
        : active.code === 'apariencia' && tokens[field] ? <p><span className="workspace-preview-color" style={{ background: `var(${tokens[field]})` }} />Token actual: {tokens[field]}</p>
        : active.code === 'feature-flags' ? <p>Estado disponible para el catálogo de funcionalidades.</p>
        : <p>Sin configuración central disponible.</p>}</section>)}</div>
    {active.code === 'feature-flags' && <div className="workspace-card"><h2>Catálogo preparado</h2><p>Los estados de madurez no sustituyen la habilitación comercial ni los permisos de usuario.</p><ul>{tenantModules.map(module => <li key={module.code}>{module.label}: estructura preparada; publicación pendiente.</li>)}</ul></div>}
  </section>;
}
