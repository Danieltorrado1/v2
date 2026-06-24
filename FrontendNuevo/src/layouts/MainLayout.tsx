import { Outlet } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./MainLayout.css";

export default function MainLayout() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">
      <header className="topbar">
        <div className="logo-area">EMPIRIA</div>

        <nav className="menu">
          <button>Dashboard</button>
          <button>Personal</button>
          <button>Nómina</button>
          <button>Herramientas</button>
          <button>SST</button>
          <button>Portal</button>
          <button>Repositorio</button>
          <button>Administración</button>
        </nav>

        <div className="right-side">
          <button
            className="theme-button"
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <div className="user-area">Admin</div>
        </div>
      </header>

      <main className="content">
        <div className="page-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}