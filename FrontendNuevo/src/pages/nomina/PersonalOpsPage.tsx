import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileUp,
  Info,
  MapPin,
  Plus,
  Search,
  Users,
} from "lucide-react";
import "./NominaPages.css";

function formatCOP(v: number) {
  return `$${v.toLocaleString("es-CO")}`;
}

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type Kpi = { tone: Tone; icon: ComponentType<{ size?: number }>; label: string; value: string; caption: string };

const kpis: Kpi[] = [
  { tone: "primary", icon: Users,        label: "OPS activos",          value: "6",           caption: "Contratistas vigentes" },
  { tone: "warning", icon: ClipboardList,label: "Cuentas por cobrar",   value: "4",           caption: "Pendientes de revisión" },
  { tone: "info",    icon: Eye,          label: "Cuentas revisadas",    value: "1",           caption: "En proceso" },
  { tone: "success", icon: CheckCircle2, label: "Cuentas aprobadas",    value: "1",           caption: "Listas para pago" },
  { tone: "neutral", icon: Banknote,     label: "Valor estimado",       value: formatCOP(9_900_000), caption: "Total período" },
  { tone: "danger",  icon: AlertTriangle,label: "Soportes pendientes",  value: "3",           caption: "Documentos faltantes" },
];

type EstadoOps = "Pendiente" | "En revisión" | "Aprobada" | "Pagada" | "Devuelta";

const toneOps: Record<EstadoOps, Tone> = {
  Pendiente:     "warning",
  "En revisión": "info",
  Aprobada:      "success",
  Pagada:        "primary",
  Devuelta:      "danger",
};

type OpsRow = {
  id: string;
  initials: string;
  color: string;
  name: string;
  documento: string;
  objeto: string;
  municipio: string;
  inicio: string;
  fin: string;
  cuentaCobro: string;
  valor: number;
  soportes: boolean;
  estado: EstadoOps;
};

const rows: OpsRow[] = [
  {
    id: "1", initials: "AG", color: "orange",
    name: "Amparo González Leal", documento: "CC 1.005.771.338",
    objeto: "Nutricionista ICBF", municipio: "La Macarena",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-001-2026",
    valor: 1_650_000, soportes: false, estado: "Pendiente",
  },
  {
    id: "2", initials: "ES", color: "blue",
    name: "Esperanza Suárez Gil", documento: "CC 1.123.667.889",
    objeto: "Técnica laboratorio", municipio: "Fuente de Oro",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-002-2026",
    valor: 1_650_000, soportes: true, estado: "En revisión",
  },
  {
    id: "3", initials: "JC", color: "cyan",
    name: "Jorge Andrés Cárdenas Lozano", documento: "CC 1.010.234.567",
    objeto: "Médico general", municipio: "El Castillo",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-003-2026",
    valor: 2_200_000, soportes: true, estado: "Aprobada",
  },
  {
    id: "4", initials: "PM", color: "purple",
    name: "Paola Ximena Morales Suárez", documento: "CC 1.007.889.012",
    objeto: "Psicóloga comunitaria", municipio: "Vistahermosa",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-004-2026",
    valor: 1_800_000, soportes: false, estado: "Pendiente",
  },
  {
    id: "5", initials: "HB", color: "teal",
    name: "Hernán Camilo Bolaños Ríos", documento: "CC 1.009.112.345",
    objeto: "Fisioterapeuta", municipio: "Puerto Rico",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-005-2026",
    valor: 1_800_000, soportes: true, estado: "Pagada",
  },
  {
    id: "6", initials: "DO", color: "pink",
    name: "Diana Lucía Ospina Vargas", documento: "CC 1.004.556.789",
    objeto: "Odontóloga rural", municipio: "Castilla La Nueva",
    inicio: "01/06/2026", fin: "30/06/2026", cuentaCobro: "CC-006-2026",
    valor: 1_800_000, soportes: false, estado: "Devuelta",
  },
];

const opsRules = [
  "No aplica caja de compensación familiar.",
  "No genera prestaciones sociales laborales.",
  "Requiere cuenta de cobro mensual firmada.",
  "Debe adjuntar soporte de cumplimiento de objeto.",
  "El pago se procesa dentro de los 10 días hábiles.",
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

export default function PersonalOpsPage() {
  return (
    <div className="np-page">
      {/* Header */}
      <header className="np-header">
        <div className="np-header-text">
          <h1>Personal OPS</h1>
          <p>Control de contratistas OPS, cuentas de cobro y soportes del período.</p>
        </div>
        <div className="np-header-actions">
          <button type="button" className="np-btn primary">
            <Plus size={16} /> Registrar OPS
          </button>
          <button type="button" className="np-btn">
            <FileUp size={16} /> Cargar soporte
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
            <input placeholder="Buscar contratista" />
          </div>
          <NpSelect label="Período" />
          <NpSelect label="Estado cuenta" />
          <NpSelect label="Municipio" icon={MapPin} />
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
            style={{ gridTemplateColumns: "minmax(180px,2fr) 130px 110px 100px 100px 130px 110px 70px 110px 130px" }}
          >
            <span>Contratista</span>
            <span>Objeto / Cargo</span>
            <span>Municipio</span>
            <span>F. inicio</span>
            <span>F. fin</span>
            <span>Cuenta cobro</span>
            <span>Valor</span>
            <span>Sop.</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              className="np-table-row"
              style={{ gridTemplateColumns: "minmax(180px,2fr) 130px 110px 100px 100px 130px 110px 70px 110px 130px" }}
            >
              <div className="np-cell-employee">
                <div className={`np-avatar ${row.color}`}>{row.initials}</div>
                <div>
                  <strong>{row.name}</strong>
                  <p>{row.documento}</p>
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{row.objeto}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.municipio}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.inicio}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.fin}</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{row.cuentaCobro}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{formatCOP(row.valor)}</span>
              <span style={{ fontSize: 18 }}>{row.soportes ? "✅" : "❌"}</span>
              <span className={`np-badge ${toneOps[row.estado]}`}>{row.estado}</span>
              <div className="np-row-actions">
                <button type="button" title="Ver ficha"><Eye size={14} /></button>
                <button type="button" title="Registrar cuenta"><Edit3 size={14} /></button>
                <button type="button" title="Revisar soportes"><FileCheck size={14} /></button>
                <button type="button" title="Generar cuenta"><ClipboardList size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OPS rules panel */}
      <div className="np-info-panel">
        <h4><Info size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Reglas del régimen OPS</h4>
        <ul className="np-info-list">
          {opsRules.map((rule) => (
            <li key={rule}>
              <CheckCircle2 size={14} />
              {rule}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
