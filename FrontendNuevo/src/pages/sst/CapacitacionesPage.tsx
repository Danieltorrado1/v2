import {
  CalendarPlus,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  GraduationCap,
  Plus,
} from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstToolbar } from "./components/SstToolbar";
import { SstTable } from "./components/SstTable";
import { SstBadge } from "./components/SstBadge";
import "./SstPages.css";

const kpis = [
  { tone: "success" as const, icon: CheckCircle2, label: "Capacitaciones realizadas", value: "21" },
  { tone: "info" as const, icon: CalendarPlus, label: "Programadas", value: "6" },
  { tone: "warning" as const, icon: GraduationCap, label: "Pendientes", value: "4" },
  { tone: "primary" as const, icon: GraduationCap, label: "Cumplimiento", value: "87%" },
];

type Estado = "Realizada" | "Programada" | "Pendiente";
type Soporte = "Cargado" | "Pendiente";

type Capacitacion = {
  id: string;
  fecha: string;
  tema: string;
  municipio: string;
  institucion: string;
  sede: string;
  asistentes: number;
  responsable: string;
  estado: Estado;
  soporte: Soporte;
};

const capacitaciones: Capacitacion[] = [
  { id: "1", fecha: "19 Jun 2026", tema: "Manejo seguro de cargas", municipio: "Acacías", institucion: "IE Simón Bolívar", sede: "Principal", asistentes: 18, responsable: "Laura V.", estado: "Realizada", soporte: "Cargado" },
  { id: "2", fecha: "16 Jun 2026", tema: "Manipulación higiénica de alimentos", municipio: "Granada", institucion: "IE Jorge Eliecer Gaitán", sede: "Principal", asistentes: 22, responsable: "Andrés M.", estado: "Realizada", soporte: "Cargado" },
  { id: "3", fecha: "26 Jun 2026", tema: "Plan de emergencias y evacuación", municipio: "Vistahermosa", institucion: "IE Hernando Turbay", sede: "Sede Norte", asistentes: 15, responsable: "Laura V.", estado: "Programada", soporte: "Pendiente" },
  { id: "4", fecha: "10 Jun 2026", tema: "Uso correcto de EPP", municipio: "La Macarena", institucion: "IE La Macarena Centro", sede: "Principal", asistentes: 12, responsable: "Andrés M.", estado: "Realizada", soporte: "Cargado" },
  { id: "5", fecha: "30 Jun 2026", tema: "Pausas activas y ergonomía", municipio: "Puerto Rico", institucion: "IE Santa Inés", sede: "Principal", asistentes: 0, responsable: "Laura V.", estado: "Pendiente", soporte: "Pendiente" },
  { id: "6", fecha: "02 Jun 2026", tema: "Riesgo químico en limpieza", municipio: "El Castillo", institucion: "IE El Castillo", sede: "Principal", asistentes: 9, responsable: "Andrés M.", estado: "Realizada", soporte: "Cargado" },
];

function estadoTone(estado: Estado) {
  if (estado === "Realizada") return "success";
  if (estado === "Programada") return "info";
  return "warning";
}

export default function CapacitacionesPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={GraduationCap}
        title="Capacitaciones SST"
        subtitle="Programación y registro de capacitaciones obligatorias y actividades preventivas."
      />

      <SstKpis items={kpis} />

      <SstToolbar
        actions={[
          { label: "Registrar capacitación", icon: Plus, primary: true },
          { label: "Programar", icon: CalendarPlus },
          { label: "Exportar", icon: Download },
        ]}
        searchPlaceholder="Buscar por tema, institución o responsable"
      />

      <SstTable
        columns={[
          "Fecha",
          "Tema",
          "Municipio",
          "Institución",
          "Sede",
          "Asistentes",
          "Responsable",
          "Estado",
          "Soporte",
          "Acciones",
        ]}
        gridTemplateColumns="100px minmax(200px,1.6fr) 110px minmax(160px,1.2fr) 110px 100px 110px 120px 110px 100px"
        minWidth={1450}
      >
        {capacitaciones.map((item) => (
          <div className="sst-table-row" key={item.id}>
            <span>{item.fecha}</span>
            <strong>{item.tema}</strong>
            <span>{item.municipio}</span>
            <span>{item.institucion}</span>
            <span>{item.sede}</span>
            <span>{item.asistentes}</span>
            <span>{item.responsable}</span>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
            <SstBadge tone={item.soporte === "Cargado" ? "success" : "neutral"}>{item.soporte}</SstBadge>
            <div className="sst-row-actions">
              <button type="button" title="Ver detalle" aria-label="Ver detalle">
                <Eye size={15} />
              </button>
              <button type="button" title="Editar" aria-label="Editar">
                <Edit3 size={15} />
              </button>
            </div>
          </div>
        ))}
      </SstTable>
    </div>
  );
}
