import { useState } from "react";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Cake,
  CalendarDays,
  Users,
} from "lucide-react";

type Tone = "primary" | "info" | "warning" | "danger" | "success";
type AgendaType = "capacitacion" | "reunion" | "recordatorio" | "vencimiento" | "evento";

const AGENDA_ICONS: Record<AgendaType, ComponentType<{ size?: number }>> = {
  capacitacion: BookOpen,
  reunion: Users,
  recordatorio: Bell,
  vencimiento: AlertTriangle,
  evento: CalendarDays,
};

type AgendaItem = {
  id: string;
  type: AgendaType;
  tone: Tone;
  time: string;
  title: string;
  detail: string;
};

const agendaItems: AgendaItem[] = [
  {
    id: "1",
    type: "vencimiento",
    tone: "danger",
    time: "Hoy · 09:00",
    title: "Vencimiento examen médico",
    detail: "María López — Revisión pendiente",
  },
  {
    id: "2",
    type: "capacitacion",
    tone: "primary",
    time: "Hoy · 10:00",
    title: "Capacitación SST Junio",
    detail: "Auditorio principal · 32 asistentes",
  },
  {
    id: "3",
    type: "reunion",
    tone: "info",
    time: "Hoy · 15:00",
    title: "Reunión de coordinación",
    detail: "Sala virtual · Equipos regionales",
  },
  {
    id: "4",
    type: "recordatorio",
    tone: "warning",
    time: "Mañana",
    title: "Cierre nómina quincenal",
    detail: "Área de Nómina · Período Jun 2026",
  },
  {
    id: "5",
    type: "evento",
    tone: "success",
    time: "28 Jun",
    title: "Entrega de dotación",
    detail: "Bodega central · 248 colaboradores",
  },
  {
    id: "6",
    type: "vencimiento",
    tone: "danger",
    time: "29 Jun",
    title: "Vencimiento contratos OPS",
    detail: "3 contratos por renovar",
  },
  {
    id: "7",
    type: "evento",
    tone: "success",
    time: "01 Jul",
    title: "Inducción personal nuevo",
    detail: "Sala de capacitación · 08:00 AM",
  },
];

type BdayColor = "teal" | "blue" | "purple" | "orange" | "red" | "green";

type BirthdayItem = {
  name: string;
  role: string;
  company: string;
  date: string;
  color: BdayColor;
  initials: string;
};

const birthdayItems: BirthdayItem[] = [
  {
    name: "María Fernanda López García",
    role: "Manipuladora de Alimentos",
    company: "ESE Granada",
    date: "HOY",
    color: "teal",
    initials: "ML",
  },
  {
    name: "Carlos Alberto Pérez Moreno",
    role: "Auxiliar SST",
    company: "Hospital Acacías",
    date: "MAÑANA",
    color: "blue",
    initials: "CP",
  },
  {
    name: "Andrea Lucía Ruiz Vargas",
    role: "Enfermera",
    company: "ESE Vistahermosa",
    date: "24 JUN",
    color: "purple",
    initials: "AR",
  },
  {
    name: "Jorge Hernán Mejía Castro",
    role: "Conductor",
    company: "ESE La Macarena",
    date: "27 JUN",
    color: "orange",
    initials: "JM",
  },
  {
    name: "Diana Paola Herrera Leal",
    role: "Nutricionista",
    company: "Hosp. Granada",
    date: "30 JUN",
    color: "red",
    initials: "DH",
  },
  {
    name: "Roberto Andrés Silva Pinto",
    role: "Profesional SST",
    company: "ESE Castilla La Nueva",
    date: "02 JUL",
    color: "green",
    initials: "RS",
  },
];

function dateTone(date: string): string {
  if (date === "HOY") return "success";
  if (date === "MAÑANA") return "warning";
  return "neutral";
}

type Tab = "agenda" | "cumpleanos";

export default function AgendaBirthdayCard() {
  const [tab, setTab] = useState<Tab>("agenda");

  return (
    <div className="dashboard-panel agenda-card">
      <div className="card-tab-bar">
        <button
          type="button"
          className={`card-tab ${tab === "agenda" ? "active" : ""}`}
          onClick={() => setTab("agenda")}
        >
          <CalendarDays size={13} />
          Agenda
        </button>
        <button
          type="button"
          className={`card-tab ${tab === "cumpleanos" ? "active" : ""}`}
          onClick={() => setTab("cumpleanos")}
        >
          <Cake size={13} />
          Cumpleaños
        </button>
      </div>

      {tab === "agenda" ? (
        <div key="agenda" className="card-scroll tab-content-enter">
          {agendaItems.map((item) => {
            const Icon = AGENDA_ICONS[item.type];
            return (
              <div key={item.id} className={`agenda-item tone-${item.tone}`}>
                <div className={`agenda-icon-wrap tone-${item.tone}`}>
                  <Icon size={13} />
                </div>
                <div className="agenda-body">
                  <span className="agenda-title">{item.title}</span>
                  <span className="agenda-detail">{item.detail}</span>
                </div>
                <span className={`agenda-time-badge tone-${item.tone}`}>{item.time}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div key="cumpleanos" className="card-scroll tab-content-enter">
          {birthdayItems.map((item) => (
            <div key={item.name} className="bday-item">
              <div className={`bday-avatar color-${item.color}`}>{item.initials}</div>
              <div className="bday-body">
                <strong>{item.name}</strong>
                <span>{item.role}</span>
                <small>{item.company}</small>
              </div>
              <div className={`date-pill ${dateTone(item.date)}`}>{item.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
