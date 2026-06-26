import { useEffect } from "react";
import { Mars, UserRound, Users, Venus } from "lucide-react";
import { useApiState } from "../../../hooks/useApiState";
import {
  getDashboardPersonas,
  getDashboardCobertura,
  getDashboardResumen,
  getDashboardAlertas,
  getDashboardNomina,
  getDashboardSST,
  normalizeCargos,
  normalizeModalidadCobertura,
} from "../../../services/dashboardApi";
import type {
  DashboardPersonasApi,
  DashboardCoberturaApi,
  DashboardResumenApi,
  DashboardAlertasApi,
  DashboardNominaApi,
  DashboardSSTApi,
} from "../../../types/dashboard.types";
import AgendaBirthdayCard from "./AgendaBirthdayCard";
import ModalityFlipCard from "./ModalityFlipCard";
import AlertasCard from "./AlertasCard";
import NominaResumenCard from "./NominaResumenCard";
import SSTResumenCard from "./SSTResumenCard";

// ── Mock sections without backend endpoints yet ───────────────────────────────
// Gender breakdown, age ranges and average age have no endpoint in /dashboard/*.
// They will be connected when the backend exposes that data.

const AGE_RANGES_MOCK = [
  { label: "18-25", value: 42 },
  { label: "26-35", value: 98 },
  { label: "36-45", value: 68 },
  { label: "46-55", value: 30 },
  { label: "56+", value: 12 },
];

const GENDER_MOCK = {
  total: 248,
  female: 135,
  male: 113,
  pctFemale: 54,
  pctMale: 46,
};

export default function PersonalTab() {
  const {
    data: personasData,
    loading: personasLoading,
    error: personasError,
    run: runPersonas,
  } = useApiState<DashboardPersonasApi>();

  const {
    data: coberturaData,
    loading: coberturaLoading,
    error: coberturaError,
    run: runCobertura,
  } = useApiState<DashboardCoberturaApi>();

  // Resumen: only data + run needed; loading/error are supplementary in AlertasCard
  const { data: resumenData, run: runResumen } = useApiState<DashboardResumenApi>();

  const {
    data: alertasData,
    loading: alertasLoading,
    error: alertasError,
    run: runAlertas,
  } = useApiState<DashboardAlertasApi>();

  const {
    data: nominaData,
    loading: nominaLoading,
    error: nominaError,
    run: runNomina,
  } = useApiState<DashboardNominaApi>();

  const {
    data: sstData,
    loading: sstLoading,
    error: sstError,
    run: runSST,
  } = useApiState<DashboardSSTApi>();

  useEffect(() => {
    void runPersonas(() => getDashboardPersonas());
    void runCobertura(() => getDashboardCobertura());
    void runResumen(() => getDashboardResumen());
    void runAlertas(() => getDashboardAlertas());
    void runNomina(() => getDashboardNomina());
    void runSST(() => getDashboardSST());
  }, [runPersonas, runCobertura, runResumen, runAlertas, runNomina, runSST]);

  const cargos = personasData ? normalizeCargos(personasData) : [];
  const maxCargo = cargos.length > 0 ? Math.max(...cargos.map((c) => c.value)) : 1;

  const backSegments = coberturaData ? normalizeModalidadCobertura(coberturaData) : [];

  return (
    <div className="personal-dashboard">

      {/* ── Row 1: KPIs ── */}
      <div className="kpi-grid main-kpis">

        <div className="dashboard-kpi kpi-brand">
          <div className="kpi-icon"><Users /></div>
          <span>Personal activo</span>
          <strong>
            {personasLoading ? "—" : (personasData?.personas_activas ?? "—")}
          </strong>
          <small>
            {personasData
              ? `${personasData.vinculaciones_activas} vínculos activos`
              : personasLoading
                ? "Cargando..."
                : (personasError ?? "TC: 220 · MT: 28")}
          </small>
        </div>

        {/* Gender KPIs remain mock until a gender-breakdown endpoint is available */}
        <div className="dashboard-kpi female">
          <div className="kpi-icon"><Venus /></div>
          <span>Mujeres</span>
          <strong>{GENDER_MOCK.female} ({GENDER_MOCK.pctFemale}%)</strong>
          <small>Colaboradoras</small>
        </div>

        <div className="dashboard-kpi male">
          <div className="kpi-icon"><Mars /></div>
          <span>Hombres</span>
          <strong>{GENDER_MOCK.male} ({GENDER_MOCK.pctMale}%)</strong>
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
          <strong>
            {personasLoading ? "—" : (personasData?.retiros_periodo ?? "—")}
          </strong>
          <small>Mes actual</small>
        </div>

      </div>

      {/* ── Row 2: Analysis — Age · Gender · Agenda/Birthday ── */}
      <div className="dashboard-row analysis-row">

        {/* Age distribution — mock until endpoint available */}
        <div className="dashboard-panel age-panel">
          <div className="panel-title">
            <h3>Distribución por rangos de edad</h3>
            <span className="panel-chip">Junio 2026</span>
          </div>
          <div className="bar-chart">
            {AGE_RANGES_MOCK.map((item) => (
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

        {/* Gender donut — mock until endpoint available */}
        <div className="dashboard-panel gender-panel">
          <div className="panel-title">
            <h3>Distribución por género</h3>
          </div>
          <div className="donut-wrapper">
            <div className="donut-chart">
              <div>
                <strong>{GENDER_MOCK.total}</strong>
                <span>Total</span>
              </div>
            </div>
            <div className="legend gender-legend">
              <span>
                <i className="dot female-dot" /> Mujeres {GENDER_MOCK.female} ({GENDER_MOCK.pctFemale}%)
              </span>
              <span>
                <i className="dot male-dot" /> Hombres {GENDER_MOCK.male} ({GENDER_MOCK.pctMale}%)
              </span>
            </div>
          </div>
        </div>

        {/* Agenda / Birthday — mock until endpoints available */}
        <AgendaBirthdayCard />

      </div>

      {/* ── Row 3: Cargos · Modalidad flip ── */}
      <div className="dashboard-row bottom-row">

        {/* Role distribution — real from /dashboard/personas */}
        <div className="dashboard-panel">
          <div className="panel-title">
            <h3>Distribución por Cargos</h3>
            <span className="panel-chip">
              {personasData
                ? `${personasData.total_personas} colaboradores`
                : personasLoading
                  ? "Cargando..."
                  : "—"}
            </span>
          </div>

          {personasLoading ? (
            <div
              className="hbar-list card-scroll"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>
                Cargando datos...
              </span>
            </div>
          ) : personasError ? (
            <div
              className="hbar-list card-scroll"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span
                style={{
                  color: "var(--color-danger, #ef4444)",
                  fontSize: "0.75rem",
                  textAlign: "center",
                }}
              >
                {personasError}
              </span>
            </div>
          ) : cargos.length === 0 ? (
            <div
              className="hbar-list card-scroll"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>
                Sin cargos disponibles
              </span>
            </div>
          ) : (
            <div className="hbar-list card-scroll">
              {cargos.map((item) => (
                <div className="hbar-item" key={item.id}>
                  <span className="hbar-label">{item.label}</span>
                  <div className="hbar-track">
                    <div
                      className="hbar-fill"
                      style={{ width: `${(item.value / maxCargo) * 100}%` }}
                    />
                  </div>
                  <span className="hbar-count">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modality flip card — back face real from /dashboard/cobertura */}
        <ModalityFlipCard
          backSegments={backSegments}
          backLoading={coberturaLoading}
          backError={coberturaError}
        />

      </div>

      {/* ── Row 4: Alertas · Nómina · SST — real from backend ── */}
      <div className="dashboard-row summary-row">

        <AlertasCard
          alertasData={alertasData}
          resumenData={resumenData}
          alertasLoading={alertasLoading}
          alertasError={alertasError}
        />

        <NominaResumenCard
          data={nominaData}
          loading={nominaLoading}
          error={nominaError}
        />

        <SSTResumenCard
          data={sstData}
          loading={sstLoading}
          error={sstError}
        />

      </div>

    </div>
  );
}
