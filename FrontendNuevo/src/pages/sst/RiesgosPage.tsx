import { CheckCircle2, Download, Edit3, Eye, Plus, TriangleAlert } from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstToolbar } from "./components/SstToolbar";
import { SstTable } from "./components/SstTable";
import { SstBadge } from "./components/SstBadge";
import "./SstPages.css";

const kpis = [
  { tone: "primary" as const, icon: TriangleAlert, label: "Riesgos registrados", value: "38" },
  { tone: "danger" as const, icon: TriangleAlert, label: "Nivel alto", value: "6" },
  { tone: "warning" as const, icon: TriangleAlert, label: "Nivel medio", value: "17" },
  { tone: "success" as const, icon: CheckCircle2, label: "Controlados", value: "29" },
];

type Nivel = "Alto" | "Medio" | "Bajo";
type Estado = "Controlado" | "En proceso" | "Pendiente";

type Riesgo = {
  id: string;
  municipio: string;
  institucion: string;
  sede: string;
  proceso: string;
  peligro: string;
  riesgo: string;
  nivel: Nivel;
  control: string;
  accion: string;
  estado: Estado;
};

const riesgos: Riesgo[] = [
  { id: "1", municipio: "Acacías", institucion: "IE Simón Bolívar", sede: "Principal", proceso: "Preparación de alimentos", peligro: "Superficies calientes", riesgo: "Quemadura", nivel: "Medio", control: "Guantes térmicos", accion: "Reforzar señalización", estado: "En proceso" },
  { id: "2", municipio: "Granada", institucion: "IE Jorge Eliecer Gaitán", sede: "Principal", proceso: "Lavado y desinfección", peligro: "Pisos húmedos", riesgo: "Caída al mismo nivel", nivel: "Alto", control: "Señalización antideslizante", accion: "Instalar cinta antideslizante", estado: "Pendiente" },
  { id: "3", municipio: "Vistahermosa", institucion: "IE Hernando Turbay", sede: "Sede Norte", proceso: "Manipulación de carga", peligro: "Levantamiento manual", riesgo: "Lesión lumbar", nivel: "Alto", control: "Capacitación en manejo de cargas", accion: "Programar pausas activas", estado: "En proceso" },
  { id: "4", municipio: "La Macarena", institucion: "IE La Macarena Centro", sede: "Principal", proceso: "Cocción", peligro: "Gas combustible", riesgo: "Quemadura / incendio", nivel: "Alto", control: "Mantenimiento preventivo de estufas", accion: "Revisión semestral", estado: "Controlado" },
  { id: "5", municipio: "Puerto Rico", institucion: "IE Santa Inés", sede: "Principal", proceso: "Almacenamiento", peligro: "Estanterías sobrecargadas", riesgo: "Caída de objetos", nivel: "Medio", control: "Reorganización de bodega", accion: "Redistribuir carga", estado: "Controlado" },
  { id: "6", municipio: "El Castillo", institucion: "IE El Castillo", sede: "Principal", proceso: "Limpieza", peligro: "Productos químicos", riesgo: "Intoxicación / irritación", nivel: "Medio", control: "Uso de EPP y fichas de seguridad", accion: "Verificar disponibilidad de EPP", estado: "Controlado" },
  { id: "7", municipio: "Castilla La Nueva", institucion: "IE Nuestra Señora del Carmen", sede: "Principal", proceso: "Manipulación de alimentos", peligro: "Contacto con cuchillos", riesgo: "Corte / laceración", nivel: "Bajo", control: "Uso de guantes de malla", accion: "Sin acción adicional", estado: "Controlado" },
];

function nivelTone(nivel: Nivel) {
  if (nivel === "Alto") return "danger";
  if (nivel === "Medio") return "warning";
  return "success";
}

function estadoTone(estado: Estado) {
  if (estado === "Controlado") return "success";
  if (estado === "En proceso") return "info";
  return "danger";
}

export default function RiesgosPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={TriangleAlert}
        title="Identificación de Riesgos"
        subtitle="Matriz de peligros y riesgos por municipio, sede y proceso."
      />

      <SstKpis items={kpis} />

      <SstToolbar
        actions={[
          { label: "Nuevo riesgo", icon: Plus, primary: true },
          { label: "Exportar matriz", icon: Download },
        ]}
        searchPlaceholder="Buscar por institución, peligro o riesgo"
        filters={["Municipio", "Sede", "Nivel", "Estado"]}
      />

      <SstTable
        columns={[
          "Municipio",
          "Institución",
          "Sede",
          "Proceso",
          "Peligro",
          "Riesgo",
          "Nivel",
          "Control",
          "Acción requerida",
          "Estado",
          "Acciones",
        ]}
        gridTemplateColumns="110px minmax(160px,1.2fr) 110px minmax(140px,1fr) minmax(140px,1fr) minmax(140px,1fr) 90px minmax(160px,1.2fr) minmax(160px,1.2fr) 120px 100px"
        minWidth={1650}
      >
        {riesgos.map((item) => (
          <div className="sst-table-row" key={item.id}>
            <span>{item.municipio}</span>
            <strong>{item.institucion}</strong>
            <span>{item.sede}</span>
            <span>{item.proceso}</span>
            <span>{item.peligro}</span>
            <span>{item.riesgo}</span>
            <SstBadge tone={nivelTone(item.nivel)}>{item.nivel}</SstBadge>
            <span>{item.control}</span>
            <span>{item.accion}</span>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
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
