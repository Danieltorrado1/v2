import { useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Building2,
  FileText,
  Settings,
  Users,
  Boxes,
  SlidersHorizontal,
} from 'lucide-react';
import { EmpresasTab } from './tabs/EmpresasTab';
import { ContratosTab } from './tabs/ContratosTab';
import { UsuariosTab } from './tabs/UsuariosTab';
import { CatalogosTab } from './tabs/CatalogosTab';
import { CargosTab } from './tabs/CargosTab';
import { PlanesModulosTab } from './tabs/PlanesModulosTab';
import { EmpresaConfiguracionTab } from './tabs/EmpresaConfiguracionTab';
import { NominaProcesosTab } from './tabs/NominaProcesosTab';
import './ConfiguracionGeneral.css';

type TabId = 'empresas' | 'empresa-config' | 'planes' | 'contratos' | 'cargos' | 'catalogos' | 'usuarios' | 'nomina-procesos';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'empresas', label: 'Empresas', icon: <Building2 size={14} /> },
  { id: 'empresa-config', label: 'Configuración de empresa', icon: <SlidersHorizontal size={14} /> },
  { id: 'planes', label: 'Planes y módulos', icon: <Boxes size={14} /> },
  { id: 'contratos', label: 'Contratos', icon: <FileText size={14} /> },
  { id: 'cargos', label: 'Cargos', icon: <Briefcase size={14} /> },
  { id: 'catalogos', label: 'Catalogos', icon: <BookOpen size={14} /> },
  { id: 'usuarios', label: 'Usuarios', icon: <Users size={14} /> },
  { id: 'nomina-procesos', label: 'Nómina', icon: <SlidersHorizontal size={14} /> },
];

export default function ConfiguracionGeneral() {
  const [activeTab, setActiveTab] = useState<TabId>('empresas');
  const [saasEmpresaId, setSaasEmpresaId] = useState<number | null>(null);

  const openSaasCompany = (empresaId: number) => {
    setSaasEmpresaId(empresaId);
    setActiveTab('planes');
  };

  return (
    <div className="adm-page">
      <div className="adm-header">
        <div>
          <h1 className="adm-header-title">
            <Settings
              size={20}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }}
            />
            Administracion
          </h1>
          <p className="adm-header-sub">
            Empresas, contratos, cargos, catalogos y usuarios conectados al backend real
          </p>
        </div>
      </div>

      <nav className="adm-nav" aria-label="Secciones de administracion">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`adm-nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="adm-content">
        {activeTab === 'empresas' && <EmpresasTab onConfigureSaas={openSaasCompany} />}
        {activeTab === 'empresa-config' && <EmpresaConfiguracionTab />}
        {activeTab === 'planes' && <PlanesModulosTab initialCompanyId={saasEmpresaId} />}
        {activeTab === 'contratos' && <ContratosTab />}
        {activeTab === 'cargos' && <CargosTab />}
        {activeTab === 'catalogos' && <CatalogosTab />}
        {activeTab === 'usuarios' && <UsuariosTab />}
        {activeTab === 'nomina-procesos' && <NominaProcesosTab />}
      </div>
    </div>
  );
}
