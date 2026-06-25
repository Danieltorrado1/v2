import { Mars, UserRound, Users, Venus } from "lucide-react";
import AgendaBirthdayCard from "./AgendaBirthdayCard";
import ModalityFlipCard from "./ModalityFlipCard";

const ageRanges = [
  { label: "18-25", value: 42 },
  { label: "26-35", value: 98 },
  { label: "36-45", value: 68 },
  { label: "46-55", value: 30 },
  { label: "56+", value: 12 },
];

const roleData = [
  { label: "Manipulador de Alimentos", value: 98 },
  { label: "Enfermero/a", value: 32 },
  { label: "Aux. Administrativo", value: 28 },
  { label: "Nutricionista", value: 24 },
  { label: "Supervisor", value: 22 },
  { label: "Conductor", value: 18 },
  { label: "Profesional SST", value: 14 },
  { label: "Coordinador", value: 12 },
];

const maxRole = Math.max(...roleData.map((r) => r.value));

export default function PersonalTab() {
  return (
    <div className="personal-dashboard">

      {/* ── Row 1: KPIs ── */}
      <div className="kpi-grid main-kpis">
        <div className="dashboard-kpi kpi-brand">
          <div className="kpi-icon"><Users /></div>
          <span>Personal activo</span>
          <strong>248</strong>
          <small>TC: 220 · MT: 28</small>
        </div>

        <div className="dashboard-kpi female">
          <div className="kpi-icon"><Venus /></div>
          <span>Mujeres</span>
          <strong>135 (54%)</strong>
          <small>Colaboradoras</small>
        </div>

        <div className="dashboard-kpi male">
          <div className="kpi-icon"><Mars /></div>
          <span>Hombres</span>
          <strong>113 (46%)</strong>
          <small>Colaboradores</small>
        </div>

        <div className="dashboard-kpi neutral">
          <div className="kpi-icon"><UserRound /></div>
          <span>Edad promedio</span>
          <strong>34 años</strong>
          <small>Promedio general</small>
        </div>

        <div className="dashboard-kpi danger">
          <div className="kpi-icon"><Users /></div>
          <span>Retirados</span>
          <strong>12</strong>
          <small>Mes actual</small>
        </div>
      </div>

      {/* ── Row 2: Analysis — Age · Gender · Agenda/Birthday ── */}
      <div className="dashboard-row analysis-row">

        {/* Age distribution */}
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

        {/* Gender donut */}
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
              <span><i className="dot female-dot" /> Mujeres 135 (54%)</span>
              <span><i className="dot male-dot" /> Hombres 113 (46%)</span>
            </div>
          </div>
        </div>

        {/* Agenda / Birthday tabbed card */}
        <AgendaBirthdayCard />
      </div>

      {/* ── Row 3: Cargos · Modalidad flip ── */}
      <div className="dashboard-row bottom-row">

        {/* Role distribution — horizontal bars */}
        <div className="dashboard-panel">
          <div className="panel-title">
            <h3>Distribución por Cargos</h3>
            <span className="panel-chip">248 colaboradores</span>
          </div>
          <div className="hbar-list card-scroll">
            {roleData.map((item) => (
              <div className="hbar-item" key={item.label}>
                <span className="hbar-label">{item.label}</span>
                <div className="hbar-track">
                  <div
                    className="hbar-fill"
                    style={{ width: `${(item.value / maxRole) * 100}%` }}
                  />
                </div>
                <span className="hbar-count">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modality flip card */}
        <ModalityFlipCard />
      </div>

    </div>
  );
}
