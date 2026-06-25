import {
  BarChart3,
  GraduationCap,
  HardHat,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";
import { SstHubCard } from "./components/SstHubCard";
import "./SstPages.css";

const cards = [
  {
    to: "/sst/incidentes",
    tone: "success" as const,
    icon: ShieldAlert,
    title: "Incidentes y Accidentes",
    description:
      "Registrar y realizar seguimiento de incidentes laborales, accidentes de trabajo y enfermedades laborales.",
    actionLabel: "Ver registros",
  },
  {
    to: "/sst/riesgos",
    tone: "info" as const,
    icon: TriangleAlert,
    title: "Identificación de Riesgos",
    description: "Gestionar la matriz de peligros y riesgos por municipio, sede y proceso.",
    actionLabel: "Ver matriz",
  },
  {
    to: "/sst/capacitaciones",
    tone: "warning" as const,
    icon: GraduationCap,
    title: "Capacitaciones SST",
    description: "Programar y registrar capacitaciones obligatorias y actividades preventivas.",
    actionLabel: "Ver capacitaciones",
  },
  {
    to: "/sst/examenes-medicos",
    tone: "purple" as const,
    icon: Stethoscope,
    title: "Exámenes Médicos",
    description:
      "Controlar exámenes de ingreso, periódicos, retiro y manipuladores de alimentos.",
    actionLabel: "Ver exámenes",
  },
  {
    to: "/sst/epp",
    tone: "orange" as const,
    icon: HardHat,
    title: "Elementos de Protección Personal",
    description: "Gestionar inventario y entregas de EPP.",
    actionLabel: "Ver EPP",
  },
  {
    to: "/sst/indicadores",
    tone: "cyan" as const,
    icon: BarChart3,
    title: "Indicadores SST",
    description: "Consultar indicadores de gestión y desempeño del SG-SST.",
    actionLabel: "Ver indicadores",
  },
];

export default function SstPage() {
  return (
    <div className="sst-page">
      <header className="sst-header">
        <div className="sst-header-icon">
          <ShieldAlert size={22} />
        </div>

        <div>
          <span>Módulo</span>
          <h1>SEGURIDAD Y SALUD EN EL TRABAJO</h1>
          <p>Registro, seguimiento y control de actividades SST del programa PAE.</p>
        </div>
      </header>

      <div className="sst-hub-grid">
        {cards.map((card) => (
          <SstHubCard key={card.to} {...card} />
        ))}
      </div>
    </div>
  );
}
