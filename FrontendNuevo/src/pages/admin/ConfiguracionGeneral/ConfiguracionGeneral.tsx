import { useState } from 'react';
import {
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  ClipboardList,
  FileText,
  MapPin,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { EmpresasTab }     from './tabs/EmpresasTab';
import { ContratosTab }    from './tabs/ContratosTab';
import { RolesTab }        from './tabs/RolesTab';
import { UsuariosTab }     from './tabs/UsuariosTab';
import { CatalogosTab }    from './tabs/CatalogosTab';
import { CargosTab }       from './tabs/CargosTab';
import { RequisitosTab }   from './tabs/RequisitosTab';
import { SalariosTab }     from './tabs/SalariosTab';
import { CalculadorasSection } from './tabs/CalculadorasSection';
import { MunicipiosTab }   from './tabs/MunicipiosTab';
import './ConfiguracionGeneral.css';

type TabId =
  | 'empresas'
  | 'contratos'
  | 'roles'
  | 'usuarios'
  | 'catalogos'
  | 'cargos'
  | 'requisitos'
  | 'salarios'
  | 'calculadoras'
  | 'municipios';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'empresas',      label: 'Empresas',      icon: <Building2 size={14} /> },
  { id: 'contratos',     label: 'Contratos',     icon: <FileText size={14} /> },
  { id: 'roles',         label: 'Roles',         icon: <ShieldCheck size={14} /> },
  { id: 'usuarios',      label: 'Usuarios',      icon: <Users size={14} /> },
  { id: 'catalogos',     label: 'Catálogos',     icon: <BookOpen size={14} /> },
  { id: 'cargos',        label: 'Cargos',        icon: <Briefcase size={14} /> },
  { id: 'requisitos',    label: 'Documentos',    icon: <ClipboardList size={14} /> },
  { id: 'salarios',      label: 'Salarios',      icon: <Banknote size={14} /> },
  { id: 'calculadoras',  label: 'Calculadoras',  icon: <Calculator size={14} /> },
  { id: 'municipios',    label: 'Municipios',    icon: <MapPin size={14} /> },
];

export default function ConfiguracionGeneral() {
  const [activeTab, setActiveTab] = useState<TabId>('empresas');

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-header-title"><Settings size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Configuración General</h1>
          <p className="adm-header-sub">Centro maestro de parametrización de Empiria</p>
        </div>
      </div>

      <nav className="adm-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`adm-nav-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="adm-content">
        {activeTab === 'empresas'     && <EmpresasTab />}
        {activeTab === 'contratos'    && <ContratosTab />}
        {activeTab === 'roles'        && <RolesTab />}
        {activeTab === 'usuarios'     && <UsuariosTab />}
        {activeTab === 'catalogos'    && <CatalogosTab />}
        {activeTab === 'cargos'       && <CargosTab />}
        {activeTab === 'requisitos'   && <RequisitosTab />}
        {activeTab === 'salarios'     && <SalariosTab />}
        {activeTab === 'calculadoras' && <CalculadorasSection />}
        {activeTab === 'municipios'   && <MunicipiosTab />}
      </div>
    </div>
  );
}
