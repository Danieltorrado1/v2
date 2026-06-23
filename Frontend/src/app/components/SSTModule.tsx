import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { sstApi } from "../../services/sstApi";
import { getArray, getNumber, getString, fmtNum, fmtPercent, fmtDateLoose } from "../../lib/payloadHelpers";

interface TenantProps {
  empresaId?: number;
  contratoId?: number;
}

function tenantKeyOf(props: TenantProps): string {
  return `${props.empresaId ?? ""}:${props.contratoId ?? ""}`;
}

// ── Mocks de respaldo — uno por sub-módulo, usados solo si su endpoint falla ─
const MOCK_DASHBOARD_GENERAL = {
  resumen: { cumplimiento_general_sst: 78, clasificacion: "BUENO", alertas_total: 6 },
  alertas: { alertas_criticas_total: 1, alertas_altas_total: 2 },
  capacitaciones: { capacitaciones_vigentes: 12 },
  dotacion: { entregas_total: 18, reposiciones_vencidas: 2 },
  examenes: { examenes_vigentes: 9 },
  accidentes: { abiertos: 1 },
  inspecciones: { hallazgos_criticos: 1 },
  riesgos: { riesgos_criticos: 2 },
};

const MOCK_ALERTAS = [
  { id: "1", modulo: "ACCIDENTES", tipo_alerta: "ACCION_VENCIDA", severidad: "CRITICA", titulo: "Acción correctiva vencida", descripcion: "Acción correctiva sin cerrar hace más de 30 días", fecha_alerta: "2026-06-10" },
  { id: "2", modulo: "EXAMENES", tipo_alerta: "EXAMEN_PROXIMO_VENCER", severidad: "ALTA", titulo: "Examen próximo a vencer", descripcion: "Examen ocupacional vence en 15 días", fecha_alerta: "2026-06-15" },
  { id: "3", modulo: "DOTACION", tipo_alerta: "EPP_PROXIMA_REPOSICION", severidad: "MEDIA", titulo: "Reposición de EPP próxima", descripcion: "Casco próximo a reposición", fecha_alerta: "2026-06-18" },
];

const MOCK_CAPACITACIONES = [
  { id: 1, capacitacion: { nombre_capacitacion: "Trabajo en alturas" }, fecha_capacitacion: "2026-02-10", estado_capacitacion: "vigente", persona: { nombre_completo: "María Fernanda Torres Ospina", numero_documento: "1.121.873.256" } },
  { id: 2, capacitacion: { nombre_capacitacion: "Manejo defensivo" }, fecha_capacitacion: "2025-05-20", estado_capacitacion: "vencida", persona: { nombre_completo: "Carmen Alicia Ruiz Moreno", numero_documento: "1.008.342.114" } },
];

const MOCK_DOTACION = [
  { id: 1, item: { nombre_item: "Casco de seguridad" }, persona: { nombre_completo: "Rosa Elvira Jiménez Castro", numero_documento: "1.120.558.447" }, fecha_entrega: "2026-01-15", fecha_proxima_reposicion: "2026-07-15", estado_entrega: "ENTREGADO" },
  { id: 2, item: { nombre_item: "Guantes de carnaza" }, persona: { nombre_completo: "Nohora Stella Ramírez Bernal", numero_documento: "1.118.444.556" }, fecha_entrega: "2025-11-01", fecha_proxima_reposicion: "2026-05-01", estado_entrega: "REPUESTO" },
];

const MOCK_EXAMENES = [
  { id: 1, persona: { nombre_completo: "Luz Marina Pérez Vargas", numero_documento: "1.119.222.333" }, examen: { nombre_examen: "Examen periódico" }, fecha_examen: "2026-03-01", fecha_vencimiento: "2027-03-01", concepto_medico: "APTO", estado_examen: "vigente" },
  { id: 2, persona: { nombre_completo: "Betty Josefina Herrera Pinto", numero_documento: "1.118.444.557" }, examen: { nombre_examen: "Examen de ingreso" }, fecha_examen: "2024-06-10", fecha_vencimiento: "2025-06-10", concepto_medico: "APTO_CON_RESTRICCIONES", estado_examen: "vencido" },
];

const MOCK_ACCIDENTES = [
  { id: 1, persona: { nombre_completo: "Esperanza Mireya Suárez Gil", numero_documento: "1.117.555.888" }, tipo_evento: "INCIDENTE", fecha_evento: "2026-05-22", severidad: "LEVE", estado: "ABIERTO" },
  { id: 2, persona: { nombre_completo: "Operario de Prueba", numero_documento: "999999999" }, tipo_evento: "ACCIDENTE_TRABAJO", fecha_evento: "2026-04-02", severidad: "MODERADO", estado: "CERRADO" },
];

const MOCK_INSPECCIONES = [
  { id: 1, nombre_inspeccion: "Inspección locativa mensual", tipo_inspeccion: "LOCATIVA", fecha_programada: "2026-06-20", estado: "PROGRAMADA" },
  { id: 2, nombre_inspeccion: "Inspección de extintores", tipo_inspeccion: "EXTINTORES", fecha_programada: "2026-05-15", estado: "REALIZADA" },
];

const MOCK_RIESGOS = [
  { id: 1, proceso: "Mantenimiento de praderas", tipo_peligro: "MECANICO", nivel_riesgo: 12, clasificacion_riesgo: "ALTO" },
  { id: 2, proceso: "Ordeño", tipo_peligro: "BIOLOGICO", nivel_riesgo: 20, clasificacion_riesgo: "CRITICO" },
];

const MOCK_PLAN_ANUAL_ACTIVIDADES = [
  { id: 1, actividad: "Capacitación anual en alturas", responsable: "Coordinador SST", fecha_programada: "2026-08-01", estado: "PENDIENTE", porcentaje_avance: 0 },
  { id: 2, actividad: "Simulacro de emergencia", responsable: "Brigada de emergencia", fecha_programada: "2026-03-01", estado: "EJECUTADA", porcentaje_avance: 100 },
];

const MOCK_INDICADORES_HISTORICO = [
  {
    periodo: { nombre_periodo: "2026 - Semestre 1", fecha_inicio: "2026-01-01", fecha_fin: "2026-06-30" },
    accidentalidad: { accidentes_total: 1, incidentes_total: 2 },
    frecuencia: { indice_frecuencia: 1.8 },
    severidad: { indice_severidad: 0.5 },
    indicadores_generales: { cumplimiento_general_sst: 78, clasificacion: "BUENO" },
  },
];

type RowStatus = "loading" | "ready";
type DataSource = "real" | "fallback";

interface ListState {
  status: RowStatus;
  items: unknown[];
  source: DataSource;
}

interface DashboardState {
  status: RowStatus;
  data: unknown;
  source: DataSource;
}

// ── Hooks de datos — cada tab se resuelve de forma independiente ────────────
function useSstList(fetcher: () => Promise<unknown>, mockItems: unknown[], label: string, tenantKey: string): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });

  useEffect(() => {
    let active = true;
    fetcher()
      .then(res => {
        if (!active) return;
        setState({ status: "ready", items: getArray(res, ["items"]), source: "real" });
      })
      .catch(error => {
        if (!active) return;
        console.warn(`[sst] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", items: mockItems, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);

  return state;
}

// Plan anual no expone un listado plano de actividades: se listan los planes y
// se agregan las actividades de cada uno (ambos son endpoints reales del backend).
function usePlanAnualActividades(props: TenantProps): ListState {
  const [state, setState] = useState<ListState>({ status: "loading", items: [], source: "real" });
  const tenantKey = tenantKeyOf(props);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const plansRes = await sstApi.getPlanAnual({ empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 50 });
        const plans = getArray(plansRes, ["items"]);
        const planIds = plans
          .map(plan => getNumber(plan, ["id"]))
          .filter((id): id is number => id !== null);

        if (planIds.length === 0) {
          if (active) setState({ status: "ready", items: [], source: "real" });
          return;
        }

        const results = await Promise.all(
          planIds.map(id => sstApi.getPlanAnualActividades(id, { limit: 100 }).catch(() => null))
        );

        if (!active) return;
        const items = results.flatMap(res => (res ? getArray(res, ["items"]) : []));
        setState({ status: "ready", items, source: "real" });
      } catch (error) {
        if (!active) return;
        console.warn("[sst] plan-anual no disponible, usando fallback mock:", error);
        setState({ status: "ready", items: MOCK_PLAN_ANUAL_ACTIVIDADES, source: "fallback" });
      }
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);

  return state;
}

function useSstDashboard(fetcher: () => Promise<unknown>, mockData: unknown, label: string, tenantKey: string): DashboardState {
  const [state, setState] = useState<DashboardState>({ status: "loading", data: null, source: "real" });

  useEffect(() => {
    let active = true;
    fetcher()
      .then(data => {
        if (!active) return;
        setState({ status: "ready", data, source: "real" });
      })
      .catch(error => {
        if (!active) return;
        console.warn(`[sst] ${label} no disponible, usando fallback mock:`, error);
        setState({ status: "ready", data: mockData, source: "fallback" });
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantKey]);

  return state;
}

// ── UI compartida ────────────────────────────────────────────────────────────
function estadoBadgeClass(estado: string | null): string {
  if (!estado) return "bg-secondary text-muted-foreground border-border";
  const v = estado.toLowerCase();
  if (/(critic|vencid|rechazad|no_apto|mortal|grave|cancelad)/.test(v)) return "bg-red-50 text-red-700 border-red-200";
  if (/(vigente|ejecutad|entregad|cerrad|realizad|buen|excelente|aprobad|repuest)/.test(v)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // pendiente, proxima, abierto, en_proceso, programada, medio...
}

function EstadoBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border ${estadoBadgeClass(estado)}`} style={{ fontWeight: 500 }}>
      {estado}
    </span>
  );
}

function SourceBanner({ source, resource }: { source: DataSource; resource: string }) {
  if (source !== "fallback") return null;
  return (
    <p className="text-[10.5px] mb-2" style={{ color: "#f59e0b", fontWeight: 500 }}>
      ● Sin conexión con /{resource} — mostrando datos de ejemplo
    </p>
  );
}

function TableShell({
  state, resource, headers, renderRow, emptyLabel,
}: {
  state: ListState;
  resource: string;
  headers: string[];
  renderRow: (item: unknown, index: number) => React.ReactNode;
  emptyLabel: string;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Cargando…</span>
      </div>
    );
  }

  return (
    <div>
      <SourceBanner source={state.source} resource={resource} />
      {state.items.length === 0 ? (
        <div className="bg-card rounded-lg border border-border py-10 text-center text-[12px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="border-b border-border">
                {headers.map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-b-0 hover:bg-secondary/20 transition-colors">
                  {renderRow(item, i)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-4 py-2.5 text-[12px] text-foreground whitespace-nowrap ${right ? "text-right" : ""}`}>{children ?? "—"}</td>;
}

function PersonaCell({ item, path = ["persona"] }: { item: unknown; path?: string[] }) {
  const nombre = getString(item, [...path, "nombre_completo"]) ?? "—";
  const documento = getString(item, [...path, "numero_documento"]);
  return (
    <td className="px-4 py-2.5">
      <p className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{nombre}</p>
      {documento && <p className="text-[10px] text-muted-foreground">CC {documento}</p>}
    </td>
  );
}

// ── Resumen — dashboard consolidado ──────────────────────────────────────────
function KpiCard({ label, value, status, source }: { label: string; value: string; status: RowStatus; source: DataSource }) {
  return (
    <div className="bg-card rounded-2xl p-5 flex flex-col gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
      <p className="text-xs text-muted-foreground" style={{ fontWeight: 500 }}>{label}</p>
      {status === "loading" ? (
        <div className="h-7 w-20 rounded-md bg-muted animate-pulse" />
      ) : (
        <p style={{ fontWeight: 700, fontSize: "1.4rem", lineHeight: 1, letterSpacing: "-0.03em" }}>{value}</p>
      )}
      <span
        className="text-[11px]"
        style={{ fontWeight: 500, color: status === "loading" ? "#9ca3af" : source === "fallback" ? "#f59e0b" : "#10b981" }}
      >
        {status === "loading" ? "Cargando…" : source === "fallback" ? "● Estimado (sin datos)" : "● En vivo"}
      </span>
    </div>
  );
}

function ResumenTab(props: TenantProps) {
  const tenantParams = { empresa_id: props.empresaId, contrato_id: props.contratoId };
  const dashboard = useSstDashboard(() => sstApi.getDashboardGeneral(tenantParams), MOCK_DASHBOARD_GENERAL, "dashboard-general", tenantKeyOf(props));
  const { status, data, source } = dashboard;

  const dotacionVigente = (() => {
    const total = getNumber(data, ["dotacion", "entregas_total"]);
    const vencidas = getNumber(data, ["dotacion", "reposiciones_vencidas"]);
    if (total === null) return null;
    return total - (vencidas ?? 0);
  })();

  return (
    <div className="space-y-4">
      {source === "fallback" && status === "ready" && (
        <SourceBanner source="fallback" resource="sst/dashboard-general" />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Cumplimiento general SST" status={status} source={source} value={fmtPercent(getNumber(data, ["resumen", "cumplimiento_general_sst"])) ?? "—"} />
        <KpiCard label="Clasificación" status={status} source={source} value={getString(data, ["resumen", "clasificacion"]) ?? "—"} />
        <KpiCard label="Alertas totales" status={status} source={source} value={fmtNum(getNumber(data, ["resumen", "alertas_total"])) ?? "—"} />
        <KpiCard label="Alertas críticas" status={status} source={source} value={fmtNum(getNumber(data, ["alertas", "alertas_criticas_total"])) ?? "—"} />
        <KpiCard label="Alertas altas" status={status} source={source} value={fmtNum(getNumber(data, ["alertas", "alertas_altas_total"])) ?? "—"} />
        <KpiCard label="Capacitaciones vigentes" status={status} source={source} value={fmtNum(getNumber(data, ["capacitaciones", "capacitaciones_vigentes"])) ?? "—"} />
        <KpiCard label="Dotación vigente" status={status} source={source} value={fmtNum(dotacionVigente) ?? "—"} />
        <KpiCard label="Exámenes vigentes" status={status} source={source} value={fmtNum(getNumber(data, ["examenes", "examenes_vigentes"])) ?? "—"} />
        <KpiCard label="Accidentes abiertos" status={status} source={source} value={fmtNum(getNumber(data, ["accidentes", "abiertos"])) ?? "—"} />
        <KpiCard label="Hallazgos críticos" status={status} source={source} value={fmtNum(getNumber(data, ["inspecciones", "hallazgos_criticos"])) ?? "—"} />
        <KpiCard label="Riesgos críticos" status={status} source={source} value={fmtNum(getNumber(data, ["riesgos", "riesgos_criticos"])) ?? "—"} />
      </div>
    </div>
  );
}

// ── Alertas consolidadas ─────────────────────────────────────────────────────
function AlertasTab(props: TenantProps) {
  const state = useSstList(
    () => sstApi.getDashboardGeneralAlertas({ empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 }),
    MOCK_ALERTAS,
    "alertas consolidadas",
    tenantKeyOf(props)
  );
  return (
    <TableShell
      state={state}
      resource="sst/dashboard-general/alertas"
      headers={["Módulo", "Tipo de alerta", "Severidad", "Título", "Descripción", "Fecha"]}
      emptyLabel="No hay alertas SST activas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["modulo"])}</Td>
          <Td>{getString(item, ["tipo_alerta"])}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["severidad"])} /></td>
          <Td>{getString(item, ["titulo"])}</Td>
          <Td>{getString(item, ["descripcion"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_alerta"]))}</Td>
        </>
      )}
    />
  );
}

// ── Capacitaciones ───────────────────────────────────────────────────────────
function CapacitacionesTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getCapacitacionesPersona(listParams), MOCK_CAPACITACIONES, "capacitaciones", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/capacitaciones-persona"
      headers={["Capacitación", "Fecha", "Estado", "Persona"]}
      emptyLabel="No hay registros de capacitaciones"
      renderRow={item => (
        <>
          <Td>{getString(item, ["capacitacion", "nombre_capacitacion"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_capacitacion"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado_capacitacion"])} /></td>
          <PersonaCell item={item} />
        </>
      )}
    />
  );
}

// ── Dotación / EPP ───────────────────────────────────────────────────────────
function DotacionTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getDotacionEppEntregas(listParams), MOCK_DOTACION, "dotación-epp", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/dotacion-epp-entregas"
      headers={["Ítem", "Persona", "Fecha entrega", "Próxima reposición", "Estado"]}
      emptyLabel="No hay entregas de dotación/EPP registradas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["item", "nombre_item"])}</Td>
          <PersonaCell item={item} />
          <Td>{fmtDateLoose(getString(item, ["fecha_entrega"]))}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_proxima_reposicion"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado_entrega"])} /></td>
        </>
      )}
    />
  );
}

// ── Exámenes ocupacionales ───────────────────────────────────────────────────
function ExamenesTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getExamenesPersona(listParams), MOCK_EXAMENES, "examenes-persona", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/examenes-persona"
      headers={["Persona", "Examen", "Fecha examen", "Fecha vencimiento", "Concepto médico", "Estado"]}
      emptyLabel="No hay exámenes ocupacionales registrados"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{getString(item, ["examen", "nombre_examen"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_examen"]))}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_vencimiento"]))}</Td>
          <Td>{getString(item, ["concepto_medico"])}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado_examen"])} /></td>
        </>
      )}
    />
  );
}

// ── Accidentes / incidentes ──────────────────────────────────────────────────
function AccidentesTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getAccidentes(listParams), MOCK_ACCIDENTES, "accidentes", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/accidentes"
      headers={["Persona", "Tipo de evento", "Fecha del evento", "Severidad", "Estado"]}
      emptyLabel="No hay accidentes o incidentes registrados"
      renderRow={item => (
        <>
          <PersonaCell item={item} />
          <Td>{getString(item, ["tipo_evento"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_evento"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["severidad"])} /></td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

// ── Inspecciones ──────────────────────────────────────────────────────────────
function InspeccionesTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getInspecciones(listParams), MOCK_INSPECCIONES, "inspecciones", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/inspecciones"
      headers={["Inspección", "Tipo", "Fecha programada", "Estado"]}
      emptyLabel="No hay inspecciones registradas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["nombre_inspeccion"])}</Td>
          <Td>{getString(item, ["tipo_inspeccion"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_programada"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
        </>
      )}
    />
  );
}

// ── Matriz de riesgos ────────────────────────────────────────────────────────
function RiesgosTab(props: TenantProps) {
  const listParams = { empresa_id: props.empresaId, contrato_id: props.contratoId, limit: 100 };
  const state = useSstList(() => sstApi.getMatrizRiesgos(listParams), MOCK_RIESGOS, "matriz-riesgos", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/matriz-riesgos"
      headers={["Proceso", "Tipo de peligro", "Nivel de riesgo", "Clasificación"]}
      emptyLabel="No hay riesgos registrados en la matriz"
      renderRow={item => (
        <>
          <Td>{getString(item, ["proceso"])}</Td>
          <Td>{getString(item, ["tipo_peligro"])}</Td>
          <Td right>{fmtNum(getNumber(item, ["nivel_riesgo"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["clasificacion_riesgo"])} /></td>
        </>
      )}
    />
  );
}

// ── Plan anual ────────────────────────────────────────────────────────────────
function PlanAnualTab(props: TenantProps) {
  const state = usePlanAnualActividades(props);
  return (
    <TableShell
      state={state}
      resource="sst/plan-anual/:id/actividades"
      headers={["Actividad", "Responsable", "Fecha programada", "Estado", "% Avance"]}
      emptyLabel="No hay actividades de plan anual registradas"
      renderRow={item => (
        <>
          <Td>{getString(item, ["actividad"])}</Td>
          <Td>{getString(item, ["responsable"])}</Td>
          <Td>{fmtDateLoose(getString(item, ["fecha_programada"]))}</Td>
          <td className="px-4 py-2.5"><EstadoBadge estado={getString(item, ["estado"])} /></td>
          <Td right>{fmtPercent(getNumber(item, ["porcentaje_avance"]))}</Td>
        </>
      )}
    />
  );
}

// ── Indicadores SST ───────────────────────────────────────────────────────────
function IndicadoresTab(props: TenantProps) {
  const tenantParams = { empresa_id: props.empresaId, contrato_id: props.contratoId };
  const state = useSstList(() => sstApi.getIndicadoresHistorico(tenantParams), MOCK_INDICADORES_HISTORICO, "indicadores/historico", tenantKeyOf(props));
  return (
    <TableShell
      state={state}
      resource="sst/indicadores/historico"
      headers={["Periodo", "Accidentalidad", "Frecuencia", "Severidad", "Cumplimiento SST"]}
      emptyLabel="No hay periodos de indicadores SST registrados"
      renderRow={item => (
        <>
          <Td>{getString(item, ["periodo", "nombre_periodo"])}</Td>
          <Td right>
            {fmtNum(getNumber(item, ["accidentalidad", "accidentes_total"]))} acc. / {fmtNum(getNumber(item, ["accidentalidad", "incidentes_total"]))} inc.
          </Td>
          <Td right>{fmtNum(getNumber(item, ["frecuencia", "indice_frecuencia"]))}</Td>
          <Td right>{fmtNum(getNumber(item, ["severidad", "indice_severidad"]))}</Td>
          <td className="px-4 py-2.5">
            <EstadoBadge estado={getString(item, ["indicadores_generales", "clasificacion"])} />
            <span className="ml-1.5 text-[12px] text-foreground">{fmtPercent(getNumber(item, ["indicadores_generales", "cumplimiento_general_sst"]))}</span>
          </td>
        </>
      )}
    />
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
type SstTab =
  | "resumen" | "alertas" | "capacitaciones" | "dotacion" | "examenes"
  | "accidentes" | "inspecciones" | "riesgos" | "plan-anual" | "indicadores";

const TABS: { id: SstTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "alertas", label: "Alertas" },
  { id: "capacitaciones", label: "Capacitaciones" },
  { id: "dotacion", label: "Dotación/EPP" },
  { id: "examenes", label: "Exámenes" },
  { id: "accidentes", label: "Accidentes" },
  { id: "inspecciones", label: "Inspecciones" },
  { id: "riesgos", label: "Riesgos" },
  { id: "plan-anual", label: "Plan anual" },
  { id: "indicadores", label: "Indicadores" },
];

export function SSTModule({ empresaId, contratoId }: TenantProps = {}) {
  const [tab, setTab] = useState<SstTab>("resumen");
  const tenantProps: TenantProps = { empresaId, contratoId };

  return (
    <div className="p-6 space-y-5 max-w-none">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: "1.1rem" }}>Seguridad y Salud en el Trabajo — SST</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Dashboard, alertas y submódulos SST</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-card rounded-2xl flex-wrap" style={{ boxShadow: "var(--shadow-card)" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] transition-all ${tab === t.id ? "bg-foreground text-card" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              style={{ fontWeight: tab === t.id ? 600 : 400 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" && <ResumenTab {...tenantProps} />}
      {tab === "alertas" && <AlertasTab {...tenantProps} />}
      {tab === "capacitaciones" && <CapacitacionesTab {...tenantProps} />}
      {tab === "dotacion" && <DotacionTab {...tenantProps} />}
      {tab === "examenes" && <ExamenesTab {...tenantProps} />}
      {tab === "accidentes" && <AccidentesTab {...tenantProps} />}
      {tab === "inspecciones" && <InspeccionesTab {...tenantProps} />}
      {tab === "riesgos" && <RiesgosTab {...tenantProps} />}
      {tab === "plan-anual" && <PlanAnualTab {...tenantProps} />}
      {tab === "indicadores" && <IndicadoresTab {...tenantProps} />}
    </div>
  );
}
