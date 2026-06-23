import { useState, useRef, useEffect } from "react";
import {
  Users, UserCheck, MapPin, FileText, AlertCircle,
  Calculator, Shield, Package, FolderOpen, Archive,
  ClipboardList, UserCog, LayoutDashboard, ChevronDown,
  Bell, Search, Settings, Building2, LogOut,
} from "lucide-react";
import type { ModuleId } from "./moduleTypes";

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

interface TopNavProps {
  activeModule: ModuleId;
  onModuleChange: (id: ModuleId) => void;
  onLogout: () => void;
}

function isGroupActive(group: NavGroup, active: ModuleId): boolean {
  if (group.id) return group.id === active;
  return group.items?.some(i => i.id === active) ?? false;
}

export function TopNav({ activeModule, onModuleChange, onLogout }: TopNavProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

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
          {NAV_GROUPS.map(group => {
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
                LV
              </div>
              <span className="text-[12px] text-foreground hidden lg:block" style={{ fontWeight: 500 }}>Laura V.</span>
            </button>

            {userMenuOpen && (
              <div
                className="absolute top-full right-0 mt-1.5 bg-card rounded-2xl overflow-hidden z-50 min-w-[170px]"
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)" }}
              >
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
