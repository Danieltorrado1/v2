import { useState, useRef, useEffect } from "react";
import {
  Users, UserCheck, MapPin, FileText, AlertCircle,
  Calculator, Shield, Package, FolderOpen, Archive,
  ClipboardList, UserCog, LayoutDashboard, ChevronDown,
  Bell, Search, Settings, Building2, LogOut,
} from "lucide-react";
import type { ModuleId } from "./moduleTypes";
import type { AuthUser } from "../../services/authApi";
import type { TenantEmpresa, TenantContrato } from "../../services/tenantApi";
import { hasAnyPermission } from "../../lib/permissions";

interface NavGroup {
  label: string;
  id?: ModuleId;
  items?: { id: ModuleId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> ; badge?: number }[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "Inicio", id: "dashboard" },
  {
    label: "Personal",
    items: [
      { id: "operarios",     label: "Operarios Manipuladores", icon: Users,      badge: 3 },
      { id: "equipo-minimo", label: "Equipo Mínimo",           icon: UserCheck },
      { id: "cobertura",     label: "Cobertura PAE",           icon: MapPin },
    ],
  },
  {
    label: "Nómina",
    items: [
      { id: "nomina",      label: "Nómina",      icon: FileText,    badge: 1 },
      { id: "novedades",   label: "Novedades",   icon: AlertCircle, badge: 7 },
      { id: "calculadora", label: "Calculadora", icon: Calculator },
    ],
  },
  {
    label: "Bienestar",
    items: [
      { id: "sst",      label: "SST",               icon: Shield },
      { id: "dotacion", label: "Gestión Dotación",  icon: Package },
    ],
  },
  {
    label: "Documentación",
    items: [
      { id: "documentos",  label: "Centro de Documentos", icon: FolderOpen },
      { id: "repositorio", label: "Repositorio HV",       icon: Archive },
    ],
  },
  {
    label: "Evaluación",
    items: [
      { id: "evaluacion", label: "Evaluación TH", icon: ClipboardList },
    ],
  },
  {
    label: "Empresa",
    items: [
      { id: "empresa",        label: "Documentos empresa", icon: Building2 },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "colaboradores",  label: "Colaboradores", icon: UserCog },
      { id: "configuracion",  label: "Configuración",  icon: Settings },
    ],
  },
];

// Permisos visuales básicos (Fase Final 1 — Parte C): solo módulos con un mapeo
// real de permisos backend se ocultan si el usuario no califica. "equipo-minimo",
// "calculadora", "dotacion", "novedades", "empresa" y "configuracion" no tienen un
// permiso propio documentado en el backend (son placeholders o pantallas locales
// sin API), así que se dejan siempre visibles a propósito — no se les inventó un
// permiso. Si el usuario no trae `permissions` en absoluto, hasAnyPermission ya
// hace fallback a "true" (ver lib/permissions.ts), así nunca se bloquea por falta
// de datos de permisos.
const MODULE_PERMISSIONS: Partial<Record<ModuleId, string[]>> = {
  dashboard: ["dashboard.read", "dashboard.saas.read", "dashboard.*"],
  operarios: ["personas.read", "vinculaciones.read"],
  cobertura: ["cobertura.read"],
  nomina: ["nomina.read", "nomina.periodos.read", "nomina.vacaciones.read", "nomina.prima.read", "nomina.cesantias.read"],
  sst: ["sst.dashboard_general.read", "sst.indicadores.read", "sst.capacitaciones.read"],
  documentos: ["documentos.read", "repositorio.read", "alertas.documentales.read"],
  repositorio: ["documentos.read", "repositorio.read", "alertas.documentales.read"],
  evaluacion: ["evaluaciones.read", "evaluaciones.dashboard"],
  colaboradores: ["users.read", "usuarios.read", "tenant.access.read"],
};

function isModuleVisible(user: AuthUser | null, moduleId: ModuleId): boolean {
  const permissions = MODULE_PERMISSIONS[moduleId];
  if (!permissions) return true;
  return hasAnyPermission(user, permissions);
}

function getVisibleNavGroups(user: AuthUser | null): NavGroup[] {
  return NAV_GROUPS
    .map((group) => {
      if (group.id) {
        return isModuleVisible(user, group.id) ? group : null;
      }

      const items = group.items?.filter((item) => isModuleVisible(user, item.id));
      if (!items || items.length === 0) return null;
      return { ...group, items };
    })
    .filter((group): group is NavGroup => group !== null);
}

export interface TenantSelection {
  status: "loading" | "real" | "fallback";
  empresas: TenantEmpresa[];
  contratos: TenantContrato[];
  empresaId: number | null;
  contratoId: number | null;
}

interface TopNavProps {
  activeModule: ModuleId;
  onModuleChange: (id: ModuleId) => void;
  onLogout: () => void;
  user: AuthUser | null;
  tenant: TenantSelection;
  onTenantChange: (empresaId: number | null, contratoId: number | null) => void;
}

function isGroupActive(group: NavGroup, active: ModuleId): boolean {
  if (group.id) return group.id === active;
  return group.items?.some(i => i.id === active) ?? false;
}

function userInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("");
}

// Selector discreto de empresa/contrato — no bloquea la navegación si /tenant/me
// falló (en ese caso solo se ve un badge "Contexto por defecto").
function TenantSelector({ tenant, onTenantChange }: { tenant: TenantSelection; onTenantChange: (empresaId: number | null, contratoId: number | null) => void }) {
  const contratosDeEmpresa = tenant.empresaId === null
    ? tenant.contratos
    : tenant.contratos.filter(c => c.empresa_id === tenant.empresaId || c.empresa_id === null);

  function handleEmpresaChange(value: string) {
    const empresaId = value === "" ? null : Number(value);
    const primerContrato = empresaId === null
      ? tenant.contratos[0]
      : tenant.contratos.find(c => c.empresa_id === empresaId);
    onTenantChange(empresaId, primerContrato?.id ?? null);
  }

  function handleContratoChange(value: string) {
    onTenantChange(tenant.empresaId, value === "" ? null : Number(value));
  }

  return (
    <div className="flex items-center gap-1.5">
      {tenant.status === "fallback" && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-md border flex-shrink-0"
          style={{ background: "#fffbeb", color: "#92400e", borderColor: "#fde68a", fontWeight: 600 }}
          title="No se pudo cargar /tenant/me — usando empresa/contrato por defecto"
        >
          Contexto por defecto
        </span>
      )}
      <select
        className="px-2 py-1.5 rounded-xl bg-muted text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[140px]"
        value={tenant.empresaId ?? ""}
        disabled={tenant.status === "loading" || tenant.empresas.length === 0}
        onChange={e => handleEmpresaChange(e.target.value)}
        title="Empresa"
      >
        {tenant.empresas.length === 0 && <option value="">Empresa</option>}
        {tenant.empresas.map(empresa => (
          <option key={empresa.id} value={empresa.id}>{empresa.nombre_empresa}</option>
        ))}
      </select>
      <select
        className="px-2 py-1.5 rounded-xl bg-muted text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 max-w-[160px]"
        value={tenant.contratoId ?? ""}
        disabled={tenant.status === "loading" || contratosDeEmpresa.length === 0}
        onChange={e => handleContratoChange(e.target.value)}
        title="Contrato"
      >
        {contratosDeEmpresa.length === 0 && <option value="">Sin contratos</option>}
        {contratosDeEmpresa.map(contrato => (
          <option key={contrato.id} value={contrato.id}>{contrato.numero_contrato ?? `Contrato #${contrato.id}`}</option>
        ))}
      </select>
    </div>
  );
}

export function TopNav({ activeModule, onModuleChange, onLogout, user, tenant, onTenantChange }: TopNavProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const visibleNavGroups = getVisibleNavGroups(user);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(id: ModuleId) {
    onModuleChange(id);
    setOpenGroup(null);
  }

  return (
    <header
      className="flex-shrink-0 bg-card"
      style={{ borderBottom: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
    >
      {/* Outer: logo left, right controls right, nav absolutely centred */}
      <div className="relative flex items-center h-14 px-5" ref={navRef}>

        {/* Logo — stays left, never moves */}
        <div className="flex items-center gap-2.5 flex-shrink-0 z-10">
          {/* Empiria E mark — left spine + top arm (full) + bottom arm (shorter) */}
          <svg width="30" height="26" viewBox="0 0 30 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* left vertical spine — full height */}
            <rect x="0" y="0" width="10" height="26" rx="5" fill="#1a2d6b"/>
            {/* top horizontal arm — full width, overlaps spine */}
            <rect x="0" y="0" width="30" height="10" rx="5" fill="#1a2d6b"/>
            {/* bottom horizontal arm — shorter, overlaps spine */}
            <rect x="0" y="16" width="23" height="10" rx="5" fill="#1a2d6b"/>
          </svg>
          <div>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: "0.9375rem", color: "#1a2d6b", letterSpacing: "0.06em", lineHeight: 1 }}>
              EMPIRIA
            </p>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: "0.5rem", color: "#6b7280", letterSpacing: "0.08em", lineHeight: 1, marginTop: "2px", textTransform: "uppercase" }}>
              Gestión Integral de Talento Humano
            </p>
          </div>
        </div>

        {/* Nav — absolutely centred across the full header width */}
        <nav className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          {visibleNavGroups.map(group => {
            const active = isGroupActive(group, activeModule);
            const hasDropdown = !!group.items;
            const isOpen = openGroup === group.label;
            const totalBadge = group.items?.reduce((s, i) => s + (i.badge ?? 0), 0) ?? 0;

            return (
              <div key={group.label} className="relative">
                <button
                  onClick={() => {
                    if (group.id) {
                      handleSelect(group.id);
                    } else {
                      setOpenGroup(isOpen ? null : group.label);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] transition-all duration-150 ${
                    active
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  style={active ? { fontWeight: 600, boxShadow: "0 1px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)" } : { fontWeight: 400 }}
                >
                  {group.label}
                  {hasDropdown && (
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                    />
                  )}
                  {!active && totalBadge > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "#10b981" }}
                    />
                  )}
                </button>

                {/* Dropdown */}
                {hasDropdown && isOpen && (
                  <div
                    className="absolute top-full left-0 mt-1.5 bg-card rounded-2xl overflow-hidden z-50 min-w-[200px]"
                    style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)" }}
                  >
                    {group.items!.map(item => {
                      const Icon = item.icon;
                      const isItemActive = item.id === activeModule;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelect(item.id)}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                            isItemActive ? "bg-muted" : "hover:bg-muted/60"
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${isItemActive ? "bg-foreground" : "bg-secondary"}`}>
                            <Icon size={12} className={isItemActive ? "text-white" : "text-muted-foreground"} />
                          </div>
                          <span className="text-[13px] text-foreground flex-1 text-left" style={{ fontWeight: isItemActive ? 500 : 400 }}>
                            {item.label}
                          </span>
                          {item.badge != null && item.badge > 0 && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "#dcfce7", color: "#059669", fontWeight: 600 }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </nav>

        {/* Right side — stays right, never moves */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto z-10">
          <TenantSelector tenant={tenant} onTenantChange={onTenantChange} />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="pl-8 pr-3 py-1.5 rounded-xl bg-muted text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 w-36"
              placeholder="Buscar…"
            />
          </div>
          <button className="relative w-8 h-8 flex items-center justify-center rounded-xl bg-muted hover:bg-secondary transition-colors text-muted-foreground">
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(prev => !prev)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-muted transition-colors cursor-pointer"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", fontWeight: 700 }}
              >
                {userInitials(user?.name)}
              </div>
              <span className="text-[12px] text-foreground hidden lg:block" style={{ fontWeight: 500 }}>
                {user?.name ?? "Usuario"}
              </span>
            </button>

            {userMenuOpen && (
              <div
                className="absolute top-full right-0 mt-1.5 bg-card rounded-2xl overflow-hidden z-50 min-w-[200px]"
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)" }}
              >
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>{user?.name ?? "Usuario"}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email ?? "—"}</p>
                  {user?.roles?.[0] && (
                    <span
                      className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-md border"
                      style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe", fontWeight: 600 }}
                    >
                      {user.roles[0]}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-secondary">
                    <LogOut size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-[13px] text-foreground" style={{ fontWeight: 400 }}>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
