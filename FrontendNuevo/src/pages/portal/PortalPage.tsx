import { useState } from "react";
import {
  Activity,
  Briefcase,
  Building2,
  ClipboardList,
  Inbox,
  UserCog,
} from "lucide-react";
import { mockColaborador, mockTHUser } from "./mockData";
import MiActividad from "./components/colaborador/MiActividad";
import SolicitudDocumentos from "./components/colaborador/SolicitudDocumentos";
import OtrasSolicitudes from "./components/colaborador/OtrasSolicitudes";
import NovedadesNomina from "./components/colaborador/NovedadesNomina";
import ActualizarDatos from "./components/colaborador/ActualizarDatos";
import Historial from "./components/colaborador/Historial";
import HistorialSesiones from "./components/colaborador/HistorialSesiones";
import MiActividadTH from "./components/th/MiActividadTH";
import GestionarNovedades from "./components/th/GestionarNovedades";
import "./PortalPage.css";

type PortalRole = "colaborador" | "th";
type ColabSection =
  | "actividad"
  | "documentos"
  | "solicitudes"
  | "novedades"
  | "datos"
  | "historial"
  | "sesiones";
type THSection = "actividad" | "novedades";

const COLAB_TABS: { key: ColabSection; label: string }[] = [
  { key: "actividad", label: "Mi Actividad" },
  { key: "documentos", label: "Solicitar Documento" },
  { key: "solicitudes", label: "Otras Solicitudes" },
  { key: "novedades", label: "Novedades de Nómina" },
  { key: "datos", label: "Actualizar mis Datos" },
  { key: "historial", label: "Historial" },
  { key: "sesiones", label: "Mis Sesiones" },
];

const TH_TABS: { key: THSection; label: string }[] = [
  { key: "actividad", label: "Mi Actividad" },
  { key: "novedades", label: "Gestionar Novedades" },
];

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function ColaboradorPortal() {
  const [section, setSection] = useState<ColabSection>("actividad");

  return (
    <>
      <div className="pp-user-header">
        <div className="pp-user-info">
          <div className="pp-user-avatar">{initials(mockColaborador.nombre)}</div>
          <div className="pp-user-details">
            <div className="pp-user-name">{mockColaborador.nombre}</div>
            <div className="pp-user-meta">
              <span><Briefcase size={12} />{mockColaborador.cargo}</span>
              <span><Building2 size={12} />{mockColaborador.sede}</span>
              <span>{mockColaborador.documento}</span>
            </div>
          </div>
        </div>
        <span className="pp-user-badge">{mockColaborador.contrato}</span>
      </div>

      <nav className="pp-nav">
        {COLAB_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`pp-nav-tab ${section === tab.key ? "active" : ""}`}
            onClick={() => setSection(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="pp-content">
        {section === "actividad"   && <MiActividad />}
        {section === "documentos"  && <SolicitudDocumentos />}
        {section === "solicitudes" && <OtrasSolicitudes />}
        {section === "novedades"   && <NovedadesNomina />}
        {section === "datos"       && <ActualizarDatos />}
        {section === "historial"   && <Historial />}
        {section === "sesiones"    && <HistorialSesiones />}
      </div>
    </>
  );
}

function THPortal() {
  const [section, setSection] = useState<THSection>("actividad");

  return (
    <>
      <div className="pp-user-header">
        <div className="pp-user-info">
          <div className="pp-user-avatar">{initials(mockTHUser.nombre)}</div>
          <div className="pp-user-details">
            <div className="pp-user-name">{mockTHUser.nombre}</div>
            <div className="pp-user-meta">
              <span><Briefcase size={12} />{mockTHUser.cargo}</span>
              <span><Building2 size={12} />Municipio: {mockTHUser.municipioAsignado}</span>
            </div>
          </div>
        </div>
        <span className="pp-user-badge" style={{ background: "color-mix(in srgb, var(--color-success) 12%, transparent)", color: "var(--color-success)", borderColor: "color-mix(in srgb, var(--color-success) 30%, transparent)" }}>
          Talento Humano
        </span>
      </div>

      <nav className="pp-nav">
        {TH_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`pp-nav-tab ${section === tab.key ? "active" : ""}`}
            onClick={() => setSection(tab.key)}
          >
            {tab.key === "actividad" ? <Activity size={13} /> : <Inbox size={13} />}
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="pp-content">
        {section === "actividad" && <MiActividadTH />}
        {section === "novedades" && <GestionarNovedades />}
      </div>
    </>
  );
}

export default function PortalPage() {
  const [role, setRole] = useState<PortalRole>("colaborador");

  return (
    <div className="pp-page">
      <div className="pp-demo-toggle">
        <span>Demo — Vista como:</span>
        <button
          type="button"
          className={role === "colaborador" ? "active" : ""}
          onClick={() => setRole("colaborador")}
        >
          <UserCog size={12} style={{ marginRight: 4 }} />
          Colaborador
        </button>
        <button
          type="button"
          className={role === "th" ? "active" : ""}
          onClick={() => setRole("th")}
        >
          <ClipboardList size={12} style={{ marginRight: 4 }} />
          Talento Humano
        </button>
      </div>

      {role === "colaborador" ? <ColaboradorPortal /> : <THPortal />}
    </div>
  );
}

