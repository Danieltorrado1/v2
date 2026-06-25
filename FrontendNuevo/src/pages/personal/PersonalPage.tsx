import { useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  History,
  IdCard,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import "./PersonalPage.css";

type Employee = {
  initials: string;
  name: string;
  cc: string;
  cargo: string;
  municipio: string;
  institucion: string;
  estado: string;
  alertas: string;
  color: string;
  ingreso: string;
  retiro?: string;
  documentacion: number;
};

const employees: Employee[] = [
  {
    initials: "MT",
    name: "María Fernanda Torres Ospina",
    cc: "CC 1.121.873.256",
    cargo: "Manipulador",
    municipio: "Acacías",
    institucion: "IE Simón Bolívar",
    estado: "ACTIVO",
    alertas: "1 alerta",
    color: "green",
    ingreso: "12 Ene 2024",
    documentacion: 95,
  },
  {
    initials: "CR",
    name: "Carmen Alicia Ruiz Moreno",
    cc: "CC 1.008.342.114",
    cargo: "Manipulador",
    municipio: "Granada",
    institucion: "IE Jorge Eliecer Gaitán",
    estado: "ACTIVO",
    alertas: "2 alertas",
    color: "blue",
    ingreso: "03 Feb 2026",
    documentacion: 83,
  },
  {
    initials: "RJ",
    name: "Rosa Elvira Jiménez Castro",
    cc: "CC 1.120.558.447",
    cargo: "Manipulador",
    municipio: "Vistahermosa",
    institucion: "IE Hernando Turbay",
    estado: "ACTIVO",
    alertas: "2 alertas",
    color: "purple",
    ingreso: "20 Ago 2023",
    documentacion: 100,
  },
  {
    initials: "AG",
    name: "Amparo del Carmen González Leal",
    cc: "CC 1.005.771.338",
    cargo: "Manipulador",
    municipio: "La Macarena",
    institucion: "IE La Macarena Centro",
    estado: "RETIRADO",
    alertas: "Sin alertas",
    color: "orange",
    ingreso: "15 Mar 2021",
    retiro: "30 Abr 2026",
    documentacion: 100,
  },
  {
    initials: "LP",
    name: "Luz Marina Pérez Vargas",
    cc: "CC 1.122.456.789",
    cargo: "Manipulador",
    municipio: "Puerto Rico",
    institucion: "IE Santa Inés",
    estado: "ACTIVO",
    alertas: "1 alerta",
    color: "red",
    ingreso: "05 May 2025",
    documentacion: 64,
  },
  {
    initials: "NR",
    name: "Nohora Stella Ramírez Bernal",
    cc: "CC 1.119.002.003",
    cargo: "Manipulador",
    municipio: "El Castillo",
    institucion: "IE El Castillo",
    estado: "ACTIVO",
    alertas: "Sin alertas",
    color: "cyan",
    ingreso: "18 Oct 2022",
    documentacion: 100,
  },
  {
    initials: "BH",
    name: "Betty Josefina Herrera Pinto",
    cc: "CC 1.118.444.556",
    cargo: "Manipulador",
    municipio: "Castilla La Nueva",
    institucion: "IE Nuestra Señora del Carmen",
    estado: "RETIRADO",
    alertas: "1 alerta",
    color: "green",
    ingreso: "01 Jun 2020",
    retiro: "10 Jun 2026",
    documentacion: 90,
  },
  {
    initials: "ES",
    name: "Esperanza Mireya Suárez Gil",
    cc: "CC 1.123.667.889",
    cargo: "Manipulador",
    municipio: "Fuente de Oro",
    institucion: "IE Marco Fidel Suárez",
    estado: "ACTIVO",
    alertas: "1 alerta",
    color: "blue",
    ingreso: "22 Sep 2024",
    documentacion: 78,
  },
];

function documentationLevel(pct: number) {
  if (pct >= 90) return "high";
  if (pct >= 70) return "medium";
  return "low";
}

const toolbarFilters = [
  "Todos",
  "Cargo",
  "Documentación",
  "Municipio",
  "Gestor de Zona",
  "Institución",
  "Sede",
  "Modalidad",
  "Ordenar por...",
];

export default function PersonalPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  return (
    <div className="personal-module">
      <div className="personal-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-actions">
            <button type="button" className="toolbar-button primary">
              <Plus size={18} />
              Nuevo empleado
            </button>

            <button type="button" className="toolbar-button">
              <Upload size={18} />
              Importar Excel
            </button>

            <button type="button" className="toolbar-button">
              <RefreshCw size={18} />
              Actualizar por Excel
            </button>

            <button type="button" className="toolbar-button">
              <Download size={18} />
              Exportar
            </button>
          </div>

          <div className="toolbar-search">
            <Search size={18} />
            <input placeholder="Buscar por nombre, documento o cargo" />
          </div>
        </div>

        <div className="toolbar-row">
          <div className="toolbar-filters">
            {toolbarFilters.map((label) => (
              <div className="toolbar-select-wrap" key={label}>
                <select className="toolbar-select" defaultValue={label}>
                  <option value={label}>{label}</option>
                </select>
                <ChevronDown size={14} />
              </div>
            ))}

            <button type="button" className="toolbar-clear">
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <section className={`personal-page ${selectedEmployee ? "split-view" : "list-view"}`}>
        <aside className="people-panel">
          <div className="people-header">
            <div>
              <span>Personal</span>
              <h1>Colaboradores</h1>
              <p>704 registros</p>
            </div>
          </div>

          {selectedEmployee ? (
            <div className="people-list">
              {employees.map((employee) => (
                <button
                  key={employee.cc}
                  type="button"
                  onClick={() => setSelectedEmployee(employee)}
                  className={`employee-row ${selectedEmployee.cc === employee.cc ? "selected" : ""}`}
                >
                  <div className={`avatar ${employee.color}`}>{employee.initials}</div>

                  <div className="employee-info">
                    <div className="employee-name-line">
                      <strong>{employee.name}</strong>
                      <span className={employee.estado === "ACTIVO" ? "status active" : "status retired"}>
                        {employee.estado}
                      </span>
                    </div>

                    <p>
                      {employee.cc} · {employee.cargo}
                    </p>

                    <small>
                      {employee.municipio} · {employee.institucion}
                    </small>
                  </div>

                  <div className={employee.alertas === "Sin alertas" ? "alert ok" : "alert warning"}>
                    {employee.alertas}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="people-table">
              <div className="table-head">
                <span>Empleado</span>
                <span>Municipio / Institución</span>
                <span>Ingreso / Retiro</span>
                <span>Documentación</span>
                <span>Alertas</span>
                <span>Acción</span>
              </div>

              <div className="table-body">
                {employees.map((employee) => (
                  <div
                    key={employee.cc}
                    className="table-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEmployee(employee)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSelectedEmployee(employee);
                    }}
                  >
                    <div className="cell-employee">
                      <div className={`avatar ${employee.color}`}>{employee.initials}</div>

                      <div className="employee-info">
                        <div className="employee-name-line">
                          <strong>{employee.name}</strong>
                          <span className={employee.estado === "ACTIVO" ? "status active" : "status retired"}>
                            {employee.estado}
                          </span>
                        </div>

                        <p>
                          {employee.cc} · {employee.cargo}
                        </p>
                      </div>
                    </div>

                    <div className="cell-meta">
                      <strong>{employee.municipio}</strong>
                      <span>{employee.institucion}</span>
                    </div>

                    <div className="cell-date">
                      <span>{employee.estado === "ACTIVO" ? "Ingreso" : "Retiro"}</span>
                      <strong>{employee.estado === "ACTIVO" ? employee.ingreso : employee.retiro}</strong>
                    </div>

                    <div className={`cell-doc ${documentationLevel(employee.documentacion)}`}>
                      {employee.documentacion}%
                    </div>

                    <div className={employee.alertas === "Sin alertas" ? "alert ok" : "alert warning"}>
                      {employee.alertas}
                    </div>

                    <div className="cell-action">
                      Ver <ChevronRight size={14} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="people-pagination">
            <span>Mostrando 1 a {employees.length} de 704</span>

            <div>
              <select>
                <option>25 por página</option>
              </select>

              <button>
                <ChevronLeft size={16} />
              </button>

              <button className="active-page">1</button>
              <button>2</button>
              <button>3</button>
              <button>29</button>

              <button>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </aside>

        {selectedEmployee && (
          <main className="employee-profile">
            <QuickEmployeeView
              key={selectedEmployee.cc}
              employee={selectedEmployee}
              onClose={() => setSelectedEmployee(null)}
            />
          </main>
        )}
      </section>
    </div>
  );
}

function QuickEmployeeView({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  return (
    <div className="quick-employee-view">
      <div className="profile-actions">
        <span className="profile-view-label">Vista rápida del colaborador</span>

        <div className="profile-actions-buttons">
          <button>
            <Edit3 size={17} />
            Editar
          </button>

          <button>
            <MoreHorizontal size={18} />
            Más acciones
            <ChevronDown size={15} />
          </button>

          <button>
            <FileText size={17} />
          </button>

          <button
            type="button"
            className="profile-close-button"
            onClick={onClose}
            aria-label="Cerrar vista rápida"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <section className="profile-hero">
        <div className="photo-wrap">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&crop=face"
            alt={employee.name}
          />
          <span />
        </div>

        <div className="hero-main">
          <h2>{employee.name}</h2>
          <p>{employee.cargo}</p>

          <div className="hero-subtitle">
            <span>{employee.institucion}</span>
            <i />
            <span>PAE Meta</span>
            <b className={employee.estado === "ACTIVO" ? "" : "retired"}>
              {employee.estado}
            </b>
          </div>

          <div className="hero-chips">
            <div>
              <MapPin size={17} />
              {employee.municipio}
            </div>
            <div>
              <FileText size={17} />
              Contrato fijo
            </div>
            <div>
              <UserRound size={17} />
              {employee.cargo}
            </div>
            <div>
              <CalendarDays size={17} />
              {employee.estado === "ACTIVO"
                ? `Ingreso: ${employee.ingreso}`
                : `Retiro: ${employee.retiro}`}
            </div>
          </div>
        </div>
      </section>

      <section className="profile-grid three">
        <InfoCard
          icon={<IdCard size={18} />}
          title="Información personal"
          rows={[
            ["Documento", employee.cc],
            ["Fecha de nacimiento", "19 Feb 1988"],
            ["Edad", "36 años"],
            ["Sexo", "Femenino"],
            ["Estado civil", "Soltera"],
            ["Grupo sanguíneo", "O+"],
            ["Nacionalidad", "Colombiana"],
          ]}
        />

        <InfoCard
          icon={<BriefcaseBusiness size={18} />}
          title="Información laboral"
          rows={[
            ["Empresa", "PAE Meta"],
            ["Contrato", "Fijo"],
            ["Cargo", employee.cargo],
            ["Institución", employee.institucion],
            ["Sede", "Principal"],
            ["Modalidad", "Almuerzo y refrigerio"],
            ["Municipio", employee.municipio],
          ]}
        />

        <InfoCard
          icon={<ShieldCheck size={18} />}
          title="Afiliaciones"
          rows={[
            ["EPS", "Nueva EPS"],
            ["AFP", "Porvenir"],
            ["ARL", "Positiva"],
            ["Caja de compensación", "Compensar"],
            ["Cesantías", "Porvenir"],
          ]}
        />
      </section>

      <section className="profile-grid bottom">
        <div className="profile-card history-card">
          <div className="card-title">
            <History size={18} />
            <h3>Historial reciente</h3>
          </div>

          <div className="timeline">
            <TimelineItem
              date="03 Feb 2026"
              title="Ingreso"
              detail="Ingreso como Manipulador de alimentos"
              author="Laura V."
            />
            <TimelineItem
              date="15 Ene 2026"
              title="Cambio de EPS"
              detail="De Sanitas EPS a Nueva EPS"
              author="Laura V."
            />
            <TimelineItem
              date="10 Mar 2025"
              title="Cambio de cargo"
              detail="De Auxiliar de cocina a Manipulador de alimentos"
              author="Laura V."
            />
            <TimelineItem
              date="20 Nov 2024"
              title="Cambio de sede"
              detail="De Sede Norte a Principal"
              author="Laura V."
            />
          </div>

          <button className="link-button">
            Ver todo el historial <ChevronRight size={16} />
          </button>
        </div>

        <div className="profile-card status-card">
          <div className="card-title">
            <Bell size={18} />
            <h3>Estado general</h3>
          </div>

          <div className="status-content">
            <div
              className="progress-ring"
              style={{
                background: `conic-gradient(var(--color-success) 0 ${employee.documentacion}%, var(--border-color) ${employee.documentacion}% 100%)`,
              }}
            >
              <div>
                <strong>{employee.documentacion}%</strong>
              </div>
            </div>

            <p>Documentación</p>
            <span>
              {employee.documentacion >= 90
                ? "Completa"
                : employee.documentacion >= 70
                  ? "En proceso"
                  : "Incompleta"}
            </span>
          </div>

          <div className="status-summary">
            <button>
              <span className="status-icon warning">!</span>
              <strong>2</strong>
              Alertas activas
              <ChevronRight size={15} />
            </button>

            <button>
              <span className="status-icon info">i</span>
              <strong>1</strong>
              Novedad en curso
              <ChevronRight size={15} />
            </button>

            <button>
              <span className="status-icon success">✓</span>
              Sin novedades críticas
              <ChevronRight size={15} />
            </button>
          </div>

          <button className="repository-button">
            Ir al Repositorio documental <ChevronRight size={17} />
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string][];
}) {
  return (
    <div className="profile-card info-card">
      <div className="card-title">
        {icon}
        <h3>{title}</h3>
      </div>

      <div className="info-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineItem({
  date,
  title,
  detail,
  author,
}: {
  date: string;
  title: string;
  detail: string;
  author: string;
}) {
  return (
    <div className="timeline-item">
      <div className="timeline-dot" />
      <span>{date}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      <small>{author}</small>
    </div>
  );
}