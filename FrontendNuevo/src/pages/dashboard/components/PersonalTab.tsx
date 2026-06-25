import {
  CalendarDays,
  Cake,
  Mars,
  UserCheck,
  UserRound,
  Users,
  Venus,
} from "lucide-react";

const ageRanges = [
  { label: "18-25", value: 42 },
  { label: "26-35", value: 98 },
  { label: "36-45", value: 68 },
  { label: "46-55", value: 30 },
  { label: "56+", value: 12 },
];

const birthdays = [
  {
    date: "HOY",
    name: "María López",
    role: "Manipuladora de Alimentos",
    location: "Hospital Granada",
  },
  {
    date: "MAÑANA",
    name: "Carlos Pérez",
    role: "Auxiliar SST",
    location: "Hospital Granada",
  },
  {
    date: "24 JUN",
    name: "Andrea Ruiz",
    role: "Enfermera",
    location: "Hospital Granada",
  },
  {
    date: "27 JUN",
    name: "Jorge Mejía",
    role: "Conductor",
    location: "Hospital Granada",
  },
];

const events = [
  {
    day: "25",
    month: "JUN",
    title: "Capacitación SST",
    time: "08:00 AM · Auditorio principal",
    icon: UserCheck,
    status: "info",
  },
  {
    day: "28",
    month: "JUN",
    title: "Cierre nómina quincenal",
    time: "Todo el día · Área de Nómina",
    icon: CalendarDays,
    status: "brand",
  },
  {
    day: "29",
    month: "JUN",
    title: "Entrega de dotación",
    time: "09:00 AM · Bodega central",
    icon: Users,
    status: "warning",
  },
  {
    day: "01",
    month: "JUL",
    title: "Inducción personal nuevo",
    time: "08:00 AM · Sala de capacitación",
    icon: Users,
    status: "success",
  },
];

export default function PersonalTab() {
  return (
    <div className="personal-dashboard">
      <div className="kpi-grid main-kpis">
        <div className="dashboard-kpi kpi-brand">
          <div className="kpi-icon">
            <Users />
          </div>
          <span>Personal activo</span>
          <strong>248</strong>
          <small>TC: 220 · MT: 28</small>
        </div>

        <div className="dashboard-kpi female">
          <div className="kpi-icon">
            <Venus />
          </div>
          <span>Mujeres</span>
          <strong>135 (54%)</strong>
          <small>Colaboradoras</small>
        </div>

        <div className="dashboard-kpi male">
          <div className="kpi-icon">
            <Mars />
          </div>
          <span>Hombres</span>
          <strong>113 (46%)</strong>
          <small>Colaboradores</small>
        </div>

        <div className="dashboard-kpi neutral">
          <div className="kpi-icon">
            <UserRound />
          </div>
          <span>Edad promedio</span>
          <strong>34 años</strong>
          <small>Promedio general</small>
        </div>

        <div className="dashboard-kpi danger">
          <div className="kpi-icon">
            <Users />
          </div>
          <span>Retirados</span>
          <strong>12</strong>
          <small>Mes actual</small>
        </div>
      </div>

      <div className="dashboard-row analysis-row">
        <div className="dashboard-panel age-panel">
          <div className="panel-title">
            <h3>Distribución por rangos de edad</h3>
            <span className="panel-chip">Junio 2026</span>
          </div>

          <div className="bar-chart">
            {ageRanges.map((item) => (
              <div className="bar-item" key={item.label}>
                <strong>{item.value}</strong>
                <div className="bar-track">
                  <div className="bar" style={{ height: `${item.value}%` }} />
                </div>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-panel gender-panel">
          <div className="panel-title">
            <h3>Distribución por género</h3>
          </div>

          <div className="donut-wrapper">
            <div className="donut-chart">
              <div>
                <strong>248</strong>
                <span>Total</span>
              </div>
            </div>

            <div className="legend gender-legend">
              <span>
                <i className="dot female-dot" /> Mujeres 135 (54%)
              </span>
              <span>
                <i className="dot male-dot" /> Hombres 113 (46%)
              </span>
            </div>
          </div>
        </div>

        <div className="dashboard-panel birthdays-panel">
          <div className="panel-title">
            <h3>Cumpleaños próximos</h3>
            <button type="button" className="panel-action">
              Ver todos
            </button>
          </div>

          <div className="card-scroll">
            {birthdays.map((item) => (
              <div className="birthday-item" key={`${item.name}-${item.date}`}>
                <div className="date-pill neutral">{item.date}</div>

                <div className="birthday-info">
                  <strong>{item.name}</strong>
                  <span>{item.role}</span>
                </div>

                <div className="birthday-location">
                  <Cake size={13} />
                  <span>{item.location}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-panel events-panel">
        <div className="panel-title">
          <h3>Agenda de eventos</h3>
          <button type="button" className="panel-action">
            Ver todos
          </button>
        </div>

        <div className="events-grid">
          {events.map((item) => {
            const Icon = item.icon;

            return (
              <div className="event-card" key={`${item.title}-${item.day}`}>
                <div className="event-date">
                  <strong>{item.day}</strong>
                  <span>{item.month}</span>
                </div>

                <div className="event-info">
                  <strong>{item.title}</strong>
                  <span>{item.time}</span>
                </div>

                <div className={`event-icon ${item.status}`}>
                  <Icon size={18} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}