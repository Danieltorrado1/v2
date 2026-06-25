import { Download, Eye, FileText, Plus, Stethoscope, Upload } from "lucide-react";
import { SstPageHeader } from "./components/SstPageHeader";
import { SstKpis } from "./components/SstKpis";
import { SstToolbar } from "./components/SstToolbar";
import { SstTable } from "./components/SstTable";
import { SstBadge } from "./components/SstBadge";
import "./SstPages.css";

const kpis = [
  { tone: "success" as const, icon: Stethoscope, label: "Vigentes", value: "186" },
  { tone: "warning" as const, icon: Stethoscope, label: "Próximos a vencer", value: "14" },
  { tone: "danger" as const, icon: Stethoscope, label: "Vencidos", value: "5" },
  { tone: "neutral" as const, icon: Stethoscope, label: "Pendientes", value: "8" },
];

type Tipo = "Ingreso" | "Periódico" | "Retiro" | "Manipulación de alimentos";
type Estado = "Vigente" | "Próximo a vencer" | "Vencido" | "Pendiente";

type Examen = {
  id: string;
  empleado: string;
  documento: string;
  tipo: Tipo;
  fechaExamen: string;
  vencimiento: string;
  estado: Estado;
  soporte: boolean;
};

const examenes: Examen[] = [
  { id: "1", empleado: "María Fernanda Torres Ospina", documento: "CC 1.121.873.256", tipo: "Manipulación de alimentos", fechaExamen: "12 Ene 2026", vencimiento: "12 Ene 2027", estado: "Vigente", soporte: true },
  { id: "2", empleado: "Carmen Alicia Ruiz Moreno", documento: "CC 1.008.342.114", tipo: "Periódico", fechaExamen: "03 Feb 2025", vencimiento: "03 Feb 2026", estado: "Vencido", soporte: true },
  { id: "3", empleado: "Rosa Elvira Jiménez Castro", documento: "CC 1.120.558.447", tipo: "Manipulación de alimentos", fechaExamen: "20 Jul 2025", vencimiento: "20 Jul 2026", estado: "Próximo a vencer", soporte: true },
  { id: "4", empleado: "Amparo del Carmen González Leal", documento: "CC 1.005.771.338", tipo: "Retiro", fechaExamen: "30 Abr 2026", vencimiento: "—", estado: "Vigente", soporte: true },
  { id: "5", empleado: "Luz Marina Pérez Vargas", documento: "CC 1.122.456.789", tipo: "Ingreso", fechaExamen: "05 May 2025", vencimiento: "05 May 2026", estado: "Próximo a vencer", soporte: false },
  { id: "6", empleado: "Nohora Stella Ramírez Bernal", documento: "CC 1.119.002.003", tipo: "Periódico", fechaExamen: "18 Oct 2024", vencimiento: "18 Oct 2025", estado: "Vencido", soporte: false },
  { id: "7", empleado: "Esperanza Mireya Suárez Gil", documento: "CC 1.123.667.889", tipo: "Manipulación de alimentos", fechaExamen: "—", vencimiento: "—", estado: "Pendiente", soporte: false },
];

function estadoTone(estado: Estado) {
  if (estado === "Vigente") return "success";
  if (estado === "Próximo a vencer") return "warning";
  if (estado === "Vencido") return "danger";
  return "neutral";
}

export default function ExamenesMedicosPage() {
  return (
    <div className="sst-page">
      <SstPageHeader
        icon={Stethoscope}
        title="Exámenes Médicos"
        subtitle="Control de exámenes de ingreso, periódicos, retiro y manipuladores de alimentos."
      />

      <SstKpis items={kpis} />

      <SstToolbar
        actions={[
          { label: "Registrar examen", icon: Plus, primary: true },
          { label: "Cargar soporte", icon: Upload },
          { label: "Exportar", icon: Download },
        ]}
        searchPlaceholder="Buscar por empleado o documento"
        filters={["Municipio", "Estado", "Tipo"]}
      />

      <SstTable
        columns={[
          "Empleado",
          "Documento",
          "Tipo",
          "Fecha examen",
          "Vencimiento",
          "Estado",
          "Soporte",
          "Acciones",
        ]}
        gridTemplateColumns="minmax(200px,1.8fr) 150px 180px 120px 120px 140px 100px 90px"
        minWidth={1180}
      >
        {examenes.map((item) => (
          <div className="sst-table-row" key={item.id}>
            <strong>{item.empleado}</strong>
            <span>{item.documento}</span>
            <span>{item.tipo}</span>
            <span>{item.fechaExamen}</span>
            <span>{item.vencimiento}</span>
            <SstBadge tone={estadoTone(item.estado)}>{item.estado}</SstBadge>
            <SstBadge tone={item.soporte ? "success" : "neutral"}>
              {item.soporte ? "Cargado" : "Sin soporte"}
            </SstBadge>
            <div className="sst-row-actions">
              <button type="button" title="Ver detalle" aria-label="Ver detalle">
                <Eye size={15} />
              </button>
              <button type="button" title="Ver soporte" aria-label="Ver soporte">
                <FileText size={15} />
              </button>
            </div>
          </div>
        ))}
      </SstTable>
    </div>
  );
}
