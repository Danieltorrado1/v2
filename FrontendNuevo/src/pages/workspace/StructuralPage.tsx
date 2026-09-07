import { Link } from 'react-router-dom';
import type { ModuleEntry } from '../../architecture/moduleCatalog';
import { useCompanyContext } from '../../context/CompanyContext';

export function WorkspaceHeading({ title, description, scope = 'Empiria Empresa' }: { title: string; description: string; scope?: string }) {
  return <header className="workspace-heading"><div><span className="workspace-eyebrow">{scope}</span><h1>{title}</h1><p>{description}</p></div></header>;
}
export function StructuralPage({ entry }: { entry: ModuleEntry }) {
  const { empresaActual } = useCompanyContext();
  const isLegislation = entry.code.includes('LEGISLACION');
  return <section className="workspace-page">
    <WorkspaceHeading title={entry.label} description={entry.description} scope={empresaActual?.nombre_empresa ?? 'Empiria Empresa'} />
    <div className="workspace-card"><span className="workspace-badge">En configuración</span><p>Este espacio está preparado para organizar {entry.label.toLocaleLowerCase('es')}. Aún no hay registros disponibles.</p></div>
    {entry.view === 'sst-classification' && <section className="workspace-card"><h2>Perfil de la empresa</h2><p>Cuestionario previsto. La captura y la determinación de obligaciones estarán disponibles al finalizar su configuración.</p><fieldset disabled className="workspace-grid"><legend>Datos de clasificación</legend>{entry.sections.map(field => <label key={field}>{field}<input placeholder="Sin información" readOnly /></label>)}</fieldset></section>}
    {isLegislation && <div className="workspace-status-list" aria-label="Estados previstos">{['OBLIGATORIO', 'APLICA', 'NO APLICA', 'PENDIENTE', 'CUMPLIDO'].map(label => <span className="workspace-badge" key={label}>{label}</span>)}</div>}
    <div className="workspace-grid">{entry.sections.map(section => <section className="workspace-card" key={section}><h2>{section}</h2><p>Sin información disponible.</p></section>)}</div>
  </section>;
}
export function ToolsPage() {
  return <section className="workspace-page"><WorkspaceHeading title="Herramientas" description="Utilidades de apoyo para la gestión de personal." /><div className="workspace-grid"><section className="workspace-card"><h2>Calculadora salarial</h2><p>Consulta la herramienta salarial existente.</p><Link to="/herramientas/calculadora-salario">Abrir calculadora</Link></section></div></section>;
}
