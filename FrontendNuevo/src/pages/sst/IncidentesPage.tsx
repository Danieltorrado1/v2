import { CheckCircle2, Download, Edit3, Eye, Plus, ShieldAlert } from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstToolbar } from "./components/SstToolbar";
import { SstTable } from "./components/SstTable";
import { SstBadge } from "./components/SstBadge";
import "./SstPages.css";

const kpis = [
  { tone: "primary" as const, icon: ShieldAlert, label: "Incidentes del período", value: "14" },
  { tone: "danger" as const, icon: ShieldAlert, label: "Accidentes laborales", value: "9" },
  { tone: "warning" as const, icon: ShieldAlert, label: "Enfermedades laborales", value: "2" },
  { tone: "warning" as const, icon: ShieldAlert, label: "Casos abiertos", value: "5" },
  { tone: "success" as const, icon: CheckCircle2, label: "Casos cerrados", value: "9" },
];

type Severidad = "Leve" | "Moderada" | "Grave";
type Estado = "Abierto" | "En investigación" | "Cerrado";

type Incidente = {
  id: string;
  fecha: string;
  trabajador: string;
  municipio: string;
  institucion: string;
  tipo: string;
  descripcion: string;
  severidad: Severidad;
  estado: Estado;
  responsable: string;
};

const incidentes: Incidente[] = [
  { id: "1", fecha: "18 Jun 2026", trabajador: "Carmen Alicia Ruiz Moreno", municipio: "Granada", institucion: "IE Jorge Eliecer Gaitán", tipo: "Accidente de trabajo", descripcion: "Corte superficial al manipular utensilios de cocina", severidad: "Leve", estado: "Cerrado", responsable: "Laura V." },
  { id: "2", fecha: "15 Jun 2026", trabajador: "Rosa Elvira Jiménez Castro", municipio: "Vistahermosa", institucion: "IE Hernando Turbay", tipo: "Accidente de trabajo", descripcion: "Caída al mismo nivel en zona de lavado", severidad: "Moderada", estado: "En investigación", responsable: "Andrés M." },
  { id: "3", fecha: "10 Jun 2026", trabajador: "María Fernanda Torres Ospina", municipio: "Acacías", institucion: "IE Simón Bolívar", tipo: "Enfermedad laboral", descripcion: "Dermatitis de contacto por agente de limpieza", severidad: "Leve", estado: "Abierto", responsable: "Laura V." },
  { id: "4", fecha: "05 Jun 2026", trabajador: "Luz Marina Pérez Vargas", municipio: "Puerto Rico", institucion: "IE Santa Inés", tipo: "Incidente", descripcion: "Casi caída por piso húmedo sin señalización", severidad: "Leve", estado: "Cerrado", responsable: "Andrés M." },
  { id: "5", fecha: "29 May 2026", trabajador: "Betty Josefina Herrera Pinto", municipio: "Castilla La Nueva", institucion: "IE Nuestra Señora del Carmen", tipo: "Accidente de trabajo", descripcion: "Quemadura leve con superficie caliente", severidad: "Moderada", estado: "Cerrado", responsable: "Laura V." },
  { id: "6", fecha: "21 May 2026", trabajador: "Esperanza Mireya Suárez Gil", municipio: "Fuente de Oro", institucion: "IE Marco Fidel Suárez", tipo: "Accidente de trabajo", descripcion: "Esfuerzo lumbar al manipular carga", severidad: "Grave", estado: "En investigación", responsable: "Andrés M." },
  { id: "7", fecha: "14 May 2026", trabajador: "Nohora Stella Ramírez Bernal", municipio: "El Castillo", institucion: "IE El Castillo", tipo: "Incidente", descripcion: "Conato de incendio controlado en cocina", severidad: "Moderada", estado: "Cerrado", responsable: "Laura V." },
];

function severidadTone(severidad: Severidad) {
  if (severidad === "Grave") return "danger";
  if (severidad === "Moderada") return "warning";
  return "info";
}

function estadoTone(estado: Estado) {
  if (estado === "Cerrado") return "success";
  if (estado === "En investigación") return "info";
  return "warning";
}

export default function IncidentesPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={ShieldAlert}
        title="Incidentes y Accidentes"
        subtitle="Registro y seguimiento de incidentes laborales."
      />

      <SstKpis items={kpis} />

      <SstToolbar
        actions={[
          { label: "Registrar incidente", icon: Plus, primary: true },
          { label: "Exportar", icon: Download },
        ]}
        searchPlaceholder="Buscar por trabajador, institución o descripción"
        filters={["Municipio", "Tipo", "Estado", "Fecha"]}
      />

      <SstTable
        columns={[
          "Fecha",
          "Trabajador",
          "Municipio",
          "Institución",
          "Tipo",
          "Descripción",
          "Severidad",
          "Estado",
          "Responsable",
          "Acciones",
        ]}
        gridTemplateColumns="100px minmax(180px,1.4fr) 120px minmax(160px,1.2fr) 150px minmax(220px,1.8fr) 100px 130px 110px 100px"
        minWidth={1500}
      >
        {incidentes.map((item) => (
          <div className="sst-table-row" key={item.id}>
            <span>{item.fecha}</span>
            <strong>{item.trabajador}</strong>
            <span>{item.municipio}</span>
            <span>{item.institucion}</span>
            <span>{item.tipo}</span>
            <span>{item.descripcion}</span>
            <SstBadge tone={severidadTone(item.severidad)}>{item.severidad}</SstBadge>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
            <span>{item.responsable}</span>
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
