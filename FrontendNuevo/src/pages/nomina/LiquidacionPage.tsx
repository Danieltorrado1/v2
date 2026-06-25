import { useState } from "react";
import type { ComponentType } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import "./NominaPages.css";

function formatCOP(v: number) {
  return `$${v.toLocaleString("es-CO")}`;
}

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type Kpi = { tone: Tone; icon: ComponentType<{ size?: number }>; label: string; value: string; caption: string };

const kpis: Kpi[] = [
  { tone: "primary", icon: ClipboardList, label: "Liquidaciones del período", value: "5",           caption: "Junio 2026" },
  { tone: "warning", icon: Clock,         label: "En revisión",               value: "2",           caption: "Pendientes de aprobación" },
  { tone: "success", icon: CheckCircle2,  label: "Aprobadas",                 value: "2",           caption: "Listas para pago" },
  { tone: "info",    icon: Banknote,      label: "Valor estimado",            value: formatCOP(34_870_000), caption: "Total liquidaciones" },
  { tone: "danger",  icon: Users,         label: "Pend. de soporte",          value: "1",           caption: "Documentos faltantes" },
];

type EstadoLiq = "Borrador" | "En revisión" | "Aprobada" | "Pagada" | "Anulada";

const toneLiq: Record<EstadoLiq, Tone> = {
  Borrador:     "neutral",
  "En revisión":"warning",
  Aprobada:     "success",
  Pagada:       "info",
  Anulada:      "danger",
};

type LiqRow = {
  id: string;
  initials: string;
  color: string;
  name: string;
  documento: string;
  cargo: string;
  ingreso: string;
  retiro: string;
  dias: number;
  cesantias: number;
  intereses: number;
  prima: number;
  vacaciones: number;
  deducciones: number;
  neto: number;
  estado: EstadoLiq;
};

const rows: LiqRow[] = [
  {
    id: "1", initials: "MT", color: "green",
    name: "María Fernanda Torres Ospina", documento: "CC 1.121.873.256",
    cargo: "Auxiliar de enfermería", ingreso: "15/03/2022", retiro: "30/05/2026",
    dias: 1537, cesantias: 3_850_000, intereses: 462_000, prima: 1_925_000,
    vacaciones: 1_540_000, deducciones: 420_000, neto: 7_357_000, estado: "Aprobada",
  },
  {
    id: "2", initials: "CR", color: "blue",
    name: "Carmen Alicia Ruiz Moreno", documento: "CC 1.008.342.114",
    cargo: "Promotora de salud", ingreso: "01/07/2021", retiro: "10/06/2026",
    dias: 1805, cesantias: 4_200_000, intereses: 504_000, prima: 2_100_000,
    vacaciones: 1_680_000, deducciones: 512_000, neto: 7_972_000, estado: "En revisión",
  },
  {
    id: "3", initials: "RJ", color: "purple",
    name: "Rosa Elvira Jiménez Castro", documento: "CC 1.120.558.447",
    cargo: "Coordinadora municipal", ingreso: "20/11/2020", retiro: "31/05/2026",
    dias: 2018, cesantias: 5_100_000, intereses: 612_000, prima: 2_550_000,
    vacaciones: 2_040_000, deducciones: 780_000, neto: 9_522_000, estado: "Pagada",
  },
  {
    id: "4", initials: "AG", color: "orange",
    name: "Amparo del Carmen González Leal", documento: "CC 1.005.771.338",
    cargo: "Nutricionista", ingreso: "02/02/2023", retiro: "15/06/2026",
    dias: 1229, cesantias: 2_800_000, intereses: 336_000, prima: 1_400_000,
    vacaciones: 1_120_000, deducciones: 290_000, neto: 5_366_000, estado: "Borrador",
  },
  {
    id: "5", initials: "LP", color: "red",
    name: "Luz Marina Pérez Vargas", documento: "CC 1.122.456.789",
    cargo: "Auxiliar administrativo", ingreso: "10/09/2022", retiro: "20/06/2026",
    dias: 1380, cesantias: 3_200_000, intereses: 384_000, prima: 1_600_000,
    vacaciones: 1_280_000, deducciones: 320_000, neto: 6_144_000, estado: "En revisión",
  },
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

export default function LiquidacionPage() {
  const [selected, setSelected] = useState<LiqRow | null>(null);

  function toggleRow(row: LiqRow) {
    setSelected((prev) => (prev?.id === row.id ? null : row));
  }

  return (
    <div className="np-page">
      {/* Header */}
      <header className="np-header">
        <div className="np-header-text">
          <h1>Liquidación laboral</h1>
          <p>Calcula, revisa y genera liquidaciones de retiro del personal.</p>
        </div>
        <div className="np-header-actions">
          <button type="button" className="np-btn primary">
            <Plus size={16} /> Nueva liquidación
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
          <NpSelect label="Estado" />
          <NpSelect label="Tipo contrato" />
        </div>
        <div className="np-toolbar-right">
          <button type="button" className="np-clear-btn">Limpiar</button>
        </div>
      </div>

      {/* Table */}
      <div className="np-table-card">
        <div className="np-table-scroll">
          <div className="np-table-head" style={{ gridTemplateColumns: "minmax(200px,2fr) 100px 110px 110px 100px 110px 110px 105px 110px 120px" }}>
            <span>Empleado</span>
            <span>Cargo</span>
            <span>F. ingreso</span>
            <span>F. retiro</span>
            <span>Días</span>
            <span>Cesantías</span>
            <span>Prima</span>
            <span>Deduc.</span>
            <span>Neto</span>
            <span>Estado / Acc.</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              className="np-table-row"
              style={{ gridTemplateColumns: "minmax(200px,2fr) 100px 110px 110px 100px 110px 110px 105px 110px 120px", cursor: "pointer" }}
              onClick={() => toggleRow(row)}
            >
              <div className="np-cell-employee">
                <div className={`np-avatar ${row.color}`}>{row.initials}</div>
                <div>
                  <strong>{row.name}</strong>
                  <p>{row.documento}</p>
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>{row.cargo}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.ingreso}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.retiro}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{row.dias}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCOP(row.cesantias)}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatCOP(row.prima)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-danger)" }}>{formatCOP(row.deducciones)}</span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{formatCOP(row.neto)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <span className={`np-badge ${toneLiq[row.estado]}`}>{row.estado}</span>
                <div className="np-row-actions">
                  <button type="button" title="Ver detalle" onClick={() => toggleRow(row)}><Eye size={14} /></button>
                  <button type="button" title="Editar"><Edit3 size={14} /></button>
                  <button type="button" title="PDF"><FileText size={14} /></button>
                  <button type="button" title="Anular" style={{ color: "var(--color-danger)" }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="np-detail-panel">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h3>Detalle de liquidación</h3>
              <p>{selected.name} — {selected.cargo}</p>
            </div>
            <button
              type="button"
              className="np-row-actions"
              onClick={() => setSelected(null)}
              style={{ marginTop: 2 }}
            >
              <button type="button" title="Cerrar" style={{ width: 30, height: 30, border: "1px solid var(--border-color)", background: "var(--bg-primary)", borderRadius: 8, display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={14} />
              </button>
            </button>
          </div>

          <div className="np-detail-grid">
            <div className="np-detail-field"><span>Fecha ingreso</span><strong>{selected.ingreso}</strong></div>
            <div className="np-detail-field"><span>Fecha retiro</span><strong>{selected.retiro}</strong></div>
            <div className="np-detail-field"><span>Días liquidados</span><strong>{selected.dias}</strong></div>
            <div className="np-detail-field"><span>Estado</span><strong><span className={`np-badge ${toneLiq[selected.estado]}`}>{selected.estado}</span></strong></div>
          </div>

          <div className="np-detail-divider" />

          <div className="np-detail-grid">
            <div className="np-detail-field"><span>Cesantías</span><strong>{formatCOP(selected.cesantias)}</strong></div>
            <div className="np-detail-field"><span>Intereses cest.</span><strong>{formatCOP(selected.intereses)}</strong></div>
            <div className="np-detail-field"><span>Prima</span><strong>{formatCOP(selected.prima)}</strong></div>
            <div className="np-detail-field"><span>Vacaciones</span><strong>{formatCOP(selected.vacaciones)}</strong></div>
            <div className="np-detail-field"><span>Deducciones</span><strong style={{ color: "var(--color-danger)" }}>{formatCOP(selected.deducciones)}</strong></div>
          </div>

          <div className="np-detail-total">
            <span>Total neto a liquidar</span>
            <strong>{formatCOP(selected.neto)}</strong>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="np-btn primary"><FileText size={15} /> Generar documento</button>
            <button type="button" className="np-btn success-outline"><CheckCircle2 size={15} /> Aprobar</button>
            <button type="button" className="np-btn danger-outline"><Trash2 size={15} /> Anular</button>
          </div>
        </div>
      )}
    </div>
  );
}
