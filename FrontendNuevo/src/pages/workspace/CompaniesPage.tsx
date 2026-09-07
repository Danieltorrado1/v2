import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useCompanyContext } from '../../context/CompanyContext';
import { configuracionApi } from '../../services/configuracionApi';
import { saasApi, type EmpresaCapabilities, type CompanySaasHistory } from '../../services/saasApi';
import type { Empresa } from '../../types/configuracion.types';
import { EmpresasTab } from '../admin/ConfiguracionGeneral/tabs/EmpresasTab';
import { ContratosTab } from '../admin/ConfiguracionGeneral/tabs/ContratosTab';
import { UsuariosTab } from '../admin/ConfiguracionGeneral/tabs/UsuariosTab';
import { PlanesModulosTab } from '../admin/ConfiguracionGeneral/tabs/PlanesModulosTab';
import { WorkspaceHeading } from './StructuralPage';
import '../admin/AdminPage.css';
import '../admin/ConfiguracionGeneral/ConfiguracionGeneral.css';

const tabs = ['GENERAL', 'CONTRATOS', 'USUARIOS', 'PLAN', 'MÓDULOS', 'USO', 'AUDITORÍA'];
export function CompaniesPage() {
  const navigate = useNavigate();
  const { empresasDisponibles, empresaId, setEmpresaActual, retryBootstrap } = useCompanyContext();
  const [selection, setSelection] = useState<{ id: number; tab: string } | null>(null);
  const [message, setMessage] = useState('');
  function enter(id: number) {
    if (!empresasDisponibles.some(company => company.id === id)) { setMessage('Esta empresa no está disponible en tu contexto de acceso actual.'); return; }
    if (empresaId !== id) setEmpresaActual(id); else retryBootstrap();
    navigate('/empresa');
  }
  return <section className="workspace-page workspace-companies"><WorkspaceHeading title="Empresas / Clientes" description="Clientes de Empiria, sus planes y su configuración." scope="Empiria Admin" />
    {message && <p role="alert">{message}</p>}
    <EmpresasTab onConfigureSaas={id => setSelection({ id, tab: 'PLAN' })} onOpenProfile={(id, tab) => setSelection({ id, tab })} onEnterCompany={enter} />
    {selection && <CompanyProfile key={selection.id} id={selection.id} initialTab={selection.tab} onClose={() => setSelection(null)} />}
  </section>;
}

function CompanyProfile({ id, initialTab, onClose }: { id: number; initialTab: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(initialTab);
  const [company, setCompany] = useState<Empresa | null>(null);
  const [caps, setCaps] = useState<EmpresaCapabilities | null>(null);
  const [history, setHistory] = useState<CompanySaasHistory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let live = true;
    void Promise.allSettled([configuracionApi.obtenerEmpresa(id), saasApi.capabilities(id), saasApi.history(id)]).then(([companyResult, capsResult, historyResult]) => {
      if (!live) return;
      if (companyResult.status === 'fulfilled') setCompany(companyResult.value);
      if (capsResult.status === 'fulfilled') setCaps(capsResult.value);
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
      if ([companyResult, capsResult, historyResult].some(result => result.status === 'rejected')) setError('Parte de la información de la empresa no está disponible.');
    }); return () => { live = false; };
  }, [id]);
  return <dialog ref={dialog} className="workspace-drawer workspace-company-dialog" onCancel={onClose} aria-labelledby="company-profile-title"><header><div><span className="workspace-eyebrow">Ficha de empresa</span><h2 id="company-profile-title">{company?.nombre_empresa ?? 'Empresa'}</h2></div><button onClick={onClose} aria-label="Cerrar ficha de empresa"><X size={20} /></button></header>
    <nav className="workspace-tabs" aria-label="Ficha de empresa">{tabs.map(label => <button key={label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)}>{label}</button>)}</nav>
    <div className="workspace-drawer-body">{error && <p role="alert">{error}</p>}
      {tab === 'GENERAL' && <section className="workspace-card"><dl>{[['Empresa', company?.nombre_empresa], ['NIT', company?.nit], ['Estado', company ? company.activo ? 'Activa' : 'Inactiva' : null], ['Representante legal', company?.representante_legal], ['Correo', company?.correo], ['Teléfono', company?.telefono], ['Dirección', company?.direccion], ['Inicio de suscripción', caps?.suscripcion?.fecha_inicio], ['Fin de vigencia', caps?.suscripcion?.fecha_fin]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'No disponible'}</dd></div>)}</dl></section>}
      {tab === 'CONTRATOS' && <ContratosTab companyScopeId={id} />}
      {tab === 'USUARIOS' && <UsuariosTab companyScopeId={id} />}
      {(tab === 'PLAN' || tab === 'MÓDULOS') && <PlanesModulosTab initialCompanyId={id} />}
      {tab === 'USO' && <section className="workspace-card"><h3>Uso de la empresa</h3><p>Usuarios, personal, almacenamiento y consumo: no disponible.</p></section>}
      {tab === 'AUDITORÍA' && <section className="workspace-card"><h3>Historial comercial</h3><p>Suscripciones y habilitaciones registradas. La auditoría integral estará disponible en una siguiente fase.</p>{history?.suscripciones.length ? <ul>{history.suscripciones.map(item => <li key={item.id}>{item.plan_nombre} · {item.estado} · {item.fecha_inicio}</li>)}</ul> : <p>Sin historial de suscripciones disponible.</p>}{history?.overrides.length ? <ul>{history.overrides.map(item => <li key={item.id}>{item.modulo_nombre} · {item.habilitado ? 'Habilitado' : 'Deshabilitado'} · {item.motivo}</li>)}</ul> : <p>Sin cambios de módulos disponibles.</p>}</section>}
    </div></dialog>;
}
