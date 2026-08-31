import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type FlowItem = { label: string; path: string; aliases: string[]; permissions: string[] };

const ITEMS: FlowItem[] = [
  { label: "Planilla Operativa", path: "/nomina/planilla-operativa", aliases: ["/nomina/cobertura"], permissions: ["nomina.operativa.read", "nomina.read"] },
  { label: "Turnos", path: "/nomina/turnos", aliases: [], permissions: ["nomina.operativa.read"] },
  { label: "Novedades", path: "/nomina/novedades", aliases: [], permissions: ["nomina.operativa.read", "nomina.read"] },
  { label: "Nómina", path: "/nomina/gestion", aliases: [], permissions: ["nomina.read"] },
  { label: "Liquidaciones", path: "/nomina/liquidacion", aliases: [], permissions: ["nomina.liquidaciones_finales.read"] },
] as const;

export default function CoberturaFlowNav({ periodId }: { periodId?: string | null }) {
  const { user } = useAuth();
  const location = useLocation();
  const permissions = new Set(user?.permissions ?? []);
  const gestorOperationalOnly = user?.roles.includes("GESTOR") === true && user?.roles.includes("TALENTO_HUMANO") !== true;
  const query = periodId ? `?period_id=${encodeURIComponent(periodId)}` : "";

  return (
    <nav className="np-flow-nav" aria-label="Flujo de Cobertura">
      <span className="np-flow-nav-title">Cobertura</span>
      {ITEMS.filter((item) => item.permissions.some((permission) => permissions.has(permission)) && (!gestorOperationalOnly || ["/nomina/planilla-operativa", "/nomina/turnos", "/nomina/novedades"].includes(item.path))).map((item) => {
        const active = location.pathname === item.path || item.aliases.includes(location.pathname);
        return <NavLink className={active ? "active" : ""} key={item.path} to={`${item.path}${query}`}>{item.label}</NavLink>;
      })}
    </nav>
  );
}
