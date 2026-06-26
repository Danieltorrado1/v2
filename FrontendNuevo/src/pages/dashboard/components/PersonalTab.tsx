import { useEffect } from "react";
import { UserRound, Users, User, UserMinus } from "lucide-react";
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
  DashboardFilters,
} from "../../../types/dashboard.types";
import AgendaBirthdayCard from "./AgendaBirthdayCard";
import ModalityFlipCard from "./ModalityFlipCard";
import AlertasCard from "./AlertasCard";
import NominaResumenCard from "./NominaResumenCard";
import SSTResumenCard from "./SSTResumenCard";

interface PersonalTabProps {
  filters: DashboardFilters;
}

const buildGenderGradient = (femenino: number, total: number): string => {
  if (total === 0) return "conic-gradient(var(--border-color) 0deg 360deg)";
  const pct = (femenino / total) * 100;
  return `conic-gradient(var(--color-primary) 0 ${pct.toFixed(1)}%, var(--color-neutral) ${pct.toFixed(1)}% 100%)`;
};

export default function PersonalTab({ filters }: PersonalTabProps) {
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

  const {
    data: resumenData,
    run: runResumen,
  } = useApiState<DashboardResumenApi>();

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

  const { empresa_id, contrato_id, fecha_desde, fecha_hasta } = filters;

  useEffect(() => {
    const f = { empresa_id, contrato_id, fecha_desde, fecha_hasta };
    void runPersonas(() => getDashboardPersonas(f));
    void runCobertura(() => getDashboardCobertura(f));
    void runResumen(() => getDashboardResumen(f));
    void runAlertas(() => getDashboardAlertas(f));
    void runNomina(() => getDashboardNomina(f));
    void runSST(() => getDashboardSST(f));
  }, [runPersonas, runCobertura, runResumen, runAlertas, runNomina, runSST,
      empresa_id, contrato_id, fecha_desde, fecha_hasta]);

  const cargos = personasData ? normalizeCargos(personasData) : [];
  const maxCargo = cargos.length > 0 ? Math.max(...cargos.map((c) => c.value)) : 1;
  const backSegments = coberturaData ? normalizeModalidadCobertura(coberturaData) : [];

  const genero = personasData?.genero;
  const edad = personasData?.edad;
  const cumpleanos = personasData?.cumpleanos ?? [];

  const edadRangos = edad?.rangos ?? [];
  const maxRango = edadRangos.length > 0 ? Math.max(...edadRangos.map((r) => r.cantidad), 1) : 1;

  const genderGradient = genero
    ? buildGenderGradient(genero.femenino, genero.total)
    : "conic-gradient(var(--border-color) 0deg 360deg)";

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
              : personasLoading ? "Cargando..." : (personasError ?? "Sin datos")}
          </small>
        </div>

        <div className="dashboard-kpi female">
          <div className="kpi-icon"><Users /></div>
          <span>Mujeres</span>
          <strong>
            {personasLoading ? "—" : (genero != null ? genero.femenino : "—")}
          </strong>
          <small>
            {personasLoading
              ? "Cargando..."
              : genero != null
                ? `${genero.porcentaje_femenino}% del total`
                : (personasError ?? "Sin datos")}
          </small>
        </div>

        <div className="dashboard-kpi male">
          <div className="kpi-icon"><User /></div>
          <span>Hombres</span>
          <strong>
            {personasLoading ? "—" : (genero != null ? genero.masculino : "—")}
          </strong>
          <small>
            {personasLoading
              ? "Cargando..."
              : genero != null
                ? `${genero.porcentaje_masculino}% del total`
                : (personasError ?? "Sin datos")}
          </small>
        </div>

        <div className="dashboard-kpi neutral">
          <div className="kpi-icon"><UserRound /></div>
          <span>Edad promedio</span>
          <strong>
            {personasLoading
              ? "—"
              : edad?.promedio != null
                ? `${edad.promedio}`
                : "—"}
          </strong>
          <small>
            {personasLoading
              ? "Cargando..."
              : edad?.promedio != null
                ? "años (activos)"
                : personasError ?? "Sin fecha de nacimiento"}
          </small>
        </div>

        <div className="dashboard-kpi danger">
          <div className="kpi-icon"><UserMinus /></div>
          <span>Retirados</span>
          <strong>
            {personasLoading ? "—" : (personasData?.retiros_periodo ?? "—")}
          </strong>
          <small>
            {personasLoading ? "Cargando..." : personasData ? "Últimos 30 días" : (personasError ?? "Sin datos")}
          </small>
        </div>

      </div>

      {/* ── Row 2: Edad · Género · Agenda ── */}
      <div className="dashboard-row analysis-row">

        {/* Distribución por Edad */}
        <div className="dashboard-panel age-panel">
          <div className="panel-title">
            <h3>Distribución por Edad</h3>
            {edad?.promedio != null && (
              <span className="panel-chip">Prom. {edad.promedio} años</span>
            )}
          </div>

          {personasLoading ? (
            <div className="bar-chart" style={{ alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>Cargando...</span>
            </div>
          ) : personasError ? (
            <div className="bar-chart" style={{ alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--color-danger)", fontSize: "0.75rem", textAlign: "center" }}>
                {personasError}
              </span>
            </div>
          ) : edadRangos.every((r) => r.cantidad === 0) ? (
            <div className="bar-chart" style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 6 }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
                Sin información disponible
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.7rem", opacity: 0.7 }}>
                No hay fechas de nacimiento registradas
              </span>
            </div>
          ) : (
            <div className="bar-chart">
              {edadRangos.map((item) => (
                <div className="bar-item" key={item.rango}>
                  <strong>{item.cantidad}</strong>
                  <div className="bar-track">
                    <div className="bar" style={{ height: `${(item.cantidad / maxRango) * 100}%` }} />
                  </div>
                  <span>{item.rango}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Distribución por Género */}
        <div className="dashboard-panel gender-panel">
          <div className="panel-title">
            <h3>Distribución por Género</h3>
            {genero && genero.total > 0 && (
              <span className="panel-chip">{genero.total} personas</span>
            )}
          </div>

          {personasLoading ? (
            <div className="donut-wrapper">
              <div className="donut-chart" style={{ background: "conic-gradient(var(--border-color) 0deg 360deg)" }}>
                <div><strong>—</strong><span>cargando</span></div>
              </div>
            </div>
          ) : (
            <div className="donut-wrapper">
              <div className="donut-chart" style={{ background: genderGradient }}>
                <div>
                  <strong>{genero != null ? genero.total : "—"}</strong>
                  <span>personas</span>
                </div>
              </div>
              <div className="gender-legend">
                <span>
                  <i className="dot female-dot" />
                  Mujeres {genero != null ? `(${genero.femenino})` : ""}
                </span>
                <span>
                  <i className="dot male-dot" />
                  Hombres {genero != null ? `(${genero.masculino})` : ""}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Agenda / Cumpleaños */}
        <AgendaBirthdayCard cumpleanos={cumpleanos} loading={personasLoading} />

      </div>

      {/* ── Row 3: Cargos · Modalidad flip ── */}
      <div className="dashboard-row bottom-row">

        <div className="dashboard-panel">
          <div className="panel-title">
            <h3>Distribución por Cargos</h3>
            <span className="panel-chip">
              {personasData
                ? `${personasData.total_personas} colaboradores`
                : personasLoading ? "Cargando..." : "—"}
            </span>
          </div>

          {personasLoading ? (
            <div className="hbar-list card-scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>Cargando datos...</span>
            </div>
          ) : personasError ? (
            <div className="hbar-list card-scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--color-danger, #ef4444)", fontSize: "0.75rem", textAlign: "center" }}>
                {personasError}
              </span>
            </div>
          ) : cargos.length === 0 ? (
            <div className="hbar-list card-scroll" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "var(--color-text-muted, #888)", fontSize: "0.8rem" }}>Sin cargos disponibles</span>
            </div>
          ) : (
            <div className="hbar-list card-scroll">
              {cargos.map((item) => (
                <div className="hbar-item" key={item.id}>
                  <span className="hbar-label">{item.label}</span>
                  <div className="hbar-track">
                    <div className="hbar-fill" style={{ width: `${(item.value / maxCargo) * 100}%` }} />
                  </div>
                  <span className="hbar-count">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <ModalityFlipCard
          backSegments={backSegments}
          backLoading={coberturaLoading}
          backError={coberturaError}
        />

      </div>

      {/* ── Row 4: Alertas · Nómina · SST ── */}
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
