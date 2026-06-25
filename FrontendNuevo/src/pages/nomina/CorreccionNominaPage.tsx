import type { ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import "./NominaPages.css";

function formatCOP(v: number) {
  return `$${v.toLocaleString("es-CO")}`;
}

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type Kpi = { tone: Tone; icon: ComponentType<{ size?: number }>; label: string; value: string; caption: string };

const kpis: Kpi[] = [
  { tone: "warning", icon: AlertTriangle, label: "Correcciones abiertas",     value: "3",           caption: "Requieren atención" },
  { tone: "success", icon: CheckCircle2,  label: "Correcciones aprobadas",    value: "2",           caption: "Período actual" },
  { tone: "success", icon: TrendingUp,    label: "Ajustes positivos",         value: formatCOP(1_240_000), caption: "Adiciones" },
  { tone: "danger",  icon: TrendingDown,  label: "Ajustes negativos",         value: formatCOP(780_000),   caption: "Deducciones / reversiones" },
  { tone: "neutral", icon: ClipboardList, label: "Pend. soporte",             value: "2",           caption: "Documentos faltantes" },
  { tone: "info",    icon: RefreshCw,     label: "Reprocesos",                value: "1",           caption: "Períodos en reproceso" },
];

type TipoCorrec =
  | "Adición"
  | "Deducción"
  | "Reversión"
  | "Reproceso"
  | "Corrección de días"
  | "Corrección de novedad"
  | "Corrección de salario";

type EstadoCorrec = "Pendiente" | "En revisión" | "Aprobada" | "Aplicada" | "Rechazada";

const toneCorrec: Record<EstadoCorrec, Tone> = {
  Pendiente:     "warning",
  "En revisión": "info",
  Aprobada:      "success",
  Aplicada:      "primary",
  Rechazada:     "danger",
};

const toneTipo: Record<TipoCorrec, Tone> = {
  Adición:                "success",
  Deducción:              "danger",
  Reversión:              "warning",
  Reproceso:              "purple",
  "Corrección de días":   "info",
  "Corrección de novedad":"neutral",
  "Corrección de salario":"primary",
};

type CorrecRow = {
  id: string;
  initials: string;
  color: string;
  fechaSolicitud: string;
  empleado: string;
  documento: string;
  periodoAfectado: string;
  tipo: TipoCorrec;
  motivo: string;
  valor: number;
  positivo: boolean;
  solicitadoPor: string;
  estado: EstadoCorrec;
  soporte: boolean;
};

const rows: CorrecRow[] = [
  {
    id: "1", initials: "MT", color: "green",
    fechaSolicitud: "10/06/2026", empleado: "María Fernanda Torres Ospina",
    documento: "CC 1.121.873.256", periodoAfectado: "Mayo 2026",
    tipo: "Adición", motivo: "Omisión de horas extras nocturnas",
    valor: 320_000, positivo: true, solicitadoPor: "Coord. Nómina", estado: "Aprobada", soporte: true,
  },
  {
    id: "2", initials: "CR", color: "blue",
    fechaSolicitud: "11/06/2026", empleado: "Carmen Alicia Ruiz Moreno",
    documento: "CC 1.008.342.114", periodoAfectado: "Mayo 2026",
    tipo: "Corrección de días", motivo: "Error en liquidación de incapacidad",
    valor: 98_000, positivo: false, solicitadoPor: "Coord. Nómina", estado: "En revisión", soporte: true,
  },
  {
    id: "3", initials: "RJ", color: "purple",
    fechaSolicitud: "12/06/2026", empleado: "Rosa Elvira Jiménez Castro",
    documento: "CC 1.120.558.447", periodoAfectado: "Abril 2026",
    tipo: "Reversión", motivo: "Pago duplicado de prima de servicios",
    valor: 680_000, positivo: false, solicitadoPor: "Auditoría interna", estado: "Aplicada", soporte: true,
  },
  {
    id: "4", initials: "AG", color: "orange",
    fechaSolicitud: "14/06/2026", empleado: "Amparo González Leal",
    documento: "CC 1.005.771.338", periodoAfectado: "Mayo 2026",
    tipo: "Corrección de salario", motivo: "Actualización salarial retroactiva",
    valor: 920_000, positivo: true, solicitadoPor: "Dir. Talento Humano", estado: "Pendiente", soporte: false,
  },
  {
    id: "5", initials: "LP", color: "red",
    fechaSolicitud: "15/06/2026", empleado: "Luz Marina Pérez Vargas",
    documento: "CC 1.122.456.789", periodoAfectado: "Marzo 2026",
    tipo: "Reproceso", motivo: "Liquidación incorrecta por cambio de municipio",
    valor: 0, positivo: true, solicitadoPor: "Coord. Nómina", estado: "En revisión", soporte: false,
  },
  {
    id: "6", initials: "NR", color: "cyan",
    fechaSolicitud: "17/06/2026", empleado: "Nohora Stella Ramírez Bernal",
    documento: "CC 1.119.002.003", periodoAfectado: "Mayo 2026",
    tipo: "Corrección de novedad", motivo: "Novedad de licencia registrada en período errado",
    valor: 0, positivo: false, solicitadoPor: "Coord. Nómina", estado: "Rechazada", soporte: true,
  },
];

const historial = [
  { fecha: "08/05/2026", empleado: "Betty Herrera Pinto",    periodo: "Abril 2026",  valor: 214_000, estado: "Aplicada" as EstadoCorrec },
  { fecha: "15/04/2026", empleado: "Esperanza Suárez Gil",   periodo: "Marzo 2026",  valor: 560_000, estado: "Aplicada" as EstadoCorrec },
  { fecha: "02/04/2026", empleado: "María Torres Ospina",    periodo: "Feb 2026",    valor: 98_000,  estado: "Rechazada" as EstadoCorrec },
  { fecha: "20/03/2026", empleado: "Carmen Ruiz Moreno",     periodo: "Feb 2026",    valor: 320_000, estado: "Aplicada" as EstadoCorrec },
];

function NpSelect({ label, icon: Icon }: { label: string; icon?: ComponentType<{ size?: number }> }) {
  return (
    <div className="np-select-wrap">
      {Icon && <Icon size={15} />}
      <select className="np-select" defaultValue="">
        <option value="" disabled>{label}</option>
      </select>
      <ChevronDown size={13} />
    </div>
  );
}

export default function CorreccionNominaPage() {
  return (
    <div className="np-page">
      {/* Header */}
      <header className="np-header">
        <div className="np-header-text">
          <h1>Corrección de nómina</h1>
          <p>Registra ajustes, correcciones y reprocesos de períodos liquidados.</p>
        </div>
        <div className="np-header-actions">
          <button type="button" className="np-btn primary">
            <PlusCircle size={16} /> Nueva corrección
          </button>
          <button type="button" className="np-btn">
            <RefreshCw size={16} /> Reprocesar período
          </button>
          <button type="button" className="np-btn">
            <Download size={16} /> Exportar
          </button>
        </div>
      </header>

      {/* KPIs */}
      <div className="np-kpis">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`np-kpi ${k.tone}`}>
              <div className="np-kpi-icon"><Icon size={20} /></div>
              <div className="np-kpi-body">
                <span>{k.label}</span>
                <strong>{k.value}</strong>
                <small>{k.caption}</small>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="np-toolbar">
        <div className="np-toolbar-left">
          <div className="np-search">
            <Search size={16} />
            <input placeholder="Buscar colaborador" />
          </div>
          <NpSelect label="Período" />
          <NpSelect label="Tipo corrección" />
          <NpSelect label="Estado" />
        </div>
        <div className="np-toolbar-right">
          <button type="button" className="np-clear-btn">Limpiar</button>
        </div>
      </div>

      {/* Table */}
      <div className="np-table-card">
        <div className="np-table-scroll">
          <div
            className="np-table-head"
            style={{ gridTemplateColumns: "100px minmax(170px,2fr) 110px 130px 140px 160px 110px 130px 110px 70px 130px" }}
          >
            <span>F. solicitud</span>
            <span>Empleado</span>
            <span>Documento</span>
            <span>Período</span>
            <span>Tipo</span>
            <span>Motivo</span>
            <span>Valor ajuste</span>
            <span>Solicitado por</span>
            <span>Estado</span>
            <span>Sop.</span>
            <span>Acciones</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              className="np-table-row"
              style={{ gridTemplateColumns: "100px minmax(170px,2fr) 110px 130px 140px 160px 110px 130px 110px 70px 130px" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.fechaSolicitud}</span>

              <div className="np-cell-employee">
                <div className={`np-avatar ${row.color}`}>{row.initials}</div>
                <div>
                  <strong>{row.empleado}</strong>
                </div>
              </div>

              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{row.documento}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.periodoAfectado}</span>

              <span className={`np-badge ${toneTipo[row.tipo]}`}>{row.tipo}</span>

              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.motivo}
              </span>

              <span style={{ fontSize: 13, fontWeight: 800, color: row.valor === 0 ? "var(--text-secondary)" : row.positivo ? "var(--color-success)" : "var(--color-danger)", display: "flex", alignItems: "center", gap: 4 }}>
                {row.valor > 0 && (row.positivo ? <PlusCircle size={13} /> : <MinusCircle size={13} />)}
                {row.valor === 0 ? "—" : formatCOP(row.valor)}
              </span>

              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{row.solicitadoPor}</span>

              <span className={`np-badge ${toneCorrec[row.estado]}`}>{row.estado}</span>

              <span style={{ fontSize: 18 }}>{row.soporte ? "✅" : "❌"}</span>

              <div className="np-row-actions">
                <button type="button" title="Ver detalle"><Eye size={14} /></button>
                <button type="button" title="Editar"><Edit3 size={14} /></button>
                <button type="button" title="Aprobar"><CheckCircle2 size={14} /></button>
                <button type="button" title="Rechazar" style={{ color: "var(--color-danger)" }}><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historial reciente */}
      <div className="np-info-panel">
        <h4>Historial de correcciones aplicadas</h4>
        <div className="np-table-scroll">
          <div
            className="np-table-head"
            style={{ gridTemplateColumns: "120px 1fr 140px 130px 120px", background: "transparent", borderBottom: "1px solid var(--border-color)" }}
          >
            <span>Fecha</span>
            <span>Empleado</span>
            <span>Período</span>
            <span>Valor</span>
            <span>Estado</span>
          </div>
          {historial.map((h, i) => (
            <div
              key={i}
              className="np-table-row"
              style={{ gridTemplateColumns: "120px 1fr 140px 130px 120px" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.fecha}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.empleado}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{h.periodo}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCOP(h.valor)}</span>
              <span className={`np-badge ${toneCorrec[h.estado]}`}>{h.estado}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
