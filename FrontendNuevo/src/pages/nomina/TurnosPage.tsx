import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Edit3,
  Eye,
  FileCheck,
  FileUp,
  MapPin,
  Plus,
  Search,
  ThumbsUp,
  Users,
} from "lucide-react";
import "./NominaPages.css";

function formatCOP(v: number) {
  return `$${v.toLocaleString("es-CO")}`;
}

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "purple";

type Kpi = { tone: Tone; icon: ComponentType<{ size?: number }>; label: string; value: string; caption: string };

const kpis: Kpi[] = [
  { tone: "primary", icon: Users,       label: "Turnos del período",   value: "8",           caption: "Junio 2026" },
  { tone: "info",    icon: CheckCircle2,label: "Turnos internos",       value: "5",           caption: "Personal propio" },
  { tone: "purple",  icon: Clock,       label: "Turnos externos",       value: "3",           caption: "Cobertura externa" },
  { tone: "success", icon: Banknote,    label: "Valor turnos",          value: formatCOP(4_380_000), caption: "Total acumulado" },
  { tone: "warning", icon: AlertTriangle,label:"Pend. aprobación",      value: "2",           caption: "Requieren revisión" },
  { tone: "danger",  icon: FileCheck,   label: "Sin soporte",           value: "1",           caption: "Documentos faltantes" },
];

type EstadoTurno = "Pendiente" | "Aprobado" | "Liquidado" | "Rechazado";

const toneTurno: Record<EstadoTurno, Tone> = {
  Pendiente:  "warning",
  Aprobado:   "success",
  Liquidado:  "info",
  Rechazado:  "danger",
};

type TurnoRow = {
  id: string;
  fecha: string;
  cubre: string;
  reemplaza: string;
  municipio: string;
  institucion: string;
  sede: string;
  modalidad: "Presencial" | "Virtual";
  tipo: "Interno" | "Externo";
  valor: number;
  estado: EstadoTurno;
  soporte: boolean;
};

const rows: TurnoRow[] = [
  { id:"1", fecha:"02/06/2026", cubre:"Nohora Ramírez Bernal",        reemplaza:"Carmen Ruiz Moreno",          municipio:"Granada",         institucion:"ESE Granada",       sede:"Central",    modalidad:"Presencial", tipo:"Interno",  valor:480_000,  estado:"Aprobado",   soporte:true },
  { id:"2", fecha:"05/06/2026", cubre:"Betty Herrera Pinto",           reemplaza:"María Torres Ospina",         municipio:"Acacías",         institucion:"Hosp. Municipal",   sede:"Urgencias",  modalidad:"Presencial", tipo:"Interno",  valor:520_000,  estado:"Liquidado",  soporte:true },
  { id:"3", fecha:"08/06/2026", cubre:"Jorge Andrés Cárdenas Lozano",  reemplaza:"Rosa Jiménez Castro",         municipio:"Vistahermosa",    institucion:"Puesto de salud",   sede:"Principal",  modalidad:"Presencial", tipo:"Externo",  valor:650_000,  estado:"Aprobado",   soporte:true },
  { id:"4", fecha:"10/06/2026", cubre:"Paola Ximena Morales Suárez",   reemplaza:"Amparo González Leal",        municipio:"La Macarena",     institucion:"ESE Macarena",      sede:"Maternidad", modalidad:"Presencial", tipo:"Externo",  valor:700_000,  estado:"Pendiente",  soporte:false },
  { id:"5", fecha:"12/06/2026", cubre:"Esperanza Suárez Gil",           reemplaza:"Luz Marina Pérez Vargas",     municipio:"Puerto Rico",     institucion:"Hosp. Puerto Rico", sede:"Central",    modalidad:"Presencial", tipo:"Interno",  valor:480_000,  estado:"Aprobado",   soporte:true },
  { id:"6", fecha:"15/06/2026", cubre:"Hernán Camilo Bolaños Ríos",    reemplaza:"Nohora Ramírez Bernal",       municipio:"El Castillo",     institucion:"Puesto Castillo",   sede:"Única",      modalidad:"Virtual",    tipo:"Externo",  valor:590_000,  estado:"Pendiente",  soporte:true },
  { id:"7", fecha:"18/06/2026", cubre:"Carmen Alicia Ruiz Moreno",      reemplaza:"Betty Herrera Pinto",         municipio:"Fuente de Oro",   institucion:"ESE Fuente de Oro", sede:"Consulta",   modalidad:"Presencial", tipo:"Interno",  valor:480_000,  estado:"Liquidado",  soporte:true },
  { id:"8", fecha:"22/06/2026", cubre:"Diana Lucía Ospina Vargas",      reemplaza:"Esperanza Suárez Gil",        municipio:"Castilla La Nueva",institucion:"Clínica Castilla", sede:"Central",    modalidad:"Presencial", tipo:"Interno",  valor:480_000,  estado:"Rechazado",  soporte:true },
];

const porMunicipio = [
  { mun: "Granada",          count: 1, valor: 480_000 },
  { mun: "Acacías",          count: 1, valor: 520_000 },
  { mun: "Vistahermosa",     count: 1, valor: 650_000 },
  { mun: "La Macarena",      count: 1, valor: 700_000 },
  { mun: "Puerto Rico",      count: 1, valor: 480_000 },
  { mun: "El Castillo",      count: 1, valor: 590_000 },
  { mun: "Fuente de Oro",    count: 1, valor: 480_000 },
  { mun: "Castilla La Nueva",count: 1, valor: 480_000 },
];

const top5 = [
  { name: "Carmen Alicia Ruiz Moreno",  turnos: 3 },
  { name: "Nohora Ramírez Bernal",      turnos: 2 },
  { name: "Betty Herrera Pinto",        turnos: 2 },
  { name: "Esperanza Suárez Gil",       turnos: 2 },
  { name: "Jorge Andrés Cárdenas",      turnos: 1 },
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

export default function TurnosPage() {
  return (
    <div className="np-page">
      {/* Header */}
      <header className="np-header">
        <div className="np-header-text">
          <h1>Turnos</h1>
          <p>Registra turnos, reemplazos y pagos asociados a la operación.</p>
        </div>
        <div className="np-header-actions">
          <button type="button" className="np-btn primary">
            <Plus size={16} /> Registrar turno
          </button>
          <button type="button" className="np-btn">
            <FileUp size={16} /> Importar
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
          <NpSelect label="Municipio" icon={MapPin} />
          <NpSelect label="Tipo turno" />
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
            style={{ gridTemplateColumns: "110px minmax(160px,1.5fr) minmax(160px,1.5fr) 110px 130px 90px 90px 80px 110px 80px 130px" }}
          >
            <span>Fecha</span>
            <span>Cubre</span>
            <span>Reemplaza</span>
            <span>Municipio</span>
            <span>Institución</span>
            <span>Sede</span>
            <span>Modalidad</span>
            <span>Tipo</span>
            <span>Valor</span>
            <span>Soporte</span>
            <span>Estado / Acc.</span>
          </div>

          {rows.map((row) => (
            <div
              key={row.id}
              className="np-table-row"
              style={{ gridTemplateColumns: "110px minmax(160px,1.5fr) minmax(160px,1.5fr) 110px 130px 90px 90px 80px 110px 80px 130px" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.fecha}</span>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.cubre}</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.reemplaza}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.municipio}</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.institucion}</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.sede}</span>
              <span className={`np-badge ${row.modalidad === "Presencial" ? "info" : "neutral"}`}>{row.modalidad}</span>
              <span className={`np-badge ${row.tipo === "Interno" ? "primary" : "purple"}`}>{row.tipo}</span>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{formatCOP(row.valor)}</span>
              <span style={{ fontSize: 18 }}>{row.soporte ? "✅" : "❌"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span className={`np-badge ${toneTurno[row.estado]}`}>{row.estado}</span>
                <div className="np-row-actions">
                  <button type="button" title="Ver"><Eye size={14} /></button>
                  <button type="button" title="Editar"><Edit3 size={14} /></button>
                  <button type="button" title="Aprobar"><ThumbsUp size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary panels */}
      <div className="np-summary-row">
        <div className="np-summary-card">
          <h4>Turnos por municipio</h4>
          {porMunicipio.map((item) => (
            <div key={item.mun} className="np-summary-item">
              <span>{item.mun}</span>
              <strong>{item.count} — {formatCOP(item.valor)}</strong>
            </div>
          ))}
        </div>

        <div className="np-summary-card">
          <h4>Valor por tipo</h4>
          <div className="np-summary-item">
            <span>Internos (5 turnos)</span>
            <strong>{formatCOP(2_440_000)}</strong>
          </div>
          <div className="np-summary-item">
            <span>Externos (3 turnos)</span>
            <strong>{formatCOP(1_940_000)}</strong>
          </div>
          <div className="np-summary-item" style={{ fontWeight: 800 }}>
            <span>Total</span>
            <strong style={{ color: "var(--color-primary)" }}>{formatCOP(4_380_000)}</strong>
          </div>
        </div>

        <div className="np-summary-card">
          <h4>Top 5 — más turnos</h4>
          {top5.map((p, i) => (
            <div key={p.name} className="np-summary-item">
              <span>{i + 1}. {p.name}</span>
              <strong>{p.turnos}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
