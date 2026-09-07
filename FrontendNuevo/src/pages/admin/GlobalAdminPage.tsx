import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Building2, Boxes, Users, UserRoundCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getGlobalAdminDashboard, type GlobalAdminDashboard } from '../../services/globalAdminApi';
import ConfiguracionGeneral from './ConfiguracionGeneral/ConfiguracionGeneral';
import './GlobalAdminPage.css';

export default function GlobalAdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState<GlobalAdminDashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user?.roles.includes('ADMINISTRADOR')) void getGlobalAdminDashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : 'No fue posible cargar el dashboard global.')); }, [user]);
  if (!user?.roles.includes('ADMINISTRADOR')) return <div className="adm-notice warning"><AlertTriangle size={14} /> Acceso exclusivo para ADMINISTRADOR global.</div>;
  const k = data?.kpis;
  const cards = [['Empresas totales', k?.empresas_total, Building2], ['Empresas activas', k?.empresas_activas, Building2], ['Usuarios activos', k?.usuarios_activos, Users], ['Personal gestionado', k?.personal_total, UserRoundCheck], ['Contratos activos', k?.contratos_activos, BarChart3], ['Módulos activos', k?.modulos_activos, Boxes]] as const;
  return <div className="global-admin-page"><div className="global-admin-heading"><div><h1><BarChart3 size={20} /> Empiria Admin Global</h1><p>Control SaaS con datos persistidos. Las métricas no disponibles no se simulan.</p></div><span className="global-admin-mode">MODO ADMINISTRADOR GLOBAL</span></div>{error && <div className="adm-notice warning"><AlertTriangle size={14} /> {error}</div>}<div className="global-admin-kpis">{cards.map(([label, value, Icon]) => <div className="global-admin-kpi" key={label}><Icon size={18}/><strong>{value ?? '—'}</strong><span>{label}</span></div>)}</div><div className="global-admin-grid"><section className="adm-card"><h2><Building2 size={16}/> Estado de clientes</h2><div className="global-admin-table-wrap"><table className="adm-history"><thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Personal</th><th>Contratos</th><th>Última actividad</th></tr></thead><tbody>{data?.clientes.map((row) => <tr key={row.empresa_id}><td><strong>{row.empresa}</strong><small>{row.nit ?? 'NIT no disponible'}</small></td><td>{row.plan}</td><td><span className={`adm-badge ${row.estado === 'ACTIVA' || row.estado === 'LEGACY' ? 'active' : 'inactive'}`}>{row.estado}</span></td><td>{row.usuarios}</td><td>{row.personal}</td><td>{row.contratos}</td><td>{row.ultima_actividad ?? 'Sin actividad registrada'}</td></tr>)}</tbody></table>{data && data.clientes.length === 0 && <div className="global-admin-empty">No hay empresas registradas.</div>}{!data && !error && <div className="global-admin-empty">Cargando datos reales...</div>}</div></section><section className="adm-card"><h2><AlertTriangle size={16}/> Alertas</h2>{data?.alertas.length ? data.alertas.map((alert) => <div className="global-admin-alert" key={alert.codigo}><strong>{alert.cantidad}</strong><span>{alert.descripcion}</span></div>) : <div className="global-admin-empty">Sin alertas SaaS activas.</div>}</section></div><ConfiguracionGeneral /></div>;
}
