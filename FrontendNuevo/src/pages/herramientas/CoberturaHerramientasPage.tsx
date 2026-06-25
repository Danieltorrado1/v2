import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  History,
  School,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import "./CoberturaHerramientasPage.css";

const kpis = [
  {
    tone: "primary",
    icon: TrendingUp,
    label: "Cobertura promedio",
    value: "87.4%",
    caption: "Junio 2026",
  },
  {
    tone: "success",
    icon: School,
    label: "Instituciones reportando",
    value: "42 / 48",
    caption: "87.5% de cumplimiento",
  },
  {
    tone: "info",
    icon: Building2,
    label: "Cupos totales",
    value: "9.840",
    caption: "Base mensual",
  },
  {
    tone: "warning",
    icon: AlertTriangle,
    label: "Alertas de cobertura",
    value: "5",
    caption: "Por debajo del 80%",
  },
];

const filterSelects = ["Municipio", "Institución", "Modalidad", "Mes"];

type Estado = "Óptima" | "Aceptable" | "En riesgo";

type FilaCobertura = {
  id: string;
  institucion: string;
  municipio: string;
  modalidad: string;
  asignados: number;
  atendidos: number;
  estado: Estado;
};

const filas: FilaCobertura[] = [
  { id: "1", institucion: "IE Simón Bolívar", municipio: "Acacías", modalidad: "Almuerzo", asignados: 240, atendidos: 232, estado: "Óptima" },
  { id: "2", institucion: "IE Jorge Eliecer Gaitán", municipio: "Granada", modalidad: "Almuerzo + Refrigerio", asignados: 310, atendidos: 268, estado: "Aceptable" },
  { id: "3", institucion: "IE Hernando Turbay", municipio: "Vistahermosa", modalidad: "Refrigerio", asignados: 190, atendidos: 138, estado: "En riesgo" },
  { id: "4", institucion: "IE La Macarena Centro", municipio: "La Macarena", modalidad: "Almuerzo", asignados: 175, atendidos: 171, estado: "Óptima" },
  { id: "5", institucion: "IE Santa Inés", municipio: "Puerto Rico", modalidad: "Almuerzo", asignados: 205, atendidos: 156, estado: "Aceptable" },
  { id: "6", institucion: "IE El Castillo", municipio: "El Castillo", modalidad: "Refrigerio", asignados: 160, atendidos: 121, estado: "En riesgo" },
  { id: "7", institucion: "IE Nuestra Señora del Carmen", municipio: "Castilla La Nueva", modalidad: "Almuerzo", asignados: 198, atendidos: 191, estado: "Óptima" },
  { id: "8", institucion: "IE Marco Fidel Suárez", municipio: "Fuente de Oro", modalidad: "Almuerzo + Refrigerio", asignados: 220, atendidos: 200, estado: "Aceptable" },
];

function coberturaPct(row: FilaCobertura) {
  return (row.atendidos / row.asignados) * 100;
}

function estadoTone(estado: Estado) {
  if (estado === "Óptima") return "success";
  if (estado === "Aceptable") return "warning";
  return "danger";
}

type CargaHistorial = {
  id: string;
  fecha: string;
  usuario: string;
  archivo: string;
  registros: number;
  estado: "Procesado" | "Con errores";
};

const historialCargas: CargaHistorial[] = [
  { id: "c1", fecha: "22 Jun 2026", usuario: "Laura V.", archivo: "cobertura_junio_w3.xlsx", registros: 48, estado: "Procesado" },
  { id: "c2", fecha: "15 Jun 2026", usuario: "Laura V.", archivo: "cobertura_junio_w2.xlsx", registros: 46, estado: "Procesado" },
  { id: "c3", fecha: "08 Jun 2026", usuario: "Andrés M.", archivo: "cobertura_junio_w1.xlsx", registros: 44, estado: "Con errores" },
];

export default function CoberturaHerramientasPage() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  return (
    <div className="tool-page">
      <header className="tool-header">
        <div className="tool-header-icon">
          <Building2 size={22} />
        </div>

        <div>
          <span>Herramientas</span>
          <h1>Cobertura</h1>
          <p>Seguimiento operativo de la cobertura de cupos por institución y municipio.</p>
        </div>
      </header>

      <div className="cobertura-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <div className={`cobertura-kpi ${kpi.tone}`} key={kpi.label}>
              <div className="cobertura-kpi-icon">
                <Icon size={20} />
              </div>

              <div className="cobertura-kpi-body">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                <small>{kpi.caption}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cobertura-toolbar">
        <div className="cobertura-filters">
          {filterSelects.map((label) => (
            <div className="cobertura-select-wrap" key={label}>
              <select className="cobertura-select" defaultValue={label}>
                <option value={label}>{label}</option>
              </select>
              <ChevronDown size={14} />
            </div>
          ))}
        </div>

        <div className="cobertura-actions">
          <button type="button" className="cobertura-action" onClick={() => setIsUploadOpen(true)}>
            <Upload size={16} />
            Subir cobertura
          </button>

          <button type="button" className="cobertura-action primary">
            <Download size={16} />
            Descargar Excel
          </button>
        </div>
      </div>

      <section className="tool-card">
        <div className="tool-card-title">
          <Building2 size={18} />
          <h2>Tabla operativa</h2>
        </div>

        <div className="cobertura-table-scroll">
          <div className="cobertura-table-head">
            <span>Institución</span>
            <span>Municipio</span>
            <span>Modalidad</span>
            <span>Asignados</span>
            <span>Atendidos</span>
            <span>Cobertura</span>
            <span>Estado</span>
          </div>

          {filas.map((row) => (
            <div className="cobertura-table-row" key={row.id}>
              <strong>{row.institucion}</strong>
              <span>{row.municipio}</span>
              <span>{row.modalidad}</span>
              <span>{row.asignados}</span>
              <span>{row.atendidos}</span>
              <span className={`cobertura-pct ${estadoTone(row.estado)}`}>
                {coberturaPct(row).toFixed(1)}%
              </span>
              <span className={`cobertura-status ${estadoTone(row.estado)}`}>{row.estado}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="tool-card">
        <div className="tool-card-title">
          <History size={18} />
          <h2>Historial</h2>
        </div>

        <div className="cobertura-table-scroll">
          <div className="historial-cargas-head">
            <span>Fecha</span>
            <span>Usuario</span>
            <span>Archivo</span>
            <span>Registros</span>
            <span>Estado</span>
          </div>

          {historialCargas.map((carga) => (
            <div className="historial-cargas-row" key={carga.id}>
              <span>{carga.fecha}</span>
              <span>{carga.usuario}</span>
              <span className="archivo-cell">
                <FileSpreadsheet size={15} />
                {carga.archivo}
              </span>
              <span>{carga.registros}</span>
              <span className={`historial-cargas-badge ${carga.estado === "Procesado" ? "success" : "danger"}`}>
                {carga.estado === "Procesado" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {carga.estado}
              </span>
            </div>
          ))}
        </div>
      </section>

      {isUploadOpen && (
        <div className="cobertura-modal-overlay" onClick={() => setIsUploadOpen(false)}>
          <div className="cobertura-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cobertura-modal-header">
              <div>
                <h3>Subir cobertura</h3>
                <p>Carga el archivo de cobertura del período actual.</p>
              </div>

              <button
                type="button"
                className="cobertura-modal-close"
                onClick={() => setIsUploadOpen(false)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="cobertura-modal-body">
              <Upload size={28} />
              <p>Arrastra el archivo Excel aquí o haz clic para seleccionarlo.</p>
              <span>La carga y validación se habilitará próximamente.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
