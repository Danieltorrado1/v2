import { useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, Eye, FileText, ImageOff, LogIn, Power, Search, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyContext } from '../../context/CompanyContext';
import { apiClient } from '../../services/apiClient';
import { companySettingsApi, type CompanySettings } from '../../services/companySettingsApi';
import { configuracionApi } from '../../services/configuracionApi';
import { saasApi, type CompanyUsage, type EmpresaCapabilities, type GlobalCompanyRow, type SaasPlan } from '../../services/saasApi';
import { isGlobalAdministrator } from '../../architecture/moduleAccess';
import type { Empresa } from '../../types/configuracion.types';
import { ContratosTab } from '../admin/ConfiguracionGeneral/tabs/ContratosTab';
import { UsuariosTab } from '../admin/ConfiguracionGeneral/tabs/UsuariosTab';
import { PlanesModulosTab } from '../admin/ConfiguracionGeneral/tabs/PlanesModulosTab';
import { WorkspaceHeading } from './StructuralPage';
import '../admin/AdminPage.css';
import '../admin/ConfiguracionGeneral/ConfiguracionGeneral.css';
import '../../architecture/Workspace.css';

const tabs = ['GENERAL', 'CONTRATOS', 'USUARIOS', 'PLAN', 'MÓDULOS', 'USO', 'AUDITORÍA'] as const;
type Tab = typeof tabs[number];
const empty = 'No disponible';

export function CompaniesPage() {
  const { user } = useAuth();
  const { empresasDisponibles, empresaId, setEmpresaActual, retryBootstrap } = useCompanyContext();
  const navigate = useNavigate();
  const [rows, setRows] = useState<GlobalCompanyRow[]>([]);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [plan, setPlan] = useState('');
  const [hasPlan, setHasPlan] = useState('');
  const [hasModules, setHasModules] = useState('');
  const [hasContracts, setHasContracts] = useState('');
  const [loading, setLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<{ id: number; tab: Tab } | null>(null);

  useEffect(() => {
    if (!isGlobalAdministrator(user)) return;
    let live = true;
    setPlansLoading(true);
    void saasApi.plans().then((value) => { if (live) setPlans(value); }).catch(() => { if (live) setError('No fue posible cargar el catálogo de planes.'); }).finally(() => { if (live) setPlansLoading(false); });
    return () => { live = false; };
  }, [user]);

  useEffect(() => {
    if (!isGlobalAdministrator(user)) return;
    let live = true;
    setLoading(true);
    setError('');
    void saasApi.globalCompanies({
      page, limit: 15, search: search.trim() || undefined, estado: estado || undefined,
      plan: plan || undefined, has_plan: hasPlan === '' ? undefined : hasPlan === 'true',
      has_modules: hasModules === '' ? undefined : hasModules === 'true',
      has_contracts: hasContracts === '' ? undefined : hasContracts === 'true'
    }).then((data) => { if (live) { setRows(data.items); setPagination(data.pagination); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'No fue posible cargar empresas.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user, page, search, estado, plan, hasPlan, hasModules, hasContracts]);

  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  const enter = (row: GlobalCompanyRow) => {
    if (row.estado === 'INACTIVA') { setError('Una empresa inactiva no puede abrir contexto operativo.'); return; }
    if (!empresasDisponibles.some((company) => company.id === row.empresa_id)) { setError('La empresa no está disponible en el contexto de acceso.'); return; }
    if (empresaId !== row.empresa_id) setEmpresaActual(row.empresa_id); else retryBootstrap();
    navigate('/empresa');
  };
  const updateRow = (updated: Empresa) => setRows((current) => current.map((row) => row.empresa_id === updated.id ? { ...row, estado: updated.activo ? (row.estado === 'LEGACY' ? 'LEGACY' : 'ACTIVA') : 'INACTIVA' } : row));
  const handleStatusChanged = (updated: Empresa) => { updateRow(updated); if (!updated.activo && empresaId === updated.id) { setEmpresaActual(null); navigate('/admin-global/empresas'); } };

  if (!isGlobalAdministrator(user)) return <div className="adm-notice warning">Acceso exclusivo para ADMINISTRADOR global.</div>;
  return <section className="workspace-page workspace-companies">
    <WorkspaceHeading title="Empresas / Clientes" description="Centro de control de clientes, planes, módulos y actividad." scope="Empiria Admin" />
    <div className="cg-filters company-control-filters">
      <div className="cg-search"><Search size={14} /><input placeholder="Buscar por nombre o NIT" value={search} onChange={(e) => changeFilter(setSearch)(e.target.value)} /></div>
      <select className="adm-select cg-filter-select" value={estado} onChange={(e) => changeFilter(setEstado)(e.target.value)}><option value="">Todos los estados</option><option value="ACTIVA">Activa</option><option value="INACTIVA">Inactiva</option><option value="PRUEBA">Prueba</option><option value="SUSPENDIDA">Suspendida</option><option value="LEGACY">Legacy</option></select>
      <select className="adm-select cg-filter-select" value={plan} onChange={(e) => changeFilter(setPlan)(e.target.value)} disabled={plansLoading}><option value="">Todos los planes</option>{plans.map((item) => <option value={item.codigo} key={item.id}>{item.nombre}</option>)}</select>
      <select className="adm-select cg-filter-select" value={hasPlan} onChange={(e) => changeFilter(setHasPlan)(e.target.value)}><option value="">Plan: todos</option><option value="true">Con plan</option><option value="false">Sin plan</option></select>
      <select className="adm-select cg-filter-select" value={hasModules} onChange={(e) => changeFilter(setHasModules)(e.target.value)}><option value="">Módulos: todos</option><option value="true">Con módulos</option><option value="false">Sin módulos</option></select>
      <select className="adm-select cg-filter-select" value={hasContracts} onChange={(e) => changeFilter(setHasContracts)(e.target.value)}><option value="">Contratos: todos</option><option value="true">Con contratos</option><option value="false">Sin contratos</option></select>
    </div>
    {error && <div className="adm-notice warning">{error}</div>}
    <div className="cg-table-card global-company-table-wrap"><table className="adm-history"><thead><tr><th>Empresa</th><th>NIT</th><th>Plan</th><th>Estado</th><th>Contratos</th><th>Usuarios</th><th>Personal</th><th>Módulos</th><th>Última actividad</th><th>Acciones</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={10} className="cg-table-empty">Cargando empresas…</td></tr> : rows.length === 0 ? <tr><td colSpan={10} className="cg-table-empty">No hay empresas para estos filtros.</td></tr> : rows.map((row) => <tr key={row.empresa_id}><td><strong>{row.empresa}</strong></td><td>{row.nit ?? empty}</td><td>{row.plan}</td><td><span className={`adm-badge ${row.estado === 'ACTIVA' || row.estado === 'LEGACY' ? 'active' : 'inactive'}`}>{row.estado}</span></td><td>{row.contratos}</td><td>{row.usuarios}</td><td>{row.personal}</td><td>{row.modulos}</td><td>{row.ultima_actividad ? new Date(row.ultima_actividad).toLocaleString('es-CO') : empty}</td><td><div className="cg-actions"><button className="adm-btn ghost sm" title="Ver" onClick={() => setSelection({ id: row.empresa_id, tab: 'GENERAL' })}><Eye size={13} /></button><button className="adm-btn ghost sm" title="Editar" onClick={() => setSelection({ id: row.empresa_id, tab: 'GENERAL' })}><Edit2 size={13} /></button><button className="adm-btn ghost sm" title="Entrar" onClick={() => enter(row)} disabled={row.estado === 'INACTIVA'}><LogIn size={13} /></button><button className="adm-btn ghost sm" title="Usuarios" onClick={() => setSelection({ id: row.empresa_id, tab: 'USUARIOS' })}><Users size={13} /></button><button className="adm-btn ghost sm" title="Contratos" onClick={() => setSelection({ id: row.empresa_id, tab: 'CONTRATOS' })}><FileText size={13} /></button><CompanyStatusButton row={row} onChanged={handleStatusChanged} /></div></td></tr>)}
    </tbody></table></div>
    <div className="cg-pagination"><span>{pagination.total ? `${(pagination.page - 1) * pagination.limit + 1} - ${Math.min(pagination.page * pagination.limit, pagination.total)} de ${pagination.total}` : 'Sin resultados'}</span><div><button className="adm-btn secondary sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button> <button className="adm-btn secondary sm" disabled={page >= pagination.total_pages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</button></div></div>
    {selection && <CompanyDrawer id={selection.id} initialTab={selection.tab} onClose={() => setSelection(null)} onEnter={(row) => enter(row)} onStatusChanged={handleStatusChanged} />}
  </section>;
}

function CompanyStatusButton({ row, onChanged }: { row: GlobalCompanyRow; onChanged: (company: Empresa) => void }) {
  const [saving, setSaving] = useState(false);
  const toggle = async () => {
    const nextActive = row.estado === 'INACTIVA';
    if (!nextActive && !window.confirm(`¿Desactivar ${row.empresa}? La empresa conservará todos sus datos, pero no podrá entrar a operación.`)) return;
    setSaving(true);
    try { const response = await saasApi.setStatus(row.empresa_id, { activo: nextActive }); onChanged(response); window.alert(nextActive ? 'Empresa activada correctamente.' : 'Empresa desactivada correctamente.'); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'No fue posible cambiar el estado.'); }
    finally { setSaving(false); }
  };
  return <button className={`adm-btn ${row.estado === 'INACTIVA' ? 'secondary' : 'danger-outline'} sm`} title={nextTitle(row.estado)} onClick={() => void toggle()} disabled={saving}><Power size={12} /></button>;
}
function nextTitle(status: string) { return status === 'INACTIVA' ? 'Activar' : 'Desactivar'; }

function CompanyDrawer({ id, initialTab, onClose, onEnter, onStatusChanged }: { id: number; initialTab: Tab; onClose: () => void; onEnter: (row: GlobalCompanyRow) => void; onStatusChanged: (company: Empresa) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [company, setCompany] = useState<Empresa | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [caps, setCaps] = useState<EmpresaCapabilities | null>(null);
  const [usage, setUsage] = useState<CompanyUsage | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { let live = true; void Promise.all([configuracionApi.obtenerEmpresa(id), companySettingsApi.get(id), saasApi.capabilities(id), saasApi.usage(id), apiClient.get<{ data: { items: any[] } }>('/auditoria', { params: { empresa_id: id, page: 1, limit: 25 } }).then((response) => response.data)]).then(([c, s, m, u, a]) => { if (live) { setCompany(c); setSettings(s); setCaps(m); setUsage(u); setAudit(a.items); } }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'No fue posible cargar la ficha.'); }); return () => { live = false; }; }, [id]);
  const origins = useMemo(() => Object.entries(caps?.modulos ?? {}).map(([code, enabled]) => { const override = caps?.overrides.find((item) => item.codigo === code); return { code, enabled, origin: override ? (override.habilitado ? 'OVERRIDE +' : 'OVERRIDE -') : caps?.legacy ? 'LEGACY' : 'PLAN' }; }), [caps]);
  const saveGeneral = async () => { if (!settings) return; setSaving(true); setError(''); try { setSettings(await companySettingsApi.saveGeneral(id, settings.general)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible guardar los datos generales.'); } finally { setSaving(false); } };
  const updateStatus = async () => { if (!company) return; const nextActive = !company.activo; if (!nextActive && !window.confirm(`¿Desactivar ${company.nombre_empresa}?`)) return; setSaving(true); try { const updated = await saasApi.setStatus(id, { activo: nextActive }); setCompany(updated); onStatusChanged(updated); window.alert(nextActive ? 'Empresa activada correctamente.' : 'Empresa desactivada correctamente.'); if (!nextActive) onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible cambiar el estado.'); } finally { setSaving(false); } };
  const rowForEntry: GlobalCompanyRow = { empresa_id: id, empresa: company?.nombre_empresa ?? 'Empresa', nit: company?.nit ?? null, plan: caps?.suscripcion?.plan.nombre ?? 'LEGACY / SIN PLAN CONFIGURADO', estado: company?.activo ? (caps?.legacy ? 'LEGACY' : (caps?.suscripcion?.estado ?? 'ACTIVA')) : 'INACTIVA', fecha_inicio: caps?.suscripcion?.fecha_inicio ?? null, fecha_renovacion: caps?.suscripcion?.fecha_fin ?? null, contratos: usage?.contratos ?? 0, usuarios: usage?.usuarios ?? 0, personal: usage?.personal ?? 0, modulos: usage?.modulos_habilitados ?? 0, ultima_actividad: null };
  return <dialog ref={dialog} className="workspace-drawer workspace-company-dialog" onCancel={onClose}><header><div><span className="workspace-eyebrow">Ficha de empresa</span><h2>{company?.nombre_empresa ?? 'Empresa'}</h2></div><div className="cg-actions"><button className="adm-btn ghost sm" onClick={() => onEnter(rowForEntry)} disabled={!company?.activo} title="Entrar a empresa"><LogIn size={14} /></button><button className="adm-btn ghost sm" onClick={() => void updateStatus()} disabled={saving || !company} title={company?.activo ? 'Desactivar' : 'Activar'}><Power size={14} /></button><button className="adm-btn ghost sm" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div></header><nav className="workspace-tabs" aria-label="Ficha de empresa">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav><div className="workspace-drawer-body">{error && <div className="adm-notice warning">{error}</div>}
    {tab === 'GENERAL' && <section className="workspace-card">{settings ? <><div className="company-profile-logo">{settings.general.logo_url && !logoError ? <img src={settings.general.logo_url} alt="Logo de la empresa" onError={() => setLogoError(true)} /> : <><ImageOff size={18} /><span>Logo no disponible</span></>}</div><div className="adm-form-grid"><label className="adm-field"><span className="adm-label">Razón social</span><input className="adm-input" value={settings.general.nombre_empresa} disabled /></label><label className="adm-field"><span className="adm-label">NIT</span><input className="adm-input" value={settings.general.nit} disabled /></label><label className="adm-field"><span className="adm-label">Nombre comercial</span><input className="adm-input" value={settings.general.nombre_comercial ?? ''} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, nombre_comercial: e.target.value || null } })} /></label>{(['direccion', 'telefono', 'correo', 'ciudad', 'departamento', 'pais', 'zona_horaria', 'moneda', 'locale'] as const).map((field) => <label className="adm-field" key={field}><span className="adm-label">{field.replaceAll('_', ' ')}</span><input className="adm-input" value={settings.general[field] ?? ''} onChange={(e) => setSettings({ ...settings, general: { ...settings.general, [field]: e.target.value || null } })} /></label>)}</div><button className="adm-btn primary" disabled={saving} onClick={() => void saveGeneral()}><Edit2 size={13} /> Guardar datos generales</button><p className="workspace-note">Fecha de creación: no expuesta por el contrato actual de configuración.</p></> : <p>Cargando datos generales…</p>}</section>}
    {tab === 'CONTRATOS' && <ContratosTab companyScopeId={id} />} {tab === 'USUARIOS' && <UsuariosTab companyScopeId={id} />} {(tab === 'PLAN' || tab === 'MÓDULOS') && <PlanesModulosTab initialCompanyId={id} />} {tab === 'USO' && <section className="workspace-card"><h3>Uso real</h3><dl className="company-detail-list">{Object.entries(usage ?? {}).map(([label, value]) => <div key={label}><dt>{label.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></section>} {tab === 'AUDITORÍA' && <section className="workspace-card"><h3>Auditoría de la empresa</h3>{audit.length ? <ul>{audit.map((item) => <li key={item.id}>{item.accion} · {item.descripcion || item.entidad} · {item.fecha_evento ? new Date(item.fecha_evento).toLocaleString('es-CO') : empty}</li>)}</ul> : <p>Sin eventos de auditoría disponibles.</p>}</section>} {tab === 'MÓDULOS' && <section className="workspace-card"><h3>Resolución efectiva</h3><table className="adm-history"><thead><tr><th>Módulo</th><th>Origen</th><th>Estado</th></tr></thead><tbody>{origins.map((item) => <tr key={item.code}><td>{item.code}</td><td>{item.origin}</td><td>{item.enabled ? 'Habilitado' : 'Deshabilitado'}</td></tr>)}</tbody></table><p className="workspace-note">Submódulos: pendiente de catálogo persistente.</p></section>}</div></dialog>;
}
