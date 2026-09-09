import { useEffect, useState } from 'react';
import { useCompanyContext } from '../../context/CompanyContext';
import { configuracionApi } from '../../services/configuracionApi';
import { getRoleConfig, moduleVisibilityEntries, resetRoleConfig, setRoleConfig, type ModuleVisibilityConfig } from '../../services/moduleVisibilityStore';
import type { Rol } from '../../types/configuracion.types';

export function RoleModuleVisibility() {
  const { empresaId } = useCompanyContext();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [selected, setSelected] = useState('');
  const [config, setConfig] = useState<ModuleVisibilityConfig | null>(null);
  const entries = moduleVisibilityEntries();
  useEffect(() => { void configuracionApi.listarRoles().then(setRoles); }, []);
  const choose = (role: string) => setConfig((getRoleConfig(role, empresaId ?? 0) ?? { modules: Object.fromEntries(entries.map((item) => [item.code, role === 'TALENTO_HUMANO' ? item.code === 'PERSONAL' : true])), children: Object.fromEntries(entries.flatMap((item) => item.children.map((child) => [child.code, true]))) }));
  const toggle = (code: string, child = false) => setConfig((current) => current ? ({ ...current, [child ? 'children' : 'modules']: { ...current[child ? 'children' : 'modules'], [code]: !current[child ? 'children' : 'modules'][code] } }) : current);
  return <section className="workspace-card"><h2>MÓDULOS VISIBLES</h2><p>Configuración frontend-only, aislada por empresa y navegador. Nunca eleva permisos reales.</p><select className="adm-select" value={selected} onChange={(event) => { setSelected(event.target.value); if (event.target.value) choose(event.target.value); }}><option value="">Seleccionar rol</option>{roles.map((role) => <option key={role.id} value={role.nombre_rol}>{role.nombre_rol}</option>)}</select>{config && <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{entries.map((module) => <div key={module.code}><label><input type="checkbox" checked={config.modules[module.code] !== false} onChange={() => toggle(module.code)} /> <strong>{module.label}</strong></label>{module.children.map((child) => <label key={child.code} style={{ display: 'block', marginLeft: 24 }}><input type="checkbox" checked={config.children[child.code] !== false} onChange={() => toggle(child.code, true)} /> {child.label}</label>)}</div>)}<button className="adm-btn primary sm" type="button" onClick={() => empresaId && setRoleConfig(selected, config, empresaId)}>Guardar visibilidad</button><button className="adm-btn secondary sm" type="button" onClick={() => { if (empresaId) resetRoleConfig(selected, empresaId); if (selected) choose(selected); }}>Restaurar valores predeterminados</button></div>}</section>;
}
