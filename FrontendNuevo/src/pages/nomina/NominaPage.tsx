import { useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Calculator,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  FileWarning,
  IdCard,
  Lock,
  Plus,
  Receipt,
  Search,
  Upload,
  Users,
  Wallet,
  X,
} from "lucide-react";
import "./NominaPage.css";

function formatCOP(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

type Tone = "primary" | "success" | "warning" | "danger" | "info";

type Kpi = {
  tone: Tone;
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string;
  caption: string;
};

const kpis: Kpi[] = [
  {
    tone: "primary",
    icon: Users,
    label: "Empleados del período",
    value: "228",
    caption: "Base visible del período",
  },
  {
    tone: "success",
    icon: CheckCircle2,
    label: "Liquidados",
    value: "216",
    caption: "94.7%",
  },
  {
    tone: "warning",
    icon: AlertTriangle,
    label: "Novedades pendientes",
    value: "12",
    caption: "Pendientes de revisar",
  },
  {
    tone: "info",
    icon: Wallet,
    label: "Devengado",
    value: formatCOP(187432500),
    caption: "Total acumulado",
  },
  {
    tone: "danger",
    icon: Receipt,
    label: "Deducciones",
    value: formatCOP(23145500),
    caption: "Descuentos aplicados",
  },
  {
    tone: "primary",
    icon: Banknote,
    label: "Neto a pagar",
    value: formatCOP(164287000),
    caption: "Estimado del período",
  },
  {
    tone: "warning",
    icon: FileWarning,
    label: "Sin soporte",
    value: "8",
    caption: "Documentos pendientes",
  },
];

const tabs = [
  { id: "resumen", label: "Resumen" },
  { id: "nomina", label: "Nómina" },
  { id: "novedades", label: "Novedades", badge: 12 },
  { id: "turnos", label: "Turnos", badge: 8 },
  { id: "soportes", label: "Soportes", badge: 8 },
];

type PeriodStatus = "en_proceso" | "liquidado" | "cerrado";

type Period = {
  id: string;
  label: string;
  rango: string;
  estado: PeriodStatus;
  empleados: number;
  devengado: number;
  deduccion: number;
  neto: number;
};

const periods: Period[] = [
  {
    id: "jun-2026",
    label: "Junio 2026",
    rango: "01 Jun — 30 Jun",
    estado: "en_proceso",
    empleados: 228,
    devengado: 187432500,
    deduccion: 23145500,
    neto: 164287000,
  },
  {
    id: "may-2026",
    label: "Mayo 2026",
    rango: "01 May — 31 May",
    estado: "liquidado",
    empleados: 226,
    devengado: 182900000,
    deduccion: 22100000,
    neto: 160800000,
  },
  {
    id: "abr-2026",
    label: "Abril 2026",
    rango: "01 Abr — 30 Abr",
    estado: "cerrado",
    empleados: 224,
    devengado: 179500000,
    deduccion: 21700000,
    neto: 157800000,
  },
];

function periodStatusLabel(estado: PeriodStatus) {
  if (estado === "en_proceso") return "En proceso";
  if (estado === "liquidado") return "Liquidado";
  return "Cerrado";
}

function periodStatusTone(estado: PeriodStatus): Tone | "neutral" {
  if (estado === "en_proceso") return "info";
  if (estado === "liquidado") return "success";
  return "neutral";
}

type EstadoNomina = "Liquidado" | "Novedad" | "Horas extras" | "Pendiente" | "Revisión";

type PayrollRow = {
  id: string;
  name: string;
  documento: string;
  municipio: string;
  tipo: "TC" | "MT" | "OPS";
  dias: number;
  devengado: number;
  deduccion: number;
  neto: number;
  novedades: number;
  estado: EstadoNomina;
  color: string;
  initials: string;
};

const payrollRows: PayrollRow[] = [
  {
    id: "1",
    name: "María Fernanda Torres Ospina",
    documento: "CC 1.121.873.256",
    municipio: "Acacías",
    tipo: "TC",
    dias: 30,
    devengado: 1423500,
    deduccion: 142350,
    neto: 1281150,
    novedades: 0,
    estado: "Liquidado",
    color: "green",
    initials: "MT",
  },
  {
    id: "2",
    name: "Carmen Alicia Ruiz Moreno",
    documento: "CC 1.008.342.114",
    municipio: "Granada",
    tipo: "TC",
    dias: 28,
    devengado: 1389200,
    deduccion: 138920,
    neto: 1250280,
    novedades: 2,
    estado: "Novedad",
    color: "blue",
    initials: "CR",
  },
  {
    id: "3",
    name: "Rosa Elvira Jiménez Castro",
    documento: "CC 1.120.558.447",
    municipio: "Vistahermosa",
    tipo: "MT",
    dias: 30,
    devengado: 980000,
    deduccion: 98000,
    neto: 882000,
    novedades: 3,
    estado: "Horas extras",
    color: "purple",
    initials: "RJ",
  },
  {
    id: "4",
    name: "Amparo del Carmen González Leal",
    documento: "CC 1.005.771.338",
    municipio: "La Macarena",
    tipo: "OPS",
    dias: 30,
    devengado: 1650000,
    deduccion: 0,
    neto: 1650000,
    novedades: 0,
    estado: "Pendiente",
    color: "orange",
    initials: "AG",
  },
  {
    id: "5",
    name: "Luz Marina Pérez Vargas",
    documento: "CC 1.122.456.789",
    municipio: "Puerto Rico",
    tipo: "TC",
    dias: 25,
    devengado: 1186250,
    deduccion: 118625,
    neto: 1067625,
    novedades: 1,
    estado: "Revisión",
    color: "red",
    initials: "LP",
  },
  {
    id: "6",
    name: "Nohora Stella Ramírez Bernal",
    documento: "CC 1.119.002.003",
    municipio: "El Castillo",
    tipo: "MT",
    dias: 30,
    devengado: 980000,
    deduccion: 98000,
    neto: 882000,
    novedades: 0,
    estado: "Liquidado",
    color: "cyan",
    initials: "NR",
  },
  {
    id: "7",
    name: "Betty Josefina Herrera Pinto",
    documento: "CC 1.118.444.556",
    municipio: "Castilla La Nueva",
    tipo: "TC",
    dias: 30,
    devengado: 1423500,
    deduccion: 142350,
    neto: 1281150,
    novedades: 1,
    estado: "Novedad",
    color: "green",
    initials: "BH",
  },
  {
    id: "8",
    name: "Esperanza Mireya Suárez Gil",
    documento: "CC 1.123.667.889",
    municipio: "Fuente de Oro",
    tipo: "OPS",
    dias: 30,
    devengado: 1650000,
    deduccion: 0,
    neto: 1650000,
    novedades: 0,
    estado: "Liquidado",
    color: "blue",
    initials: "ES",
  },
];

function estadoNominaTone(estado: EstadoNomina): Tone | "neutral" | "purple" {
  switch (estado) {
    case "Liquidado":
      return "success";
    case "Novedad":
      return "warning";
    case "Horas extras":
      return "info";
    case "Revisión":
      return "purple";
    default:
      return "neutral";
  }
}

export default function NominaPage() {
  const [activeTab, setActiveTab] = useState("nomina");
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(periods[0].id);
  const [novedadTarget, setNovedadTarget] = useState<string | null>(null);
  const [isNovedadModalOpen, setIsNovedadModalOpen] = useState(false);

  function togglePeriod(id: string) {
    setExpandedPeriodId((current) => (current === id ? null : id));
  }

  function openNovedadModal(target: string | null) {
    setNovedadTarget(target);
    setIsNovedadModalOpen(true);
  }

  function closeNovedadModal() {
    setIsNovedadModalOpen(false);
  }

  return (
    <div className="nomina-page">
      <div className="payroll-kpis">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <div className={`payroll-kpi ${kpi.tone}`} key={kpi.label}>
              <div className="payroll-kpi-icon">
                <Icon size={20} />
              </div>

              <div className="payroll-kpi-body">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                <small>{kpi.caption}</small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="payroll-filterbar">
        <div className="payroll-filter-group">
          <FilterSelect label="Periodo" icon={CalendarRange} />
          <FilterSelect label="Contrato / Municipio / Área" icon={Building2} />

          <div className="payroll-search">
            <Search size={18} />
            <input placeholder="Buscar colaborador" />
          </div>

          <div className="payroll-search">
            <IdCard size={18} />
            <input placeholder="Buscar documento" />
          </div>

          <FilterSelect label="Estado" />
          <FilterSelect label="Tipo de vinculación" />
        </div>

        <button type="button" className="payroll-clear-button">
          Limpiar filtros
        </button>
      </div>

      <div className="payroll-actionbar">
        <button type="button" className="payroll-action primary">
          <Plus size={18} />
          Crear período
        </button>

        <button type="button" className="payroll-action primary" onClick={() => openNovedadModal(null)}>
          <FilePlus2 size={18} />
          Registrar novedad
        </button>

        <button type="button" className="payroll-action">
          <Upload size={18} />
          Cargar personal
        </button>

        <button type="button" className="payroll-action">
          <Calculator size={18} />
          Liquidar nómina
        </button>

        <button type="button" className="payroll-action">
          <Download size={18} />
          Exportar
        </button>

        <button type="button" className="payroll-action danger-outline">
          <Lock size={18} />
          Cerrar período
        </button>
      </div>

      <div className="payroll-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`payroll-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.badge ? <span className="payroll-tab-badge">{tab.badge}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === "nomina" ? (
        <>
          <div className="payroll-periods">
            {periods.map((period) => {
              const isOpen = expandedPeriodId === period.id;

              return (
                <div className={`payroll-period-card ${isOpen ? "open" : ""}`} key={period.id}>
                  <button
                    type="button"
                    className="payroll-period-summary"
                    onClick={() => togglePeriod(period.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="payroll-period-main">
                      <h3>{period.label}</h3>
                      <span className={`payroll-period-status ${periodStatusTone(period.estado)}`}>
                        {periodStatusLabel(period.estado)}
                      </span>
                    </div>

                    <div className="payroll-period-meta">
                      <span>{period.rango}</span>
                      <span>{period.empleados} empleados</span>
                    </div>

                    <div className="payroll-period-totals">
                      <div>
                        <span>Devengado</span>
                        <strong>{formatCOP(period.devengado)}</strong>
                      </div>
                      <div>
                        <span>Neto</span>
                        <strong>{formatCOP(period.neto)}</strong>
                      </div>
                    </div>

                    <span className="payroll-expand-button" aria-hidden="true">
                      <ChevronDown size={20} className={isOpen ? "rotated" : ""} />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="payroll-period-detail">
                      <div className="payroll-table-scroll">
                        <div className="payroll-table-head">
                          <span>Empleado</span>
                          <span>Municipio</span>
                          <span>Tipo</span>
                          <span>Días</span>
                          <span>Devengado</span>
                          <span>Deducción</span>
                          <span>Neto</span>
                          <span>Novedades</span>
                          <span>Estado</span>
                          <span>Acciones</span>
                        </div>

                        {payrollRows.map((row) => (
                          <div className="payroll-table-row" key={row.id}>
                            <div className="cell-employee">
                              <div className={`avatar ${row.color}`}>{row.initials}</div>
                              <div>
                                <strong>{row.name}</strong>
                                <p>{row.documento}</p>
                              </div>
                            </div>

                            <span className="cell-municipio">{row.municipio}</span>

                            <span className="payroll-type-pill">{row.tipo}</span>

                            <span className="cell-dias">{row.dias}</span>

                            <span className="cell-devengado">{formatCOP(row.devengado)}</span>

                            <span className="cell-deduccion">{formatCOP(row.deduccion)}</span>

                            <span className="cell-neto">{formatCOP(row.neto)}</span>

                            <span className="cell-novedades">{row.novedades}</span>

                            <span className={`payroll-status-badge ${estadoNominaTone(row.estado)}`}>
                              {row.estado}
                            </span>

                            <div className="cell-row-actions">
                              <button type="button" title="Ver detalle" aria-label="Ver detalle">
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                title="Registrar novedad"
                                aria-label="Registrar novedad"
                                onClick={() => openNovedadModal(row.name)}
                              >
                                <FilePlus2 size={16} />
                              </button>
                              <button type="button" title="Editar liquidación" aria-label="Editar liquidación">
                                <Edit3 size={16} />
                              </button>
                              <button type="button" title="Ver soportes" aria-label="Ver soportes">
                                <FileText size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="payroll-pagination">
            <span>Mostrando 1–25 de 228 empleados</span>

            <div>
              <select>
                <option>25 por página</option>
              </select>

              <button type="button">
                <ChevronLeft size={16} />
              </button>

              <button type="button" className="active-page">
                1
              </button>
              <button type="button">2</button>
              <button type="button">3</button>
              <button type="button">10</button>

              <button type="button">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="payroll-placeholder">
          <p>Esta pestaña se diseñará después de finalizar Nómina.</p>
        </div>
      )}

      {isNovedadModalOpen && (
        <div className="payroll-modal-overlay" onClick={closeNovedadModal}>
          <div className="payroll-modal" onClick={(event) => event.stopPropagation()}>
            <div className="payroll-modal-header">
              <div>
                <h3>Registrar novedad</h3>
                <p>{novedadTarget ? novedadTarget : "Período Junio 2026"}</p>
              </div>

              <button
                type="button"
                className="payroll-modal-close"
                onClick={closeNovedadModal}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="payroll-modal-body">
              <p>El formulario de registro de novedades se habilitará próximamente.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: ComponentType<{ size?: number }>;
}) {
  return (
    <div className="payroll-filter-select-wrap">
      {Icon && <Icon size={16} />}
      <select className="payroll-filter-select" defaultValue={label}>
        <option value={label}>{label}</option>
      </select>
      <ChevronDown size={14} />
    </div>
  );
}
