import { Outlet } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { NavDropdown } from "./NavDropdown";
import "./MainLayout.css";

const herramientasLinks = [
  { to: "/herramientas/calculadora-salario", label: "Calculadora de salario" },
  { to: "/herramientas/calculadora-cobertura", label: "Calculadora de cobertura" },
  { to: "/herramientas/cobertura", label: "Cobertura" },
];

const sstLinks = [
  { to: "/sst", label: "Panel SST" },
  { to: "/sst/incidentes", label: "Incidentes y Accidentes" },
  { to: "/sst/riesgos", label: "Identificación de Riesgos" },
  { to: "/sst/capacitaciones", label: "Capacitaciones SST" },
  { to: "/sst/examenes-medicos", label: "Exámenes Médicos" },
  { to: "/sst/epp", label: "Elementos de Protección Personal (EPP)" },
  { to: "/sst/indicadores", label: "Indicadores SST" },
];

export default function MainLayout() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo-area">EMPIRIA</div>

        <nav className="menu">
          <button type="button">Dashboard</button>
          <button type="button">Personal</button>
          <button type="button">Nómina</button>
          <NavDropdown label="Herramientas" links={herramientasLinks} />
          <NavDropdown label="SST" links={sstLinks} />
          <button type="button">Portal</button>
          <button type="button">Repositorio</button>
          <button type="button">Administración</button>
        </nav>

        <div className="right-side">
          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            title={
              theme === "light"
                ? "Cambiar a modo oscuro"
                : "Cambiar a modo claro"
            }
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <div className="user-area">Admin</div>
        </div>
      </header>

      <main className="content">
        <div className="page-scroll">
          <div className="page-content">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
